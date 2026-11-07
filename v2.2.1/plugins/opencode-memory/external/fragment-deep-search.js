import initSqlJs from "sql.js";
import * as fs from "fs";
import * as path from "path";

const HOME_DIR = process.env.USERPROFILE || "";
const FRAGMENTS_PATH = path.join(HOME_DIR, ".config", "opencode", "fragments.json");
const DB_PATH = path.join(HOME_DIR, ".config", "opencode", "fragment_archive.db");

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

function tokenizeQuery(q) {
    // 分词：按空白/中英文标点拆分，过滤单字（无区分度，避免单字 LIKE 命中大量无关）
    return String(q || "").toLowerCase().split(/[\s,，。；;、:：]+/).filter(t => t.length >= 2);
}

function searchInJson(query, limit = 5) {
    const fragments = loadFragments();
    const terms = tokenizeQuery(query);
    const results = [];

    for (const f of fragments) {
        let matchScore = 0;
        const content = (f.content || "").toLowerCase();
        const assocs = (f.associations || []).map(a => String(a).toLowerCase());
        for (const term of terms) {
            if (content.includes(term)) matchScore += 1;
            if (assocs.some(a => a.includes(term))) matchScore += 0.8;
        }
        if (matchScore > 0) {
            results.push({ ...f, matchScore, source: "json" });
        }
    }

    results.sort((a, b) => b.matchScore - a.matchScore);
    return results.slice(0, limit);
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

async function searchInArchive(query, limit = 5) {
    const db = await getDb();
    if (!db) return [];

    const terms = tokenizeQuery(query);
    if (terms.length === 0) { closeDb(db); return []; }

    // 分词 LIKE：任一词命中 content/associations 即返回（整句 LIKE 会因停顿词/插入词漏匹配，如"最终"插在中间）
    const conds = [];
    const params = [];
    for (const term of terms) {
        conds.push("(content LIKE ? OR associations LIKE ?)");
        params.push(`%${term}%`, `%${term}%`);
    }
    params.push(limit);

    const result = db.exec(
        `SELECT * FROM fragment_archive WHERE ${conds.join(" OR ")} LIMIT ?`,
        params
    );
    closeDb(db);

    if (result.length === 0 || result[0].values.length === 0) {
        return [];
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
        // 补 matchScore（与 searchInJson 口径一致：词命中 content +1 / associations +0.8）
        let matchScore = 0;
        const content = (fragment.content || "").toLowerCase();
        const assocs = (fragment.associations || []).map(a => String(a).toLowerCase());
        for (const term of terms) {
            if (content.includes(term)) matchScore += 1;
            if (assocs.some(a => a.includes(term))) matchScore += 0.8;
        }
        fragments.push({ ...fragment, matchScore, source: "archive" });
    }

    return fragments;
}

async function restoreFromArchive(fragment) {
    const db = await getDb();
    if (!db) return false;

    const fragments = loadFragments();
    const existingIdx = fragments.findIndex(f => f.id === fragment.id);
    if (existingIdx !== -1) {
        fragments[existingIdx] = fragment;
    } else {
        fragments.push(fragment);
    }
    saveFragments(fragments);

    db.run("DELETE FROM fragment_archive WHERE id = ?", [fragment.id]);
    fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
    closeDb(db);
    return true;
}

async function deepSearch(query, limit = 5) {
    const jsonResults = searchInJson(query, limit);

    if (jsonResults.length >= limit) {
        return {
            success: true,
            query,
            results: jsonResults,
            total: jsonResults.length,
            source: "json",
            restored_count: 0
        };
    }

    const archiveResults = await searchInArchive(query, limit - jsonResults.length);

    let restoredCount = 0;
    for (const frag of archiveResults) {
        await restoreFromArchive(frag);
        restoredCount++;
    }

    const combinedResults = [...jsonResults, ...archiveResults.map(f => ({ ...f, source: "archive_restored" }))];
    combinedResults.sort((a, b) => b.matchScore - a.matchScore);

    return {
        success: true,
        query,
        results: combinedResults.slice(0, limit),
        total: combinedResults.length,
        found_in_json: jsonResults.length,
        found_in_archive: archiveResults.length,
        restored_count: restoredCount,
        source: "mixed"
    };
}

const args = process.argv.slice(2);
const query = args.slice(1).join(" ");
const limit = parseInt(args[0]) || 5;

if (!query) {
    console.log(JSON.stringify({ success: false, error: "Usage: fragment-deep-search.js <limit> <query>" }));
    process.exit(1);
}

deepSearch(query, limit).then(result => {
    console.log(JSON.stringify(result));
});