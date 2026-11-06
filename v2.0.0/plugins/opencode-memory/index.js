import { Plugin } from "@opencode/plugin";
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const HOME_DIR = process.env.USERPROFILE || process.env.HOME || "";
const CONFIG_DIR = path.join(HOME_DIR, ".config", "opencode");
const PLUGIN_DIR = path.dirname(fileURLToPath(import.meta.url));

const FRAGMENTS_PATH = path.join(CONFIG_DIR, "fragments.json");
const SYNONYM_MAP_PATH = path.join(CONFIG_DIR, "associations_map.json");
const MEMORY_PATH = path.join(CONFIG_DIR, "memory.json");
const FRAGMENT_CONFIG_PATH = path.join(PLUGIN_DIR, "fragment-config.json");
const EXTERNAL_DIR = path.join(PLUGIN_DIR, "external");
const MANUAL_PATH = path.join(PLUGIN_DIR, "manual.json");
const README_PATH = path.join(PLUGIN_DIR, "README.md");
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

    // 1. 提取中文词组 (≥2字)
    const chinesePattern = /[\u4e00-\u9fa5]{2,}/g;
    const chineseWords = text.match(chinesePattern) || [];
    chineseWords.forEach(word => addKeyword(word));

    // 2. 提取英文单词
    const englishPattern = /[a-zA-Z][a-zA-Z0-9]*/g;
    const englishWords = (text.match(englishPattern) || []).map(w => w.toLowerCase());
    englishWords.forEach(word => addKeyword(word));

    // 3. 提取单字名词（常见物体词）
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
    
    // 拆分查询词
    const words = query.split(/\s+/);
    for (const word of words) {
        if (!word) continue;
        expanded.add(word);
        expanded.add(word.toLowerCase());
        const lower = word.toLowerCase();
        if (SYNONYM_MAP[lower] && SYNONYM_MAP[lower].length > 0) {
            SYNONYM_MAP[lower].forEach(syn => {
                expanded.add(syn);
                expanded.add(syn.toLowerCase());
            });
        }
    }
    
    // 整句查询
    expanded.add(query);
    expanded.add(query.toLowerCase());
    const fullLower = query.toLowerCase();
    if (SYNONYM_MAP[fullLower] && SYNONYM_MAP[fullLower].length > 0) {
        SYNONYM_MAP[fullLower].forEach(syn => {
            expanded.add(syn);
            expanded.add(syn.toLowerCase());
        });
    }
    
    return Array.from(expanded);
}

function reloadSynonymMap() {
    Object.assign(SYNONYM_MAP, loadSynonymMap());
}

function analyzeAndAddMappings(associations) {
    const map = loadSynonymMap();
    const assocArr = (associations || []).map(a => a.toLowerCase());
    
    const englishTerms = assocArr.filter(t => /^[a-zA-Z]/.test(t) && t.length >= 2);
    const chineseTerms = assocArr.filter(t => /^[\u4e00-\u9fa5]{2,}$/.test(t));
    
    let addedCount = 0;
    for (const en of englishTerms) {
        for (const zh of chineseTerms) {
            if (en !== zh && !map[en]) {
                map[en] = [zh];
                addedCount++;
            }
        }
    }
    
    if (addedCount > 0) {
        saveSynonymMap(map);
        reloadSynonymMap();
    }
    return addedCount;
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
    try {
        if (fs.existsSync(MEMORY_PATH)) {
            return JSON.parse(fs.readFileSync(MEMORY_PATH, "utf-8"));
        }
    } catch (e) {}
    return {
        version: 2,
        user: { preferences: {} },
        strict: { forbiddenCommands: [], rules: [] },
        projects: {}
    };
}

function saveMemory(memory) {
    try {
        fs.writeFileSync(MEMORY_PATH, JSON.stringify(memory, null, 2), "utf-8");
        return true;
    } catch (e) {
        return false;
    }
}

function formatMemoryForPrompt(mem) {
    if (!mem) return "";
    const sections = [];
    sections.push("[LONG-TERM MEMORY]");
    if (mem.user?.preferences) {
        sections.push("\n[USER PREFERENCES]");
        for (const [key, value] of Object.entries(mem.user.preferences)) {
            sections.push(`- ${key}: ${value}`);
        }
        sections.push("[/USER PREFERENCES]");
    }
    const hasForbidden = mem.strict?.forbiddenCommands?.length > 0;
    const hasRules = mem.strict?.rules?.length > 0;
    if (hasForbidden || hasRules) {
        sections.push("\n[STRICT - NEVER VIOLATE]");
        if (hasForbidden) {
            for (const cmd of mem.strict.forbiddenCommands) {
                sections.push(`- ${cmd.description}: \`${cmd.pattern}\``);
            }
        }
        if (hasRules) {
            sections.push("\nStrict Rules:");
            for (const rule of mem.strict.rules) {
                sections.push(`- ${rule}`);
            }
        }
        sections.push("[/STRICT]");
    }
    sections.push("\n[/LONG-TERM MEMORY]");
    return sections.join("\n");
}

