import { tool } from "@opencode-ai/plugin";
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

const HOME_DIR = process.env.USERPROFILE || "";
const FRAGMENTS_PATH = path.join(HOME_DIR, ".config", "opencode", "fragments.json");
const SYNONYM_MAP_PATH = path.join(HOME_DIR, ".config", "opencode", "associations_map.json");
const MEMORY_MANAGER_PATH = path.join(HOME_DIR, ".agents", "skills", "memory-manager", "memory-manager.js");

function loadSynonymMap() {
    try {
        if (fs.existsSync(SYNONYM_MAP_PATH)) {
            const raw = JSON.parse(fs.readFileSync(SYNONYM_MAP_PATH, "utf-8"));
            const normalized = {};
            for (const [key, value] of Object.entries(raw)) {
                normalized[key.toLowerCase()] = value;
            }
            return normalized;
        }
    } catch (e) {}
    return {};
}

const SYNONYM_MAP = loadSynonymMap();

function extractKeywords(text) {
    const keywords = new Set();
    const processed = new Set();
    
    const addKeyword = (word, allowShort = false) => {
        if (!word || word.length < 2 && !allowShort) return;
        if (processed.has(word)) return;
        processed.add(word);
        keywords.add(word);
        const lower = word.toLowerCase();
        if (SYNONYM_MAP[lower] && SYNONYM_MAP[lower].length > 0) {
            SYNONYM_MAP[lower].forEach(syn => {
                keywords.add(syn);
            });
        }
    };

    const chinesePattern = /[\u4e00-\u9fa5]{2,}/g;
    const chineseWords = text.match(chinesePattern) || [];
    chineseWords.forEach(word => addKeyword(word));

    const englishPattern = /[a-zA-Z][a-zA-Z0-9]*/g;
    const englishWords = (text.match(englishPattern) || []).map(w => w.toLowerCase());
    englishWords.forEach(word => addKeyword(word));

    const singleCharPattern = /[\u4e00-\u9fa5]/g;
    const singleChars = text.match(singleCharPattern) || [];
    const importantChars = ['茶', '水', '酒', '肉', '菜', '饭', '酒', '咖', '啡', '糖', '盐'];
    singleChars.forEach(char => {
        if (importantChars.includes(char)) {
            addKeyword(char, true);
        }
    });

    return Array.from(keywords);
}

function saveSynonymMap(map) {
    try {
        fs.writeFileSync(SYNONYM_MAP_PATH, JSON.stringify(map, null, 2), "utf-8");
        return true;
    } catch (e) {
        return false;
    }
}

function expandQuery(query) {
    const expanded = new Set();
    const lower = query.toLowerCase();
    expanded.add(query);
    expanded.add(lower);
    if (SYNONYM_MAP[lower] && SYNONYM_MAP[lower].length > 0) {
        SYNONYM_MAP[lower].forEach(syn => {
            expanded.add(syn);
            expanded.add(syn.toLowerCase());
        });
    }
    return Array.from(expanded);
}

function reloadSynonymMap() {
    Object.assign(SYNONYM_MAP, loadSynonymMap());
}

const MEMORY_KEYWORD_PATTERNS = [
    /remember/i, /记住/i, /save\s+this/i, /别忘/i, /不要忘/i, /一直用/i, /总是用/i, /偏好/i, /以后都/i
];

const NUDGE_MESSAGE = `[MEMORY TRIGGER DETECTED]

The user wants you to remember something. You MUST automatically save this to long-term memory.

1. Summarize the key information concisely (within 50 characters for preferences, 100 characters for rules)
2. Use the \`memory\` tool to save:
   - For preferences: action="add", category="user.preferences", key="<key>", value="<value>"
   - For rules: action="add", category="strict.rules", value="<rule>"
   - For forbidden commands: action="add", category="strict.forbidden", key="<description>", value="<description>", extra="<pattern>"

Do NOT ask for confirmation. Just save it automatically.`;

function loadMemory() {
    const configPath = path.join(HOME_DIR, ".config", "opencode", "memory.json");
    try {
        if (fs.existsSync(configPath)) {
            return JSON.parse(fs.readFileSync(configPath, "utf-8"));
        }
    } catch (e) {}
    return null;
}

