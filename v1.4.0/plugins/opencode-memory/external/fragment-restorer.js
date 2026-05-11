import initSqlJs from "sql.js";
import * as fs from "fs";
import * as path from "path";

const HOME_DIR = process.env.USERPROFILE || "";
const FRAGMENTS_PATH = path.join(HOME_DIR, ".config", "opencode", "fragments.json");
const DB_PATH = path.join(HOME_DIR, ".config", "opencode", "plugins", "opencode-memory", "external", "fragment_archive.db");

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

async function getDb() {
    const SQL = await initSqlJs();
    let db;
    if (fs.existsSync(DB_PATH)) {
        db = new SQL.Database(fs.readFileSync(DB_PATH));
    } else {
        return null;
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

function closeDb(db) {
    db.close();
}

async function restoreById(id) {
    const db = await getDb();
    if (!db) return { success: false, error: "Database not found" };

    const result = db.exec("SELECT * FROM fragment_archive WHERE id = ?", [id]);

    if (result.length === 0 || result[0].values.length === 0) {
        closeDb(db);
        return { success: false, error: "Fragment not found in archive" };
    }

    const row = result[0].values[0];
    const columns = result[0].columns;
    const fragment = {};
    columns.forEach((col, i) => {
        if (col === "associations") {
            fragment[col] = JSON.parse(row[i] || "[]");
        } else {
            fragment[col] = row[i];
        }
    });
    delete fragment.archived_at;

    const fragments = loadFragments();
    const existingIdx = fragments.findIndex(f => f.id === fragment.id);
    if (existingIdx !== -1) {
        fragments[existingIdx] = fragment;
    } else {
        fragments.push(fragment);
    }
    saveFragments(fragments);

    db.run("DELETE FROM fragment_archive WHERE id = ?", [id]);
    closeDb(db);

    return { success: true, fragment };
}

async function restoreByQuery(query) {
    const db = await getDb();
    if (!db) return { success: false, error: "Database not found" };

    const result = db.exec(`
        SELECT * FROM fragment_archive
        WHERE content LIKE ? OR associations LIKE ?
        LIMIT 10
    `, [`%${query}%`, `%${query}%`]);

    if (result.length === 0 || result[0].values.length === 0) {
        closeDb(db);
        return { success: false, error: "No fragments found matching query", results: [] };
    }

    const columns = result[0].columns;
    const fragments = [];
    for (const row of result[0].values) {
        const fragment = {};
        columns.forEach((col, i) => {
            if (col === "associations") {
                fragment[col] = JSON.parse(row[i] || "[]");
            } else {
                fragment[col] = row[i];
            }
        });
        delete fragment.archived_at;
        fragments.push(fragment);
    }

    closeDb(db);
    return { success: true, fragments, count: fragments.length };
}

async function listArchived(limit = 20) {
    const db = await getDb();
    if (!db) return { success: false, error: "Database not found" };

    const result = db.exec(`SELECT id, content, category, layer, created_at, access_count, archived_at FROM fragment_archive ORDER BY archived_at DESC LIMIT ?`, [limit]);
    closeDb(db);

    if (result.length === 0) {
        return { success: true, archived: [], count: 0 };
    }

    const columns = result[0].columns;
    const archived = [];
    for (const row of result[0].values) {
        const item = {};
        columns.forEach((col, i) => {
            item[col] = row[i];
        });
        archived.push(item);
    }

    return { success: true, archived, count: archived.length };
}

const args = process.argv.slice(2);
const action = args[0];
const param = args.slice(1).join(" ");

let result;
switch (action) {
    case "id":
        result = await restoreById(param);
        break;
    case "query":
        result = await restoreByQuery(param);
        break;
    case "list":
        result = await listArchived(parseInt(param) || 20);
        break;
    default:
        result = { success: false, error: "Usage: fragment-restorer.js <id|query|list> [param]" };
}

console.log(JSON.stringify(result));