function generateMemId(prefix = "mem") {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 5)}`;
}

function detectMemoryKeyword(text) {
    return MEMORY_KEYWORD_PATTERNS.some(p => p.test(text));
}

function callMemoryManager(args) {
    return { success: false, error: "Deprecated: use fs-based memory operations" };
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

function loadFragmentConfig() {
    try {
        if (fs.existsSync(FRAGMENT_CONFIG_PATH)) {
            return JSON.parse(fs.readFileSync(FRAGMENT_CONFIG_PATH, "utf-8"));
        }
    } catch (e) {}
    return { json_max_count: 200, cold_data_days: 30, cold_data_age_days: 60, last_compact: null };
}

// ===== V2 工具 Schema 辅助 =====
// V2 使用标准 JSON Schema 描述工具入参；工具执行结果统一返回 { content }。
function objectSchema(properties = {}, required = []) {
    return { type: "object", properties, required, additionalProperties: false };
}

function stringSchema(description) {
    return { type: "string", ...(description ? { description } : {}) };
}

function numberSchema(description) {
    return { type: "number", ...(description ? { description } : {}) };
}

function enumSchema(values, description) {
    return { type: "string", enum: values, ...(description ? { description } : {}) };
}

function stringArraySchema(description) {
    return { type: "array", items: { type: "string" }, ...(description ? { description } : {}) };
}

function textResult(value) {
    return { content: typeof value === "string" ? value : JSON.stringify(value, null, 2) };
}

export default Plugin.define({
    id: "opencode-memory",
    async setup(ctx) {
        // 支持在 opencode.json 的 plugins 条目里通过 options.enabled 控制开关：
        // 传 { "enabled": false } 时不注册任何工具、不注入记忆，等价于完全禁用该插件。
        // 未配置 options 时默认启用。
        if (ctx.options?.enabled === false) return;

        await ctx.tool.transform((editor) => {
            editor.add({
                name: "memory",
                description: "管理 memory.json 系统配置（用户偏好、安全规则、项目）",
                input: objectSchema({
                    action: enumSchema(["view", "add", "update", "delete", "search"]),
                    category: stringSchema(),
                    key: stringSchema(),
                    value: stringSchema(),
                    extra: stringSchema(),
                }, ["action"]),
                async execute(args) {
                    let mem = loadMemory();
                    const { action, category, key, value, extra } = args;

                    if (action === "view") {
                        if (!category || category === "all") {
                            return textResult(JSON.stringify({ success: true, data: mem }, null, 2));
                        } else if (category === "user") {
                            return textResult(JSON.stringify({ success: true, data: mem.user }, null, 2));
                        } else if (category === "user.preferences") {
                            return textResult(JSON.stringify({ success: true, data: mem.user?.preferences ?? {} }, null, 2));
                        } else if (category === "strict") {
                            return textResult(JSON.stringify({ success: true, data: mem.strict }, null, 2));
                        } else if (category === "projects") {
                            return textResult(JSON.stringify({ success: true, data: mem.projects }, null, 2));
                        } else if (category.startsWith("user.preferences.")) {
                            const prefKey = category.replace("user.preferences.", "");
                            return textResult(JSON.stringify({ success: true, data: mem.user?.preferences?.[prefKey] ?? null }, null, 2));
                        } else if (category.startsWith("projects.")) {
                            const projKey = category.replace("projects.", "");
                            return textResult(JSON.stringify({ success: true, data: mem.projects?.[projKey] ?? null }, null, 2));
                        }
                        return textResult(JSON.stringify({ success: false, error: `Unknown category: ${category}` }, null, 2));
                    }

                    if (action === "add") {
                        // strict.rules / strict.forbidden 用 value 承载内容，不需要 key；
                        // user.preferences 与 projects.* 仍然需要 key 作为键名。
                        const needsKey = category === "user.preferences" || category === "projects" || (typeof category === "string" && category.startsWith("projects."));
                        if (!category || !value) {
                            return textResult(JSON.stringify({ success: false, error: "Missing required params: category, value" }, null, 2));
                        }
                        if (needsKey && !key) {
                            return textResult(JSON.stringify({ success: false, error: `Missing required param for ${category}: key` }, null, 2));
                        }
                        if (category === "user.preferences") {
                            if (!mem.user.preferences) mem.user.preferences = {};
                            mem.user.preferences[key] = value;
                        } else if (category === "strict.rules") {
                            if (!mem.strict.rules) mem.strict.rules = [];
                            mem.strict.rules.push(value);
                        } else if (category === "strict.forbidden") {
                            if (!mem.strict.forbiddenCommands) mem.strict.forbiddenCommands = [];
                            mem.strict.forbiddenCommands.push({ id: generateMemId("forbid"), pattern: extra || "", description: value, severity: "critical" });
                        } else if (category === "projects") {
                            if (!mem.projects) mem.projects = {};
                            mem.projects[key] = value;
                        } else if (category.startsWith("projects.")) {
                            const projKey = category.replace("projects.", "");
                            if (!mem.projects) mem.projects = {};
                            mem.projects[projKey] = value;
                        } else {
                            return textResult(JSON.stringify({ success: false, error: `Unknown category: ${category}` }, null, 2));
                        }
                        if (saveMemory(mem)) {
                            return textResult(JSON.stringify({ success: true, message: `Added ${key ?? value} to ${category}` }, null, 2));
                        }
                        return textResult(JSON.stringify({ success: false, error: "Failed to save" }, null, 2));
                    }

                    if (action === "update") {
                        if (!category || !key || !value) {
                            return textResult(JSON.stringify({ success: false, error: "Missing required params: category, key, value" }, null, 2));
                        }
                        if (category === "user.preferences" && mem.user.preferences && key in mem.user.preferences) {
                            mem.user.preferences[key] = value;
                            if (saveMemory(mem)) return textResult(JSON.stringify({ success: true, message: `Updated ${key}` }, null, 2));
                            return textResult(JSON.stringify({ success: false, error: "Failed to save" }, null, 2));
                        } else if (category === "projects" && mem.projects && key in mem.projects) {
                            mem.projects[key] = value;
                            if (saveMemory(mem)) return textResult(JSON.stringify({ success: true, message: `Updated project ${key}` }, null, 2));
                            return textResult(JSON.stringify({ success: false, error: "Failed to save" }, null, 2));
                        }
                        return textResult(JSON.stringify({ success: false, error: `Key not found: ${key}` }, null, 2));
                    }

                    if (action === "delete") {
                        if (!category || !key) {
                            return textResult(JSON.stringify({ success: false, error: "Missing required params: category, key" }, null, 2));
                        }
                        if (category === "strict.rules" && mem.strict.rules) {
                            const idx = mem.strict.rules.indexOf(key);
                            if (idx !== -1) {
                                mem.strict.rules.splice(idx, 1);
                                if (saveMemory(mem)) return textResult(JSON.stringify({ success: true, message: `Deleted rule: ${key}` }, null, 2));
                                return textResult(JSON.stringify({ success: false, error: "Failed to save" }, null, 2));
                            }
                            return textResult(JSON.stringify({ success: false, error: `Rule not found: ${key}` }, null, 2));
                        }
                        if (category === "strict.forbidden" && mem.strict.forbiddenCommands) {
                            const idx = mem.strict.forbiddenCommands.findIndex(c => c.id === key);
                            if (idx !== -1) {
                                const deleted = mem.strict.forbiddenCommands.splice(idx, 1)[0];
                                if (saveMemory(mem)) return textResult(JSON.stringify({ success: true, message: `Deleted forbidden: ${deleted.description}` }, null, 2));
                                return textResult(JSON.stringify({ success: false, error: "Failed to save" }, null, 2));
                            }
                            return textResult(JSON.stringify({ success: false, error: `Forbidden command not found: ${key}` }, null, 2));
                        }
                        if (category === "user.preferences" && mem.user?.preferences && key in mem.user.preferences) {
                            delete mem.user.preferences[key];
                            if (saveMemory(mem)) return textResult(JSON.stringify({ success: true, message: `Deleted user.preferences.${key}` }, null, 2));
                            return textResult(JSON.stringify({ success: false, error: "Failed to save" }, null, 2));
                        }
                        if (category.startsWith("user.preferences.")) {
                            const prefKey = category.replace("user.preferences.", "");
                            if (mem.user?.preferences && prefKey in mem.user.preferences) {
                                delete mem.user.preferences[prefKey];
                                if (saveMemory(mem)) return textResult(JSON.stringify({ success: true, message: `Deleted user.preferences.${prefKey}` }, null, 2));
                                return textResult(JSON.stringify({ success: false, error: "Failed to save" }, null, 2));
                            }
                            return textResult(JSON.stringify({ success: false, error: `Preference key not found: ${prefKey}` }, null, 2));
                        }
                        if (category === "projects" && mem.projects && key in mem.projects) {
                            delete mem.projects[key];
                            if (saveMemory(mem)) return textResult(JSON.stringify({ success: true, message: `Deleted projects.${key}` }, null, 2));
                            return textResult(JSON.stringify({ success: false, error: "Failed to save" }, null, 2));
                        }
                        return textResult(JSON.stringify({ success: false, error: `Unknown category or key not found: ${category}/${key}` }, null, 2));
                    }

                    if (action === "search") {
                        if (!key) {
                            return textResult(JSON.stringify({ success: false, error: "Missing required param: key (query)" }, null, 2));
                        }
                        const queryLower = key.toLowerCase();
                        const matches = [];
                        if (mem.user?.preferences) {
                            for (const [k, v] of Object.entries(mem.user.preferences)) {
                                if (k.toLowerCase().includes(queryLower) || String(v).toLowerCase().includes(queryLower)) {
                                    matches.push(`user.preferences.${k}: ${v}`);
                                }
                            }
                        }
                        if (mem.strict?.rules) {
                            for (const rule of mem.strict.rules) {
                                if (rule.toLowerCase().includes(queryLower)) matches.push(`strict.rules: ${rule}`);
                            }
                        }
                        if (mem.strict?.forbiddenCommands) {
                            for (const cmd of mem.strict.forbiddenCommands) {
                                if (cmd.description.toLowerCase().includes(queryLower) || cmd.pattern.toLowerCase().includes(queryLower)) {
                                    matches.push(`strict.forbidden.${cmd.id}: ${cmd.description} (${cmd.pattern})`);
                                }
                            }
                        }
                        if (mem.projects) {
                            for (const [k, v] of Object.entries(mem.projects)) {
                                if (k.toLowerCase().includes(queryLower) || String(v).toLowerCase().includes(queryLower)) {
                                    matches.push(`projects.${k}: ${v}`);
                                }
                            }
                        }
                        return textResult(JSON.stringify({ success: true, data: matches }, null, 2));
                    }

                    return textResult(JSON.stringify({ success: false, error: "Unknown action" }, null, 2));
                },
            });

            editor.add({
                name: "memory_fragment_add",
                description: "添加记忆碎片（associations将自动从content提取）。同时自动调用synonym_map_add将中英文关键词添加到同义词映射表。",
                input: objectSchema({
                    content: stringSchema("记忆内容"),
                    associations: stringArraySchema("关键词数组，用于搜索匹配（可选，默认自动提取）"),
                    category: stringSchema("分类，默认 general"),
                    layer: enumSchema(["surface", "deep"], "记忆层，默认 surface"),
                    source: enumSchema(["explicit", "inferred"], "来源，默认 explicit"),
                }, ["content"]),
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
                    const mappingsAdded = analyzeAndAddMappings(assocs);
                    return textResult(JSON.stringify({ success: true, id, fragment, mappingsAdded }, null, 2));
                },
            });

            editor.add({
                name: "memory_fragment_search",
                description: "搜索记忆碎片（带温度随机性和同义词扩展）",
                input: objectSchema({
                    query: stringSchema("搜索关键词"),
                    temperature: numberSchema("随机性 0-1，默认 0.5"),
                    limit: numberSchema("返回数量，默认 5"),
                    layer: enumSchema(["surface", "deep"], "只搜索指定层（可选）"),
                    weight_threshold: numberSchema("权重下限，默认 0.2"),
                }, ["query"]),
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
                    return textResult(JSON.stringify({ success: true, results: selected.slice(0, limit) }, null, 2));
                },
            });

            editor.add({
                name: "memory_fragment_stats",
                description: "查看碎片统计",
                input: objectSchema(),
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
                    return textResult(JSON.stringify({
                        success: true,
                        stats: {
                            total: fragments.length,
                            by_layer,
                            by_category,
                            avg_weight: fragments.length ? totalWeight / fragments.length : 0,
                            avg_recall_frequency: fragments.length ? totalFreq / fragments.length : 0,
                            unused_over_30days
                        }
                    }, null, 2));
                },
            });

            editor.add({
                name: "memory_fragment_view",
                description: "查看碎片列表",
                input: objectSchema({
                    category: stringSchema("按分类筛选（可选）"),
                    layer: stringSchema("按层筛选（可选）"),
                }),
                async execute(args) {
                    let fragments = loadFragments();
                    if (args.category) fragments = fragments.filter(f => f.category === args.category);
                    if (args.layer) fragments = fragments.filter(f => f.layer === args.layer);
                    return textResult(JSON.stringify({ success: true, fragments }, null, 2));
                },
            });

            editor.add({
                name: "memory_fragment_delete",
                description: "删除碎片",
                input: objectSchema({ id: stringSchema("碎片 ID") }, ["id"]),
                async execute(args) {
                    const fragments = loadFragments();
                    const idx = fragments.findIndex(f => f.id === args.id);
                    if (idx === -1) return textResult(JSON.stringify({ success: false, error: "Fragment not found" }, null, 2));
                    fragments.splice(idx, 1);
                    saveFragments(fragments);
                    return textResult(JSON.stringify({ success: true }, null, 2));
                },
            });

            editor.add({
                name: "memory_fragment_update",
                description: "更新碎片",
                input: objectSchema({
                    id: stringSchema("碎片 ID"),
                    content: stringSchema("新内容（可选）"),
                    category: stringSchema("分类（可选）"),
                    layer: enumSchema(["surface", "deep"], "层（可选）"),
                    weight: numberSchema("权重 0-1（可选）"),
                    source: enumSchema(["explicit", "inferred"], "来源（可选）"),
                }, ["id"]),
                async execute(args) {
                    const fragments = loadFragments();
                    const idx = fragments.findIndex(f => f.id === args.id);
                    if (idx === -1) return textResult(JSON.stringify({ success: false, error: "Fragment not found" }, null, 2));
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
                    return textResult(JSON.stringify({ success: true, fragment: frag }, null, 2));
                },
            });

            editor.add({
                name: "memory_fragment_compact",
                description: "整理碎片数据库（调用外部脚本将冷数据归档到SQLite）",
                input: objectSchema({
                    mode: enumSchema(["gentle", "auto", "aggressive"], "整理强度，默认 auto"),
                }),
                async execute(args) {
                    const mode = args.mode || "auto";
                    const scriptPath = path.join(EXTERNAL_DIR, "fragment-compactor.js");
                    const cmd = `node "${scriptPath}" "${mode}"`;
                    try {
                        const result = execSync(cmd, { encoding: "utf-8" });
                        return textResult(result.trim());
                    } catch (e) {
                        return textResult(JSON.stringify({ success: false, error: e.message }, null, 2));
                    }
                },
            });

            editor.add({
                name: "memory_fragment_restore",
                description: "从SQLite归档恢复碎片（附加功能）",
                input: objectSchema({
                    action: enumSchema(["id", "query", "list"]),
                    param: stringSchema("ID 或关键词"),
                    limit: numberSchema("返回数量，默认 20"),
                }, ["action"]),
                async execute(args) {
                    const { action, param, limit } = args;
                    const scriptPath = path.join(EXTERNAL_DIR, "fragment-restorer.js");
                    let cmd;
                    if (action === "id") {
                        cmd = `node "${scriptPath}" id "${param}"`;
                    } else if (action === "query") {
                        cmd = `node "${scriptPath}" query "${param}"`;
                    } else if (action === "list") {
                        cmd = `node "${scriptPath}" list ${limit || 20}`;
                    } else {
                        return textResult(JSON.stringify({ success: false, error: "Unknown action. Use: id, query, list" }, null, 2));
                    }
                    try {
                        const result = execSync(cmd, { encoding: "utf-8" });
                        return textResult(result.trim());
                    } catch (e) {
                        return textResult(JSON.stringify({ success: false, error: e.message }, null, 2));
                    }
                },
            });

            editor.add({
                name: "memory_fragment_archive_status",
                description: "查看碎片归档状态（当前数量、配置、上次整理时间等）",
                input: objectSchema(),
                async execute() {
                    const fragments = loadFragments();
                    const config = loadFragmentConfig();
                    const now = new Date();
                    let daysSinceCompact = null;
                    let suggestion = null;
                    if (config.last_compact) {
                        const lastCompact = new Date(config.last_compact);
                        daysSinceCompact = Math.floor((now - lastCompact) / (1000 * 60 * 60 * 24));
                        if (daysSinceCompact > 30) {
                            suggestion = "建议执行碎片整理";
                        }
                    } else {
                        suggestion = "从未整理过，建议执行碎片整理";
                    }
                    if (fragments.length >= config.json_max_count) {
                        suggestion = "碎片数量已达上限，建议执行碎片整理";
                    }
                    return textResult(JSON.stringify({
                        success: true,
                        status: {
                            current_count: fragments.length,
                            json_max_count: config.json_max_count,
                            cold_data_days: config.cold_data_days,
                            cold_data_age_days: config.cold_data_age_days,
                            last_compact: config.last_compact,
                            days_since_compact: daysSinceCompact,
                            suggestion: suggestion
                        }
                    }, null, 2));
                },
            });

            editor.add({
                name: "memory_fragment_diagnosis",
                description: "诊断记忆状态，输出配置文件、碎片统计、饼图和AI建议",
                input: objectSchema(),
                async execute() {
                    const fragments = loadFragments();
                    const config = loadFragmentConfig();

                    const now = new Date();
                    let daysSinceCompact = null;
                    let lastCompactFormatted = "从未清理";
                    if (config.last_compact) {
                        const lastCompact = new Date(config.last_compact);
                        daysSinceCompact = Math.floor((now - lastCompact) / (1000 * 60 * 60 * 24));
                        const dateStr = config.last_compact.split("T")[0];
                        const daysStr = daysSinceCompact === 0 ? "今天" : `${daysSinceCompact}天前`;
                        lastCompactFormatted = `${dateStr} (${daysStr})`;
                    }

                    const totalFragments = fragments.length;
                    const categoryStats = {};
                    fragments.forEach(f => {
                        const cat = f.category || "general";
                        categoryStats[cat] = (categoryStats[cat] || 0) + 1;
                    });

                    const sortedCategories = Object.entries(categoryStats)
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 5);

                    const maxWidth = 20;
                    let pieChart = "\n";
                    sortedCategories.forEach(([cat, count]) => {
                        const percentage = totalFragments > 0 ? Math.round((count / totalFragments) * 100) : 0;
                        const barLength = totalFragments > 0 ? Math.round((count / totalFragments) * maxWidth) : 0;
                        const bar = "█".repeat(barLength) + "░".repeat(maxWidth - barLength);
                        pieChart += `${bar} ${percentage}% ${cat} (${count}条)\n`;
                    });

                    let statusIcon = "✅";
                    let statusText = "无需清理";
                    let suggestion = "当前状态很不错，保持即可。";

                    if (!config.last_compact) {
                        suggestion = "这是首次使用记忆系统，非常好！建议定期（如30天）运行一次 memory_fragment_compact 保持记忆高效。";
                    } else if (totalFragments > config.json_max_count) {
                        statusIcon = "🔴";
                        statusText = "碎片已满";
                        suggestion = `碎片数量(${totalFragments})已超过上限(${config.json_max_count})，建议立即运行 memory_fragment_compact mode="auto" 进行清理。`;
                    } else if (totalFragments > 500) {
                        statusIcon = "🟡";
                        statusText = "碎片较多";
                        suggestion = `碎片数量(${totalFragments})较多，建议运行 memory_fragment_compact mode="auto" 进行清理。`;
                    } else if (totalFragments >= 200) {
                        statusIcon = "🟢";
                        statusText = "数量正常";
                        suggestion = `碎片数量(${totalFragments})处于正常范围，可选择运行 memory_fragment_compact mode="auto" 提前整理。`;
                    } else if (daysSinceCompact !== null && daysSinceCompact >= config.cold_data_days) {
                        statusIcon = "🟡";
                        statusText = "建议清理";
                        suggestion = `距离上次清理已超过 ${config.cold_data_days} 天阈值，建议运行 memory_fragment_compact mode="auto" 进行整理。`;
                    } else {
                        suggestion = "当前状态很不错，保持即可。如需手动整理，可调用: memory_fragment_compact mode=\"auto\"";
                    }

                    const daysUntilTrigger = daysSinceCompact !== null ? Math.max(0, config.cold_data_days - daysSinceCompact) : config.cold_data_days;
                    const triggerText = daysSinceCompact !== null ? `${daysUntilTrigger}天后` : `${config.cold_data_days}天后`;

                    let output = "## 记忆状态诊断\n\n";
                    output += "### 配置文件\n";
                    output += "| 配置项 | 值 |\n|--------|-----|\n";
                    output += `| 上次清理 | ${lastCompactFormatted} |\n`;
                    output += `| 冷数据阈值 | ${config.cold_data_days} 天 |\n`;
                    output += `| 年龄阈值 | ${config.cold_data_age_days} 天 |\n`;
                    output += `| JSON最大容量 | ${config.json_max_count} 条 |\n`;
                    output += "\n### 当前状态\n";
                    output += "| 指标 | 值 | 状态 |\n|------|-----|------|\n";
                    output += `| 碎片总数 | ${totalFragments} 条 | ${statusIcon} ${statusText} |\n`;
                    output += `| 距离上次清理 | ${daysSinceCompact !== null ? daysSinceCompact + " 天" : "未知"} | |\n`;
                    output += `| 预计触发时间 | ${triggerText} | |\n`;
                    output += "\n### 碎片分布 (饼图)";
                    output += pieChart;
                    output += "\n### AI 建议\n";
                    output += suggestion + "\n";

                    return textResult(output);
                },
            });

            editor.add({
                name: "memory_fragment_deep_search",
                description: "深度查询碎片记忆：同时查询JSON和SQLite归档，找到后自动恢复到JSON（循环机制）",
                input: objectSchema({
                    query: stringSchema("搜索关键词"),
                    limit: numberSchema("返回数量，默认 5"),
                }, ["query"]),
                async execute(args) {
                    const { query, limit = 5 } = args;
                    const scriptPath = path.join(EXTERNAL_DIR, "fragment-deep-search.js");
                    const cmd = `node "${scriptPath}" "${limit}" "${query}"`;
                    try {
                        const result = execSync(cmd, { encoding: "utf-8" });
                        return textResult(result.trim());
                    } catch (e) {
                        return textResult(JSON.stringify({ success: false, error: e.message }, null, 2));
                    }
                },
            });

            editor.add({
                name: "memory_manual",
                description: "【说明书工具】查询记忆插件的使用说明、工具用法、架构逻辑。当用户询问插件结构、工具如何使用、配置文件含义、数据存储方式等问题时，AI应主动使用此工具查询。参数keyword为查询关键词，不提供则返回完整说明书。查询不到时自动搜索插件目录下的README.md补充",
                input: objectSchema({
                    keyword: stringSchema("查询关键词（可选，不提供则返回完整说明书）"),
                }),
                async execute(args) {
                    try {
                        const content = fs.readFileSync(MANUAL_PATH, "utf-8");
                        const manual = JSON.parse(content);
                        if (args.keyword) {
                            const kw = args.keyword.toLowerCase();
                            const searchInObject = (obj, path = "") => {
                                const results = [];
                                for (const [key, value] of Object.entries(obj)) {
                                    const currentPath = path ? `${path}.${key}` : key;
                                    if (typeof value === "string") {
                                        if (value.toLowerCase().includes(kw)) {
                                            results.push({ path: currentPath, key, value });
                                        }
                                    } else if (typeof value === "object" && value !== null) {
                                        results.push(...searchInObject(value, currentPath));
                                    }
                                }
                                return results;
                            };
                            const results = searchInObject(manual);
                            if (results.length > 0) {
                                return textResult(JSON.stringify({ success: true, keyword: args.keyword, count: results.length, results: results.slice(0, 10) }, null, 2));
                            }
                            const readmeContent = fs.readFileSync(README_PATH, "utf-8");
                            const lowerReadme = readmeContent.toLowerCase();
                            const idx = lowerReadme.indexOf(kw);
                            if (idx !== -1) {
                                const start = Math.max(0, idx - 200);
                                const end = Math.min(readmeContent.length, idx + 800);
                                let snippet = readmeContent.substring(start, end);
                                if (start > 0) snippet = "...\n" + snippet;
                                if (end < readmeContent.length) snippet = snippet + "\n...";
                                return textResult(JSON.stringify({ success: true, keyword: args.keyword, source: "README.md", snippet }, null, 2));
                            }
                            return textResult(JSON.stringify({ success: false, error: `Keyword "${args.keyword}" not found in manual or README` }, null, 2));
                        }
                        return textResult(JSON.stringify({ success: true, manual }, null, 2));
                    } catch (e) {
                        return textResult(JSON.stringify({ success: false, error: e.message }, null, 2));
                    }
                },
            });

            editor.add({
                name: "synonym_map_view",
                description: "查看同义词映射表",
                input: objectSchema(),
                async execute() {
                    const map = loadSynonymMap();
                    return textResult(JSON.stringify({ success: true, map }, null, 2));
                },
            });

            editor.add({
                name: "synonym_map_add",
                description: "添加同义词映射",
                input: objectSchema({
                    key: stringSchema("关键词"),
                    synonyms: stringArraySchema("同义词数组"),
                }, ["key", "synonyms"]),
                async execute(args) {
                    const map = loadSynonymMap();
                    if (map[args.key]) {
                        map[args.key] = [...new Set([...map[args.key], ...args.synonyms])];
                    } else {
                        map[args.key] = args.synonyms;
                    }
                    if (saveSynonymMap(map)) {
                        reloadSynonymMap();
                        return textResult(JSON.stringify({ success: true, message: `Added synonyms for "${args.key}"`, key: args.key, synonyms: map[args.key] }, null, 2));
                    }
                    return textResult(JSON.stringify({ success: false, error: "Failed to save" }, null, 2));
                },
            });

            editor.add({
                name: "synonym_map_delete",
                description: "删除同义词映射",
                input: objectSchema({
                    key: stringSchema("要删除的关键词"),
                }, ["key"]),
                async execute(args) {
                    const map = loadSynonymMap();
                    if (map[args.key]) {
                        delete map[args.key];
                        if (saveSynonymMap(map)) {
                            reloadSynonymMap();
                            return textResult(JSON.stringify({ success: true, message: `Deleted key "${args.key}"` }, null, 2));
                        }
                        return textResult(JSON.stringify({ success: false, error: "Failed to save" }, null, 2));
                    }
                    return textResult(JSON.stringify({ success: false, error: `Key "${args.key}" not found` }, null, 2));
                },
            });

            editor.add({
                name: "synonym_map_update",
                description: "更新同义词映射（完全替换）",
                input: objectSchema({
                    key: stringSchema("关键词"),
                    synonyms: stringArraySchema("新的同义词数组"),
                }, ["key", "synonyms"]),
                async execute(args) {
                    const map = loadSynonymMap();
                    map[args.key] = args.synonyms;
                    if (saveSynonymMap(map)) {
                        reloadSynonymMap();
                        return textResult(JSON.stringify({ success: true, message: `Updated "${args.key}"`, key: args.key, synonyms: map[args.key] }, null, 2));
                    }
                    return textResult(JSON.stringify({ success: false, error: "Failed to save" }, null, 2));
                },
            });

            // ===== SQLite 测试工具 - 开始 =====
            // 如需恢复，删除以下工具定义即可
            editor.add({
                name: "memory_sqlite",
                description: "SQLite 测试工具：通过外部脚本存储 key-value（测试用）",
                input: objectSchema({
                    action: enumSchema(["set", "get", "delete", "list"]),
                    key: stringSchema("键名"),
                    value: stringSchema("值"),
                }, ["action"]),
                async execute(args) {
                    const { action, key, value } = args;
                    const scriptPath = path.join(EXTERNAL_DIR, "sqlite-manager.js");
                    let cmd;
                    if (action === "set") {
                        cmd = `node "${scriptPath}" set "${key}" "${value}"`;
                    } else if (action === "get") {
                        cmd = `node "${scriptPath}" get "${key}"`;
                    } else if (action === "delete") {
                        cmd = `node "${scriptPath}" delete "${key}"`;
                    } else if (action === "list") {
                        cmd = `node "${scriptPath}" list`;
                    } else {
                        return textResult(JSON.stringify({ success: false, error: "Unknown action" }, null, 2));
                    }
                    try {
                        const result = execSync(cmd, { encoding: "utf-8" });
                        return textResult(result.trim());
                    } catch (e) {
                        return textResult(JSON.stringify({ success: false, error: e.message }, null, 2));
                    }
                },
            });
            // ===== SQLite 测试工具 - 结束 =====
        });

        // 等价于 V1 的 experimental.chat.system.transform：每次模型请求前注入长期记忆与碎片状态
        await ctx.session.hook("context", (event) => {
            const mem = loadMemory();
            const ctxText = formatMemoryForPrompt(mem);
            event.system ??= [];
            if (ctxText) event.system.push({ type: "text", text: ctxText });

            const fragments = loadFragments();
            const config = loadFragmentConfig();
            const now = new Date();
            let daysSinceCompact = null;
            let suggestion = null;
            if (config.last_compact) {
                const lastCompact = new Date(config.last_compact);
                daysSinceCompact = Math.floor((now - lastCompact) / (1000 * 60 * 60 * 24));
                if (daysSinceCompact > 30) {
                    suggestion = "建议执行碎片整理 (memory_fragment_compact mode=auto)";
                }
            } else {
                suggestion = "从未整理过碎片记忆，建议执行碎片整理";
            }
            if (fragments.length >= config.json_max_count) {
                suggestion = "碎片数量已达 " + fragments.length + " 条，接近上限 " + config.json_max_count + "，建议执行碎片整理";
            }
            if (suggestion) {
                event.system.push({
                    type: "text",
                    text: `\n[FRAGMENT MEMORY STATUS]\n- 当前碎片数量: ${fragments.length}/${config.json_max_count}\n- 上次整理: ${config.last_compact ? config.last_compact + " (" + daysSinceCompact + "天前)" : "从未整理"}\n- ${suggestion}\n`,
                });
            }
        });

        // 等价于 V1 的 chat.message：检测到"记住/偏好/以后都"等关键词时，把提醒追加到本轮用户输入
        await ctx.session.hook("prompt", (event) => {
            const text = event.prompt?.text ?? "";
            if (text && detectMemoryKeyword(text)) {
                event.prompt.text = `${text}\n\n${NUDGE_MESSAGE}`;
            }
        });
    },
});
