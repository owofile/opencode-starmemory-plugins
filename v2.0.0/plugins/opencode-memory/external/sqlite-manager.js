import initSqlJs from "sql.js";
import * as path from "path";
import * as fs from "fs";

const HOME_DIR = process.env.USERPROFILE || "";
const DB_DIR = path.join(HOME_DIR, ".config", "opencode", "plugins", "opencode-memory", "external");
const DB_PATH = path.join(DB_DIR, "fragment_archive.db");

async function getDb() {
    const SQL = await initSqlJs();
    let db;
    if (fs.existsSync(DB_PATH)) {
        const buffer = fs.readFileSync(DB_PATH);
        db = new SQL.Database(buffer);
    } else {
        db = new SQL.Database();
        db.run(`
            CREATE TABLE memory (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `);
    }
    return db;
}

function saveDb(db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
}

function closeDb(db) {
    saveDb(db);
    db.close();
}

async function setValue(key, value) {
    const db = await getDb();
    db.run("INSERT OR REPLACE INTO memory (key, value, updated_at) VALUES (?, ?, datetime('now'))", [key, value]);
    closeDb(db);
    return { success: true, key, value };
}

async function getValue(key) {
    const db = await getDb();
    const result = db.exec("SELECT value FROM memory WHERE key = ?", [key]);
    closeDb(db);
    if (result.length > 0 && result[0].values.length > 0) {
        return { success: true, key, value: result[0].values[0][0] };
    }
    return { success: false, error: "Key not found" };
}

async function deleteValue(key) {
    const db = await getDb();
    db.run("DELETE FROM memory WHERE key = ?", [key]);
    const changes = db.getRowsModified();
    closeDb(db);
    if (changes > 0) {
        return { success: true, key };
    }
    return { success: false, error: "Key not found" };
}

async function listAll() {
    const db = await getDb();
    const result = db.exec("SELECT key, value FROM memory ORDER BY updated_at DESC");
    closeDb(db);
    if (result.length > 0) {
        const rows = result[0].values.map(row => ({ key: row[0], value: row[1] }));
        return { success: true, data: rows };
    }
    return { success: true, data: [] };
}

const args = process.argv.slice(2);
const action = args[0];
const key = args[1];
const value = args[2];

async function main() {
    let result;
    switch (action) {
        case "set":
            result = await setValue(key, value);
            break;
        case "get":
            result = await getValue(key);
            break;
        case "delete":
            result = await deleteValue(key);
            break;
        case "list":
            result = await listAll();
            break;
        default:
            result = { success: false, error: "Unknown action. Use: set <key> <value>, get <key>, delete <key>, list" };
    }
    console.log(JSON.stringify(result));
}

main();