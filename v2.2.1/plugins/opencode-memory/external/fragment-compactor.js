import initSqlJs from "sql.js";
import * as fs from "fs";
import * as path from "path";

const HOME_DIR = process.env.USERPROFILE || "";
const CONFIG_PATH = path.join(HOME_DIR, ".config", "opencode", "plugins", "opencode-memory", "fragment-config.json");
const FRAGMENTS_PATH = path.join(HOME_DIR, ".config", "opencode", "fragments.json");
const DB_DIR = path.join(HOME_DIR, ".config", "opencode");
const DB_PATH = path.join(DB_DIR, "fragment_archive.db");

function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
        }
    } catch (e) {}
    return { json_max_count: 200, cold_data_days: 30, cold_data_age_days: 60, last_compact: null };
}

function saveConfig(config) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
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

// ===== Schema 分类字段（归档层贯通：列定义 + 默认值） =====
const NEW_COLUMNS = [
    ["source_type", "TEXT DEFAULT 'inferred'"],
    ["confidence", "REAL DEFAULT 0.5"],
    ["memory_type", "TEXT DEFAULT 'semantic'"],
    ["ttl_policy", "TEXT DEFAULT 'none'"],
    ["expires_at", "TEXT"],
    ["consolidation_status", "TEXT DEFAULT 'transient'"],
    ["consolidation_at", "TEXT"],
    ["base_activation", "REAL DEFAULT 0.0"],
    ["stability", "REAL DEFAULT 1.0"],
    ["decay_rate", "REAL DEFAULT 0.5"],
    ["last_accessed_at", "TEXT"],
    ["use_history", "TEXT DEFAULT '[]'"],
];

async function initDb() {
    const SQL = await initSqlJs();
    let db;
    if (fs.existsSync(DB_PATH)) {
        db = new SQL.Database(fs.readFileSync(DB_PATH));
    } else {
        db = new SQL.Database();
    }
    db.run(`
        CREATE TABLE IF NOT EXISTS fragment_archive (
            id TEXT PRIMARY KEY,
            content TEXT,
            category TEXT,
            layer TEXT,
            weight REAL,
            source TEXT,
            associations TEXT,
            created_at TEXT,
            access_count INTEGER,
            last_recalled TEXT,
            recall_frequency INTEGER,
            archived_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    `);
    // 幂等添加分类列：PRAGMA 检查缺失列再 ALTER（兼容旧库文件）
    try {
        const info = db.exec("PRAGMA table_info(fragment_archive)");
        const existing = new Set((info[0]?.values || []).map(r => r[1]));
        for (const [col, def] of NEW_COLUMNS) {
            if (!existing.has(col)) {
                db.run(`ALTER TABLE fragment_archive ADD COLUMN ${col} ${def}`);
            }
        }
    } catch (e) {}
    return db;
}

async function getDb() {
    return await initDb();
}

function saveDb(db) {
    fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
}

function closeDb(db) {
    saveDb(db);
    db.close();
}

async function archiveFragments(fragments) {
    if (fragments.length === 0) return [];
    const db = await getDb();
    const stmt = db.prepare(`
        INSERT OR REPLACE INTO fragment_archive
        (id, content, category, layer, weight, source, associations, created_at, access_count, last_recalled, recall_frequency,
         source_type, confidence, memory_type, ttl_policy, expires_at, consolidation_status, consolidation_at,
         base_activation, stability, decay_rate, last_accessed_at, use_history, archived_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `);
    for (const f of fragments) {
        stmt.run([
            f.id,
            f.content,
            f.category || "general",
            f.layer || "surface",
            f.weight || 0.5,
            f.source || "explicit",
            JSON.stringify(f.associations || []),
            f.created_at,
            f.access_count || 0,
            f.last_recalled || null,
            f.recall_frequency || 0,
            // 分类字段（核心系统）
            f.source_type || "inferred",
            f.confidence ?? 0.5,
            f.memory_type || "semantic",
            f.ttl_policy || "none",
            f.expires_at || null,
            f.consolidation_status || "transient",
            f.consolidation_at || null,
            f.base_activation ?? 0.0,
            f.stability ?? 1.0,
            f.decay_rate ?? 0.5,
            f.last_accessed_at || null,
            f.use_history || "[]"
        ]);
    }
    stmt.free();
    closeDb(db);
    return fragments;
}

function getColdFragments(fragments, config, mode) {
    const now = Date.now();
    const coldDays = config.cold_data_days || 30;
    const ageDays = config.cold_data_age_days || 60;
    const coldThreshold = new Date(now - coldDays * 24 * 60 * 60 * 1000);
    const ageThreshold = new Date(now - ageDays * 24 * 60 * 60 * 1000);

    let coldConditions;
    switch (mode) {
        case "gentle":
            coldConditions = (f) => {
                const createdAt = new Date(f.created_at);
                const lastRecalled = f.last_recalled ? new Date(f.last_recalled) : null;
                const accessCount = f.access_count || 0;
                return createdAt < ageThreshold && accessCount < 2;
            };
            break;
        case "aggressive":
            const aThreshold = new Date(now - 15 * 24 * 60 * 60 * 1000);
            const agThreshold = new Date(now - 45 * 24 * 60 * 60 * 1000);
            coldConditions = (f) => {
                const createdAt = new Date(f.created_at);
                const lastRecalled = f.last_recalled ? new Date(f.last_recalled) : null;
                const accessCount = f.access_count || 0;
                return (lastRecalled && lastRecalled < aThreshold) ||
                       createdAt < agThreshold ||
                       accessCount < 3;
            };
            break;
        case "auto":
        default:
            coldConditions = (f) => {
                const createdAt = new Date(f.created_at);
                const lastRecalled = f.last_recalled ? new Date(f.last_recalled) : null;
                // 高频记忆（被召回≥3次）永不自动归档：多次召回证明有用，即使最近未用也保留（与 O1b 自动佐证逻辑一致）
                if ((f.access_count || 0) >= 3) return false;
                return (lastRecalled && lastRecalled < coldThreshold) || createdAt < ageThreshold;
            };
            break;
    }

    // 梦想家标记的碎片（consolidation_status=archived 或已过期）优先物理归档，所有模式都生效
    const markedForArchive = (f) => f.consolidation_status === "archived" ||
        (f.expires_at && new Date(f.expires_at).getTime() <= now);

    return fragments.filter(f => markedForArchive(f) || coldConditions(f));
}

async function compact(mode) {
    const config = loadConfig();
    let fragments = loadFragments();

    // 初始化数据库和表
    await getDb();

    const beforeCount = fragments.length;
    const coldFragments = getColdFragments(fragments, config, mode);

    if (coldFragments.length === 0) {
        return {
            success: true,
            report: {
                mode,
                before_count: beforeCount,
                archived_count: 0,
                after_count: beforeCount,
                message: "No cold fragments to archive"
            }
        };
    }

    await archiveFragments(coldFragments);

    const coldIds = new Set(coldFragments.map(f => f.id));
    fragments = fragments.filter(f => !coldIds.has(f.id));
    saveFragments(fragments);

    config.last_compact = new Date().toISOString();
    saveConfig(config);

    return {
        success: true,
        report: {
            mode,
            before_count: beforeCount,
            archived_count: coldFragments.length,
            after_count: fragments.length,
            last_compact: config.last_compact,
            archived_ids: coldFragments.map(f => f.id)
        }
    };
}

const args = process.argv.slice(2);
const mode = args[0] || "auto";

const result = await compact(mode);
console.log(JSON.stringify(result));