import { tool } from "@opencode-ai/plugin";
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
function loadMemory(configPath) {
    try {
        if (fs.existsSync(configPath)) {
            const content = fs.readFileSync(configPath, "utf-8");
            return JSON.parse(content);
        }
    }
    catch (error) {
        console.error("[StarMenory] Failed to load memory:", error);
    }
    return null;
}
function formatMemoryForPrompt(memory) {
    const sections = [];
    sections.push("[LONG-TERM MEMORY]");
    if (memory.user?.preferences) {
        const prefs = memory.user.preferences;
        sections.push("\n[USER PREFERENCES]");
        for (const [key, value] of Object.entries(prefs)) {
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
const MEMORY_MANAGER_PATH = path.join(process.env.USERPROFILE || "", ".agents", "skills", "memory-manager", "memory-manager.js");
const MEMORY_KEYWORD_PATTERNS = [
    /remember/i,
    /记住/i,
    /save\s+this/i,
    /别忘/i,
    /不要忘/i,
    /一直用/i,
    /总是用/i,
    /偏好/i,
    /以后都/i,
];
const NUDGE_MESSAGE = `[MEMORY TRIGGER DETECTED]

The user wants you to remember something. You MUST automatically save this to long-term memory.

1. Summarize the key information concisely (within 50 characters for preferences, 100 characters for rules)
2. Use the \`memory\` tool to save:
   - For preferences: action="add", category="user.preferences", key="<key>", value="<value>"
   - For rules: action="add", category="strict.rules", value="<rule>"
   - For forbidden commands: action="add", category="strict.forbidden", key="<description>", value="<description>", extra="<pattern>"

Do NOT ask for confirmation. Just save it automatically.`;
function detectMemoryKeyword(text) {
    return MEMORY_KEYWORD_PATTERNS.some((pattern) => pattern.test(text));
}
function callMemoryManager(args) {
    try {
        const output = execSync(`node "${MEMORY_MANAGER_PATH}" ${args.join(" ")}`, {
            encoding: "utf-8",
            maxBuffer: 1024 * 1024,
        });
        return JSON.parse(output);
    }
    catch (error) {
        return { success: false, error: error.message || "Failed to call memory-manager" };
    }
}
export const StarMenory = async (input) => {
    const homeDir = process.env.USERPROFILE || process.env.HOME || "";
    const configPath = path.join(homeDir, ".config", "opencode", "memory.json");
    const memory = loadMemory(configPath);
    if (!memory) {
        console.log("[StarMenory] No memory file found at", configPath);
    }
    else {
        console.log("[StarMenory] Memory loaded successfully");
    }
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
                    const { action, category, key, value, extra } = args;
                    const cmdArgs = [action];
                    if (category)
                        cmdArgs.push(category);
                    if (key)
                        cmdArgs.push(key);
                    if (value)
                        cmdArgs.push(value);
                    if (extra)
                        cmdArgs.push(extra);
                    const result = callMemoryManager(cmdArgs);
                    return JSON.stringify(result, null, 2);
                },
            }),
            memory_fragment_view: tool({
                description: "查看碎片列表",
                args: {},
                async execute() {
                    const homeDir = process.env.USERPROFILE || process.env.HOME || "";
                    const fragPath = path.join(homeDir, ".config", "opencode", "fragments.json");
                    try {
                        if (fs.existsSync(fragPath)) {
                            const data = JSON.parse(fs.readFileSync(fragPath, "utf-8"));
                            return JSON.stringify({ success: true, fragments: data.fragments || [] }, null, 2);
                        }
                        return JSON.stringify({ success: true, fragments: [] }, null, 2);
                    } catch (e) {
                        return JSON.stringify({ success: false, error: e.message }, null, 2);
                    }
                },
            }),
            memory_fragment_add: tool({
                description: "添加记忆碎片",
                args: {
                    content: tool.schema.string(),
                    category: tool.schema.string().optional(),
                    layer: tool.schema.string().optional(),
                },
                async execute(args) {
                    const homeDir = process.env.USERPROFILE || process.env.HOME || "";
                    const fragPath = path.join(homeDir, ".config", "opencode", "fragments.json");
                    const id = "frag_" + Date.now().toString(36) + "_" + Math.random().toString(36).substr(2, 5);
                    const now = new Date().toISOString();
                    const fragment = {
                        id,
                        content: args.content,
                        category: args.category || "general",
                        layer: args.layer || "surface",
                        weight: 0.5,
                        source: "explicit",
                        associations: [args.content],
                        created_at: now,
                        access_count: 0
                    };
                    try {
                        let data = { fragments: [] };
                        if (fs.existsSync(fragPath)) {
                            data = JSON.parse(fs.readFileSync(fragPath, "utf-8"));
                        }
                        if (!data.fragments) data.fragments = [];
                        data.fragments.push(fragment);
                        fs.writeFileSync(fragPath, JSON.stringify(data, null, 2), "utf-8");
                        return JSON.stringify({ success: true, id, fragment }, null, 2);
                    } catch (e) {
                        return JSON.stringify({ success: false, error: e.message }, null, 2);
                    }
                },
            }),
            memory_fragment_delete: tool({
                description: "删除碎片",
                args: {
                    id: tool.schema.string(),
                },
                async execute(args) {
                    const homeDir = process.env.USERPROFILE || process.env.HOME || "";
                    const fragPath = path.join(homeDir, ".config", "opencode", "fragments.json");
                    try {
                        if (!fs.existsSync(fragPath)) {
                            return JSON.stringify({ success: false, error: "No fragments found" }, null, 2);
                        }
                        let data = JSON.parse(fs.readFileSync(fragPath, "utf-8"));
                        if (!data.fragments) data.fragments = [];
                        const idx = data.fragments.findIndex(f => f.id === args.id);
                        if (idx === -1) {
                            return JSON.stringify({ success: false, error: "Fragment not found" }, null, 2);
                        }
                        data.fragments.splice(idx, 1);
                        fs.writeFileSync(fragPath, JSON.stringify(data, null, 2), "utf-8");
                        return JSON.stringify({ success: true }, null, 2);
                    } catch (e) {
                        return JSON.stringify({ success: false, error: e.message }, null, 2);
                    }
                },
            }),
            memory_fragment_search: tool({
                description: "搜索碎片",
                args: {
                    query: tool.schema.string(),
                },
                async execute(args) {
                    const homeDir = process.env.USERPROFILE || process.env.HOME || "";
                    const fragPath = path.join(homeDir, ".config", "opencode", "fragments.json");
                    try {
                        if (!fs.existsSync(fragPath)) {
                            return JSON.stringify({ success: true, results: [] }, null, 2);
                        }
                        const data = JSON.parse(fs.readFileSync(fragPath, "utf-8"));
                        const query = (args.query || "").toLowerCase();
                        const results = (data.fragments || []).filter(f => 
                            f.content.toLowerCase().includes(query) || 
                            (f.associations || []).some(a => a.toLowerCase().includes(query))
                        );
                        return JSON.stringify({ success: true, results: results.slice(0, 10) }, null, 2);
                    } catch (e) {
                        return JSON.stringify({ success: false, error: e.message }, null, 2);
                    }
                },
            }),
            memory_fragment_stats: tool({
                description: "查看碎片统计",
                args: {},
                async execute() {
                    const homeDir = process.env.USERPROFILE || process.env.HOME || "";
                    const fragPath = path.join(homeDir, ".config", "opencode", "fragments.json");
                    try {
                        let data = { fragments: [] };
                        if (fs.existsSync(fragPath)) {
                            data = JSON.parse(fs.readFileSync(fragPath, "utf-8"));
                        }
                        const fragments = data.fragments || [];
                        const by_layer = { deep: 0, surface: 0 };
                        const by_category = {};
                        let totalWeight = 0;
                        for (const f of fragments) {
                            by_layer[f.layer || "surface"]++;
                            const cat = f.category || "general";
                            by_category[cat] = (by_category[cat] || 0) + 1;
                            totalWeight += f.weight || 0.5;
                        }
                        return JSON.stringify({
                            success: true,
                            stats: {
                                total: fragments.length,
                                by_layer,
                                by_category,
                                avg_weight: fragments.length ? totalWeight / fragments.length : 0
                            }
                        }, null, 2);
                    } catch (e) {
                        return JSON.stringify({ success: false, error: e.message }, null, 2);
                    }
                },
            }),
        },
        "experimental.chat.system.transform": async (chatInput, output) => {
            if (!memory)
                return;
            const memoryContext = formatMemoryForPrompt(memory);
            if (!memoryContext)
                return;
            output.system.push(memoryContext);
        },
        "chat.message": async (chatInput, output) => {
            if (!memory)
                return;
            const textParts = output.parts.filter((p) => p.type === "text");
            const userMessage = textParts.map((p) => p.text).join("\n");
            if (detectMemoryKeyword(userMessage)) {
                console.log("[StarMenory] Memory keyword detected, nudging agent");
                const nudgePart = {
                    id: `prt_memory_nudge_${Date.now()}`,
                    sessionID: chatInput.sessionID,
                    messageID: output.message.id,
                    type: "text",
                    text: NUDGE_MESSAGE,
                    synthetic: true,
                };
                output.parts.push(nudgePart);
            }
        },
    };
};