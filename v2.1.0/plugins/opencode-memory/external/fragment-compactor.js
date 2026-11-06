import initSqlJs from "sql.js";
import * as fs from "fs";
import * as path from "path";

const HOME_DIR = process.env.USERPROFILE || "";
const CONFIG_PATH = path.join(HOME_DIR, ".config", "opencode", "plugins", "opencode-memory", "fragment-config.json");
const FRAGMENTS_PATH = path.join(HOME_DIR, ".config", "opencode", "fragments.json");
const DB_DIR = path.join(HOME_DIR, ".config", "opencode", "plugins", "opencode-memory", "external");
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
        (id, content, category, layer, weight, source, associations, created_at, access_count, last_recalled, recall_frequency, archived_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
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
            f.recall_frequency || 0
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
                return (lastRecalled && lastRecalled < coldThreshold) || createdAt < ageThreshold;
            };
            break;
    }

    return fragments.filter(coldConditions);
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