function formatMemoryForPrompt(memory) {
    if (!memory) return "";
    const sections = [];
    sections.push("[LONG-TERM MEMORY]");
    if (memory.user?.preferences) {
        sections.push("\n[USER PREFERENCES]");
        for (const [key, value] of Object.entries(memory.user.preferences)) {
            sections.push(`- ${key}: ${value}`);
        }
        sections.push("[/USER PREFERENCES]");
    }
    if (memory.strict?.forbiddenCommands?.length > 0) {
        sections.push("\n[STRICT - NEVER VIOLATE]");
        for (const cmd of memory.strict.forbiddenCommands) {
            sections.push(`- ${cmd.description}: \`${cmd.pattern}\``);
        }
        if (memory.strict.rules?.length > 0) {
            sections.push("\nStrict Rules:");
            for (const rule of memory.strict.rules) {
                sections.push(`- ${rule}`);
            }
        }
        sections.push("[/STRICT]");
    }
    sections.push("\n[/LONG-TERM MEMORY]");
    return sections.join("\n");
}

function detectMemoryKeyword(text) {
    return MEMORY_KEYWORD_PATTERNS.some(p => p.test(text));
}

function callMemoryManager(args) {
    try {
        return JSON.parse(execSync(`node "${MEMORY_MANAGER_PATH}" ${args.join(" ")}`, { encoding: "utf-8", maxBuffer: 1024 * 1024 }));
    } catch (e) {
        return { success: false, error: e.message };
    }
}

