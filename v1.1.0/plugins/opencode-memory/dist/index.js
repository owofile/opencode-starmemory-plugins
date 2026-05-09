import { tool } from "@opencode-ai/plugin";
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { DatabaseSync } from "node:sqlite";
function generateAssociations(content, maxCount = 5) {
    return [content];
}
class MemoryFragmentDB {
    db;
    constructor(dbPath) {
        const homeDir = process.env.USERPROFILE || process.env.HOME || "";
        const dbFilePath = dbPath || path.join(homeDir, ".config", "opencode", "fragments.db");
        this.db = new DatabaseSync(dbFilePath);
        this.init();
    }
    init() {
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS fragments (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        category TEXT DEFAULT 'general',
        layer TEXT DEFAULT 'surface',
        weight REAL DEFAULT 0.5,
        source TEXT DEFAULT 'inferred',
        associations TEXT DEFAULT '[]',
        created_at TEXT DEFAULT (datetime('now')),
        access_count INTEGER DEFAULT 0,
        last_accessed TEXT,
        last_recalled TEXT,
        recall_frequency REAL DEFAULT 0
      )
    `);
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS fragment_associations (
        fragment_id TEXT,
        keyword TEXT,
        FOREIGN KEY (fragment_id) REFERENCES fragments(id),
        PRIMARY KEY (fragment_id, keyword)
      )
    `);
        this.db.exec(`CREATE INDEX IF NOT EXISTS idx_assoc_keyword ON fragment_associations(keyword)`);
        this.db.exec(`CREATE INDEX IF NOT EXISTS idx_fragments_layer ON fragments(layer)`);
        this.db.exec(`CREATE INDEX IF NOT EXISTS idx_fragments_category ON fragments(category)`);
    }
    generateId(prefix = "frag") {
        return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 5)}`;
    }
    parseFragment(row) {
        return {
            id: row.id,
            content: row.content,
            category: row.category,
            layer: row.layer,
            weight: row.weight,
            source: row.source,
            associations: row.associations,
            created_at: row.created_at,
            access_count: row.access_count,
            last_accessed: row.last_accessed,
            last_recalled: row.last_recalled,
            recall_frequency: row.recall_frequency,
            associations_arr: JSON.parse(row.associations || "[]")
        };
    }
    addFragment(data) {
        try {
            const id = this.generateId();
            const associations = data.associations || generateAssociations(data.content);
            const insertFrag = this.db.prepare(`INSERT INTO fragments (id, content, category, layer, weight, source, associations) VALUES (?, ?, ?, ?, ?, ?, ?)`);
            insertFrag.run(id, data.content, data.category || "general", data.layer || "surface", 0.5, data.source || "inferred", JSON.stringify(associations));
            const insertAssoc = this.db.prepare(`INSERT INTO fragment_associations (fragment_id, keyword) VALUES (?, ?)`);
            for (const keyword of associations) {
                insertAssoc.run(id, keyword);
            }
            return { success: true, id };
        }
        catch (error) {
            return { success: false, error: String(error) };
        }
    }
    searchFragments(query, options = {}) {
        const { temperature = 0.5, limit = 5, layer = null, weight_threshold = 0.2 } = options;
        let sql = `SELECT DISTINCT f.* FROM fragments f LEFT JOIN fragment_associations fa ON f.id = fa.fragment_id WHERE (f.content LIKE ? OR fa.keyword LIKE ?)`;
        const params = [`%${query}%`, `%${query}%`];
        if (layer) {
            sql += ` AND f.layer = ?`;
            params.push(layer);
        }
        sql += ` AND f.weight >= ?`;
        params.push(weight_threshold);
        const stmt = this.db.prepare(sql);
        const rows = stmt.all(...params);
        const candidates = [];
        for (const row of rows) {
            const frag = this.parseFragment(row);
            const queryLower = query.toLowerCase();
            let matchScore = 0;
            if (frag.content.toLowerCase().includes(queryLower)) {
                matchScore += 1;
            }
            for (const assoc of frag.associations_arr) {
                if (assoc.toLowerCase().includes(queryLower)) {
                    matchScore += 0.8;
                }
            }
            if (matchScore > 0) {
                candidates.push({ ...frag, matchScore });
            }
        }
        candidates.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));
        const selected = [];
        for (let i = 0; i < Math.min(candidates.length, limit * 2); i++) {
            const frag = candidates[i];
            const prob = frag.weight * (1 - temperature * 0.5) + Math.random() * temperature * 0.5;
            if (prob > weight_threshold || selected.length < limit) {
                if (selected.length < limit) {
                    selected.push(frag);
                    this.updateRecall(frag.id);
                }
            }
        }
        selected.sort((a, b) => b.weight - a.weight);
        return selected.slice(0, limit);
    }
    updateRecall(id) {
        const now = new Date().toISOString();
        const stmt = this.db.prepare(`UPDATE fragments SET last_recalled = ?, access_count = access_count + 1 WHERE id = ?`);
        stmt.run(now, id);
    }
    deleteFragment(id) {
        try {
            const delAssoc = this.db.prepare(`DELETE FROM fragment_associations WHERE fragment_id = ?`);
            delAssoc.run(id);
            const delFrag = this.db.prepare(`DELETE FROM fragments WHERE id = ?`);
            delFrag.run(id);
            return { success: true };
        }
        catch (error) {
            return { success: false, error: String(error) };
        }
    }
    getFragments(options = {}) {
        const { category = null, layer = null } = options;
        let sql = `SELECT * FROM fragments WHERE 1=1`;
        const params = [];
        if (category) {
            sql += ` AND category = ?`;
            params.push(category);
        }
        if (layer) {
            sql += ` AND layer = ?`;
            params.push(layer);
        }
        const stmt = this.db.prepare(sql);
        const rows = params.length > 0 ? stmt.all(...params) : stmt.all();
        return rows.map(row => this.parseFragment(row));
    }
    getStats() {
        const totalStmt = this.db.prepare(`SELECT COUNT(*) as count FROM fragments`);
        const total = totalStmt.get()?.count || 0;
        const by_layer = { deep: 0, surface: 0 };
        const layerStmt = this.db.prepare(`SELECT layer, COUNT(*) as count FROM fragments GROUP BY layer`);
        const layerRows = layerStmt.all();
        for (const row of layerRows) {
            by_layer[row.layer] = row.count;
        }
        const by_category = {};
        const catStmt = this.db.prepare(`SELECT category, COUNT(*) as count FROM fragments GROUP BY category`);
        const catRows = catStmt.all();
        for (const row of catRows) {
            by_category[row.category] = row.count;
        }
        const avgStmt = this.db.prepare(`SELECT AVG(weight) as avg_weight, AVG(recall_frequency) as avg_freq FROM fragments`);
        const avgResult = avgStmt.get() || {};
        const avg_weight = avgResult.avg_weight || 0;
        const avg_recall_frequency = avgResult.avg_freq || 0;
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const unusedStmt = this.db.prepare(`SELECT COUNT(*) as count FROM fragments WHERE last_recalled IS NULL OR last_recalled < ?`);
        const unusedResult = unusedStmt.get(thirtyDaysAgo) || {};
        const unused_over_30days = unusedResult.count || 0;
        return { total, by_layer, by_category, avg_weight, avg_recall_frequency, unused_over_30days };
    }
    compact(mode = "gentle", options = {}) {
        const { unused_days = 30 } = options;
        const threshold = new Date(Date.now() - unused_days * 24 * 60 * 60 * 1000).toISOString();
        const report = {
            mode,
            before_count: this.getStats().total,
            merged_count: 0,
            deleted_count: 0,
            after_count: 0,
            merged_groups: [],
            deleted_fragments: []
        };
        const selectStmt = this.db.prepare(`SELECT id FROM fragments WHERE weight < 0.1 AND (last_recalled IS NULL OR last_recalled < ?)`);
        const rows = selectStmt.all(threshold);
        for (const row of rows) {
            this.deleteFragment(row.id);
            report.deleted_count++;
            report.deleted_fragments.push({ id: row.id, reason: "low_weight_and_unused" });
        }
        if (mode !== "gentle") {
            const threshold2 = new Date(Date.now() - unused_days * 2 * 24 * 60 * 60 * 1000).toISOString();
            const selectStmt2 = this.db.prepare(`SELECT id FROM fragments WHERE last_recalled IS NULL AND created_at < ?`);
            const rows2 = selectStmt2.all(threshold2);
            for (const row of rows2) {
                this.deleteFragment(row.id);
                report.deleted_count++;
                report.deleted_fragments.push({ id: row.id, reason: "unused_over_60days" });
            }
        }
        report.after_count = this.getStats().total;
        return { success: true, report };
    }
}
const fragmentDB = new MemoryFragmentDB();
function loadMemory(configPath) {
    try {
        if (fs.existsSync(configPath)) {
            const content = fs.readFileSync(configPath, "utf-8");
            return JSON.parse(content);
        }
    }
    catch (error) {
        console.error("[opencode-memory] Failed to load memory:", error);
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
export const opencodeMemoryPlugin = async (input) => {
    const homeDir = process.env.USERPROFILE || process.env.HOME || "";
    const configPath = path.join(homeDir, ".config", "opencode", "memory.json");
    const memory = loadMemory(configPath);
    if (!memory) {
        console.log("[opencode-memory] No memory file found at", configPath);
    }
    else {
        console.log("[opencode-memory] Memory loaded successfully");
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
                    const { content, associations, category, layer, source } = args;
                    const result = fragmentDB.addFragment({ content, associations, category, layer, source });
                    return JSON.stringify(result, null, 2);
                },
            }),
            memory_fragment_search: tool({
                description: "搜索记忆碎片（带温度随机性）",
                args: {
                    query: tool.schema.string(),
                    temperature: tool.schema.number().optional(),
                    limit: tool.schema.number().optional(),
                    layer: tool.schema.enum(["surface", "deep"]).optional(),
                    weight_threshold: tool.schema.number().optional(),
                },
                async execute(args) {
                    const { query, temperature, limit, layer, weight_threshold } = args;
                    const results = fragmentDB.searchFragments(query, { temperature, limit, layer, weight_threshold });
                    const formatted = results.map(r => ({
                        ...r,
                        associations: r.associations_arr
                    }));
                    return JSON.stringify({ success: true, results: formatted }, null, 2);
                },
            }),
            memory_fragment_stats: tool({
                description: "查看碎片统计",
                args: {},
                async execute() {
                    const stats = fragmentDB.getStats();
                    return JSON.stringify({ success: true, stats }, null, 2);
                },
            }),
            memory_fragment_view: tool({
                description: "查看碎片列表",
                args: {
                    category: tool.schema.string().optional(),
                    layer: tool.schema.string().optional(),
                },
                async execute(args) {
                    const { category, layer } = args;
                    const fragments = fragmentDB.getFragments({ category, layer: layer });
                    const formatted = fragments.map(r => ({
                        ...r,
                        associations: r.associations_arr
                    }));
                    return JSON.stringify({ success: true, fragments: formatted }, null, 2);
                },
            }),
            memory_fragment_delete: tool({
                description: "删除碎片",
                args: {
                    id: tool.schema.string(),
                },
                async execute(args) {
                    const { id } = args;
                    const result = fragmentDB.deleteFragment(id);
                    return JSON.stringify(result, null, 2);
                },
            }),
            memory_fragment_compact: tool({
                description: "整理碎片数据库",
                args: {
                    mode: tool.schema.enum(["gentle", "auto", "aggressive"]).optional(),
                    unused_days: tool.schema.number().optional(),
                },
                async execute(args) {
                    const { mode, unused_days } = args;
                    const result = fragmentDB.compact(mode, { unused_days });
                    return JSON.stringify(result, null, 2);
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
                console.log("[opencode-memory] Memory keyword detected, nudging agent");
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