function generateId(prefix = "frag") {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 5)}`;
}

function loadFragments() {
    try {
        if (fs.existsSync(FRAGMENTS_PATH)) {
            const data = JSON.parse(fs.readFileSync(FRAGMENTS_PATH, "utf-8"));
            return data.fragments || [];
        }
    } catch (e) {}
    return [];
}

function saveFragments(fragments) {
    fs.writeFileSync(FRAGMENTS_PATH, JSON.stringify({ fragments }, null, 2), "utf-8");
}

export const opencodeMemoryPlugin = async (input) => {
    const memory = loadMemory();

    return {
        tool: {
            memory: tool({
                description: "管理长期记忆：查看、添加、更新、删除记忆内容",
                args: {
                    action: tool.schema.enum(["view", "add", "update", "delete", "search"]),
                    category: tool.schema.string().optional(),
                    key: tool.schema.string().optional(),
                    value: tool.schema.string().optional(),
                    extra: tool.schema.string().optional(),
                },
                async execute(args) {
                    const cmdArgs = [args.action];
                    if (args.category) cmdArgs.push(args.category);
                    if (args.key) cmdArgs.push(args.key);
                    if (args.value) cmdArgs.push(args.value);
                    if (args.extra) cmdArgs.push(args.extra);
                    return JSON.stringify(callMemoryManager(cmdArgs), null, 2);
                },
            }),
            memory_fragment_add: tool({
                description: "添加记忆碎片（associations将自动从content提取）",
                args: {
                    content: tool.schema.string(),
                    associations: tool.schema.array(tool.schema.string()).optional(),
                    category: tool.schema.string().optional(),
                    layer: tool.schema.enum(["surface", "deep"]).optional(),
                    source: tool.schema.enum(["explicit", "inferred"]).optional(),
                },
                async execute(args) {
                    const id = generateId();
                    const assocs = args.associations?.length > 0 ? args.associations : extractKeywords(args.content);
                    const fragment = {
                        id,
                        content: args.content,
                        category: args.category || "general",
                        layer: args.layer || "surface",
                        weight: 0.5,
                        source: args.source || "explicit",
                        associations: assocs,
                        created_at: new Date().toISOString(),
                        access_count: 0,
                        last_recalled: null,
                        recall_frequency: 0
                    };
                    const fragments = loadFragments();
                    fragments.push(fragment);
                    saveFragments(fragments);
                    return JSON.stringify({ success: true, id, fragment }, null, 2);
                },
            }),
            memory_fragment_search: tool({
                description: "搜索记忆碎片（带温度随机性和同义词扩展）",
                args: {
                    query: tool.schema.string(),
                    temperature: tool.schema.number().optional(),
                    limit: tool.schema.number().optional(),
                    layer: tool.schema.enum(["surface", "deep"]).optional(),
                    weight_threshold: tool.schema.number().optional(),
                },
                async execute(args) {
                    const { query, temperature = 0.5, limit = 5, layer, weight_threshold = 0.2 } = args;
                    let fragments = loadFragments();
                    if (layer) fragments = fragments.filter(f => f.layer === layer);
                    fragments = fragments.filter(f => f.weight >= weight_threshold);

                    const expandedQueries = expandQuery(query);
                    const scored = fragments.map(f => {
                        let matchScore = 0;
                        let matchedTerms = [];
                        for (const q of expandedQueries) {
                            if (f.content.toLowerCase().includes(q)) {
                                matchScore += 1;
                                matchedTerms.push(q);
                            }
                            for (const a of (f.associations || [])) {
                                if (a.toLowerCase().includes(q)) {
                                    matchScore += 0.8;
                                    matchedTerms.push(a);
                                }
                            }
                        }
                        return { ...f, matchScore, matchedTerms: [...new Set(matchedTerms)] };
                    }).filter(f => f.matchScore > 0);

                    scored.sort((a, b) => b.matchScore - a.matchScore);
                    const selected = [];
                    for (let i = 0; i < Math.min(scored.length, limit * 2); i++) {
                        const f = scored[i];
                        const prob = f.weight * (1 - temperature * 0.5) + Math.random() * temperature * 0.5;
                        if (prob > weight_threshold || selected.length < limit) {
                            if (selected.length < limit) {
                                selected.push(f);
                                updateRecall(f.id);
                            }
                        }
                    }
                    selected.sort((a, b) => b.weight - a.weight);
                    return JSON.stringify({ success: true, results: selected.slice(0, limit) }, null, 2);
                },
            }),
            memory_fragment_stats: tool({
                description: "查看碎片统计",
                args: {},
                async execute() {
                    const fragments = loadFragments();
                    const by_layer = { deep: 0, surface: 0 };
                    const by_category = {};
                    let totalWeight = 0;
                    let totalFreq = 0;
                    for (const f of fragments) {
                        by_layer[f.layer || "surface"]++;
                        const cat = f.category || "general";
                        by_category[cat] = (by_category[cat] || 0) + 1;
                        totalWeight += f.weight || 0.5;
                        totalFreq += f.recall_frequency || 0;
                    }
                    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
                    const unused_over_30days = fragments.filter(f => !f.last_recalled || new Date(f.last_recalled) < thirtyDaysAgo).length;
                    return JSON.stringify({
                        success: true,
                        stats: {
                            total: fragments.length,
                            by_layer,
                            by_category,
                            avg_weight: fragments.length ? totalWeight / fragments.length : 0,
                            avg_recall_frequency: fragments.length ? totalFreq / fragments.length : 0,
                            unused_over_30days
                        }
                    }, null, 2);
                },
            }),
            memory_fragment_view: tool({
                description: "查看碎片列表",
                args: {
                    category: tool.schema.string().optional(),
                    layer: tool.schema.string().optional(),
                },
                async execute(args) {
                    let fragments = loadFragments();
                    if (args.category) fragments = fragments.filter(f => f.category === args.category);
                    if (args.layer) fragments = fragments.filter(f => f.layer === args.layer);
                    return JSON.stringify({ success: true, fragments }, null, 2);
                },
            }),
            memory_fragment_delete: tool({
                description: "删除碎片",
                args: { id: tool.schema.string() },
                async execute(args) {
                    const fragments = loadFragments();
                    const idx = fragments.findIndex(f => f.id === args.id);
                    if (idx === -1) return JSON.stringify({ success: false, error: "Fragment not found" }, null, 2);
                    fragments.splice(idx, 1);
                    saveFragments(fragments);
                    return JSON.stringify({ success: true }, null, 2);
                },
            }),
            memory_fragment_update: tool({
                description: "更新碎片",
                args: {
                    id: tool.schema.string(),
                    content: tool.schema.string().optional(),
                    category: tool.schema.string().optional(),
                    layer: tool.schema.enum(["surface", "deep"]).optional(),
                    weight: tool.schema.number().optional(),
                    source: tool.schema.enum(["explicit", "inferred"]).optional(),
                },
                async execute(args) {
                    const fragments = loadFragments();
                    const idx = fragments.findIndex(f => f.id === args.id);
                    if (idx === -1) return JSON.stringify({ success: false, error: "Fragment not found" }, null, 2);
                    const frag = fragments[idx];
                    if (args.content !== undefined) {
                        frag.content = args.content;
                        frag.associations = extractKeywords(args.content);
                    }
                    if (args.category !== undefined) frag.category = args.category;
                    if (args.layer !== undefined) frag.layer = args.layer;
                    if (args.weight !== undefined) frag.weight = args.weight;
                    if (args.source !== undefined) frag.source = args.source;
                    saveFragments(fragments);
                    return JSON.stringify({ success: true, fragment: frag }, null, 2);
                },
            }),
            memory_fragment_compact: tool({
                description: "整理碎片数据库",
                args: {
                    mode: tool.schema.enum(["gentle", "auto", "aggressive"]).optional(),
                    unused_days: tool.schema.number().optional(),
                },
                async execute(args) {
                    const { mode = "gentle", unused_days = 30 } = args;
                    const fragments = loadFragments();
                    const threshold = new Date(Date.now() - unused_days * 24 * 60 * 60 * 1000);
                    const deleted = [];
                    const remaining = fragments.filter(f => {
                        const shouldDelete = f.weight < 0.1 && (!f.last_recalled || new Date(f.last_recalled) < threshold);
                        if (shouldDelete) deleted.push({ id: f.id, reason: "low_weight_and_unused" });
                        return !shouldDelete;
                    });
                    if (mode !== "gentle") {
                        const threshold2 = new Date(Date.now() - unused_days * 2 * 24 * 60 * 60 * 1000);
                        const remaining2 = remaining.filter(f => {
                            if (!f.last_recalled && new Date(f.created_at) < threshold2) {
                                deleted.push({ id: f.id, reason: "unused_over_60days" });
                                return false;
                            }
                            return true;
                        });
                        saveFragments(remaining2);
                        return JSON.stringify({ success: true, report: { mode, before_count: fragments.length, deleted_count: deleted.length, after_count: remaining2.length, deleted_fragments: deleted } }, null, 2);
                    }
                    saveFragments(remaining);
                    return JSON.stringify({ success: true, report: { mode, before_count: fragments.length, deleted_count: deleted.length, after_count: remaining.length, deleted_fragments: deleted } }, null, 2);
                },
            }),
            synonym_map_view: tool({
                description: "查看同义词映射表",
                args: {},
                async execute() {
                    const map = loadSynonymMap();
                    return JSON.stringify({ success: true, map }, null, 2);
                },
            }),
            synonym_map_add: tool({
                description: "添加同义词映射",
                args: {
                    key: tool.schema.string(),
                    synonyms: tool.schema.array(tool.schema.string()),
                },
                async execute(args) {
                    const map = loadSynonymMap();
                    if (map[args.key]) {
                        map[args.key] = [...new Set([...map[args.key], ...args.synonyms])];
                    } else {
                        map[args.key] = args.synonyms;
                    }
                    if (saveSynonymMap(map)) {
                        reloadSynonymMap();
                        return JSON.stringify({ success: true, message: `Added synonyms for "${args.key}"`, key: args.key, synonyms: map[args.key] }, null, 2);
                    }
                    return JSON.stringify({ success: false, error: "Failed to save" }, null, 2);
                },
            }),
            synonym_map_delete: tool({
                description: "删除同义词映射",
                args: {
                    key: tool.schema.string(),
                },
                async execute(args) {
                    const map = loadSynonymMap();
                    if (map[args.key]) {
                        delete map[args.key];
                        if (saveSynonymMap(map)) {
                            reloadSynonymMap();
                            return JSON.stringify({ success: true, message: `Deleted key "${args.key}"` }, null, 2);
                        }
                        return JSON.stringify({ success: false, error: "Failed to save" }, null, 2);
                    }
                    return JSON.stringify({ success: false, error: `Key "${args.key}" not found` }, null, 2);
                },
            }),
            synonym_map_update: tool({
                description: "更新同义词映射（完全替换）",
                args: {
                    key: tool.schema.string(),
                    synonyms: tool.schema.array(tool.schema.string()),
                },
                async execute(args) {
                    const map = loadSynonymMap();
                    map[args.key] = args.synonyms;
                    if (saveSynonymMap(map)) {
                        reloadSynonymMap();
                        return JSON.stringify({ success: true, message: `Updated "${args.key}"`, key: args.key, synonyms: map[args.key] }, null, 2);
                    }
                    return JSON.stringify({ success: false, error: "Failed to save" }, null, 2);
                },
            }),
        },
        "experimental.chat.system.transform": async (chatInput, output) => {
            if (!memory) return;
            const ctx = formatMemoryForPrompt(memory);
            if (ctx) output.system.push(ctx);
        },
        "chat.message": async (chatInput, output) => {
            if (!memory) return;
            const texts = output.parts.filter(p => p.type === "text").map(p => p.text).join("\n");
            if (detectMemoryKeyword(texts)) {
                output.parts.push({
                    id: "nudge_" + Date.now(),
                    sessionID: chatInput.sessionID,
                    messageID: output.message.id,
                    type: "text",
                    text: NUDGE_MESSAGE,
                    synthetic: true,
                });
            }
        },
    };
};

function updateRecall(id) {
    const fragments = loadFragments();
    const idx = fragments.findIndex(f => f.id === id);
    if (idx !== -1) {
        fragments[idx].last_recalled = new Date().toISOString();
        fragments[idx].access_count = (fragments[idx].access_count || 0) + 1;
        fragments[idx].recall_frequency = (fragments[idx].recall_frequency || 0) + 1;
        saveFragments(fragments);
    }
}