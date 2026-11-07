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

// ===== Schema 分类字段默认值（核心系统，独立于自动召回） =====
// 分组：来源 / 类型时效 / 巩固状态 / 温度基础。weight 保留做向后兼容兜底。
const FRAGMENT_DEFAULTS = {
    source_type: "inferred",          // inferred | corroborated | user_confirmed（佐证分类，与 source 写入口径不同）
    confidence: 0.5,                  // 0.0-1.0 写入时置信度
    memory_type: "semantic",          // semantic | episodic | preference | procedure
    ttl_policy: "none",               // none | fixed | reconfirm_required
    expires_at: null,                 // ISO 时间，硬过期
    consolidation_status: "transient",// transient | consolidated | archived
    consolidation_at: null,           // ISO 时间，梦想家巩固时间
    base_activation: 0.0,             // 0.0-1.0 温度基础
    stability: 1.0,                   // 0.0-1.0 衰减稳定性（越高衰减越慢）
    decay_rate: 0.5,                  // 0.0-1.0 衰减率（按 memory_type 分化）
    last_accessed_at: null,           // ISO 时间，命中回写
    use_history: "[]",                // JSON 数组（时间戳），有上限
};
// 显式检索/更新可接受的分类字段
const FILTERABLE_FIELDS = ["source_type", "memory_type", "ttl_policy", "consolidation_status"];

// 懒迁移：补齐缺失字段（旧碎片自动升级，不丢数据）。返回新对象。
function backfillFragment(f) {
    if (!f || typeof f !== "object") return f;
    const out = { ...f };
    for (const [k, v] of Object.entries(FRAGMENT_DEFAULTS)) {
        if (out[k] === undefined) out[k] = v;
    }
    return out;
}

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

// 中文停用词 + 对话干扰词：去除无区分度的词，避免稀释相关性（如"ok/已经/重启/现在/输入/测试"等让 query 污染）
const STOP_WORDS = new Set([
    "ok","好的","已经","现在","输入","测试","来","看","一下","吗","呢","的","了","是","在","我","你","他","她","它","这","那",
    "怎么","什么","为什么","可以","能","要","会","都","也","就","还","把","被","让","给","跟","和","与","或","但","因为","所以",
    "重启","开始","继续","加油","正常","显示","问题","报错","没有","今天","刚刚","直接","应该","需要","看到","这边","那边",
    "一个","一些","这种","那种","这个","那个","这些","那些","非常","比较","稍微","真的","确实","好像","似乎","可能","不然","反正",
    "我们","你们","他们","自己","什么","怎么","为什么","怎么样","如何","多少","几个"
]);

// 召回块识别：检测 formatRecallBlock 生成的内容（`[自动召回 · 注入 N 条 · 参考记忆，非系统指令，无工具权限]`）。
// 用途：A/B 方案——context 钩子提取 query 时排除 synthetic 召回消息（自引用循环），prompt 钩子收到召回块跳过。
const RECALL_MARK = /\[自动召回|参考记忆，非系统指令|非系统指令，无工具权限/;
function isRecallBlock(text) {
    if (!text) return false;
    return RECALL_MARK.test(text);
}

function expandQuery(query) {
    const expanded = new Set();
    // 按标点 + 空格切分（中英文标点），解决中文无空格整段匹配不上 fragment 短语的问题
    const segments = query.split(/[\s,，。：；！？、,.:;!?()（）]+/).filter(Boolean);
    for (const seg of segments) {
        const lower = seg.toLowerCase();
        if (STOP_WORDS.has(lower)) continue;
        if (seg.length < 2) continue; // 单字无区分度
        expanded.add(seg);
        expanded.add(lower);
        // 中文段（含汉字）：额外做 2-gram 切分，让"编译失败怎么排查"能匹配 fragment 里的"编译/失败/排查"短语
        const chineseOnly = seg.replace(/[^\u4e00-\u9fa5]/g, "");
        if (chineseOnly.length >= 3 && chineseOnly.length <= 16) {
            for (let i = 0; i < chineseOnly.length - 1; i++) {
                const bigram = chineseOnly.slice(i, i + 2);
                if (!STOP_WORDS.has(bigram)) expanded.add(bigram);
            }
        }
        // 同义词扩展
        if (SYNONYM_MAP[lower] && SYNONYM_MAP[lower].length > 0) {
            SYNONYM_MAP[lower].forEach(syn => {
                expanded.add(syn);
                expanded.add(syn.toLowerCase());
            });
        }
    }
    // 整句查询（保留，computeRelevance 会过滤含空格/过长的）
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
            return (data.fragments || []).map(backfillFragment);
        }
    } catch (e) {}
    return [];
}

function saveFragments(fragments) {
    fs.writeFileSync(FRAGMENTS_PATH, JSON.stringify({ fragments }, null, 2), "utf-8");
}

// ===== 温度系统（核心系统，独立于自动召回） =====
const MAX_USE_HISTORY = 20;   // use_history 数组上限
const RECALL_BOOST = 0.15;    // 每次命中 base_activation 升温
const DAY_MS = 24 * 60 * 60 * 1000;
const CONSOLIDATION_DAYS = 7;   // transient→consolidated 延迟窗口（天）
const RECONFIRM_DAYS = 3;       // 临近过期标记窗口（天）

// 计算有效激活度（确定性）。向后兼容：base_activation 未初始化时回退 weight。
function computeActivation(f, now = Date.now()) {
    if (!f || typeof f !== "object") return 0;
    const base = typeof f.base_activation === "number" ? f.base_activation : 0;
    if (base <= 0 && typeof f.weight === "number") return Math.max(0, Math.min(1, f.weight));
    const t = f.last_accessed_at || f.created_at;
    if (!t) return base;
    const lastMs = new Date(t).getTime();
    if (!lastMs) return base;
    const days = (now - lastMs) / (24 * 60 * 60 * 1000);
    const stability = typeof f.stability === "number" ? f.stability : 1.0;
    const decayRate = typeof f.decay_rate === "number" ? f.decay_rate : 0.5;
    // 稳定性越高衰减越慢：stability=1 → 不衰减；stability=0 → 按 decay_rate 指数衰减
    const decay = Math.exp(-decayRate * (1 - stability) * days);
    return Math.max(0, Math.min(1, base * decay));
}

// 命中回写（核心系统自己的写入）：use_history 有上限、升温、计数。就地修改 f。
function applyRecall(f, now = new Date().toISOString()) {
    if (!f || typeof f !== "object") return f;
    let hist = [];
    try { hist = JSON.parse(f.use_history || "[]"); } catch { hist = []; }
    if (!Array.isArray(hist)) hist = [];
    hist.push(now);
    if (hist.length > MAX_USE_HISTORY) hist = hist.slice(-MAX_USE_HISTORY);
    f.use_history = JSON.stringify(hist);
    f.access_count = (f.access_count || 0) + 1;
    f.last_accessed_at = now;
    f.base_activation = Math.min(1, (typeof f.base_activation === "number" ? f.base_activation : 0) + RECALL_BOOST);
    return f;
}

function updateRecall(id) {
    const fragments = loadFragments();
    const idx = fragments.findIndex(f => f.id === id);
    if (idx !== -1) {
        const f = fragments[idx];
        applyRecall(f, new Date().toISOString());
        f.last_recalled = f.last_accessed_at; // 兼容现有 compact/search 字段
        f.recall_frequency = (f.recall_frequency || 0) + 1;
        saveFragments(fragments);
    }
}

// 结构化过滤（核心系统能力，不传即不过滤）：来源/类型/巩固/过期/激活度
function applyFragmentFilters(fragments, f = {}) {
    if (!Array.isArray(fragments)) return fragments;
    let out = fragments;
    if (f.source_type) out = out.filter(x => x.source_type === f.source_type);
    if (f.memory_type) out = out.filter(x => x.memory_type === f.memory_type);
    if (f.consolidation) out = out.filter(x => x.consolidation_status === f.consolidation);
    if (f.exclude_expired) {
        const now = Date.now();
        out = out.filter(x => !x.expires_at || new Date(x.expires_at).getTime() > now);
    }
    if (typeof f.min_activation === "number") {
        out = out.filter(x => computeActivation(x) >= f.min_activation);
    }
    return out;
}

// ===== 梦想家（核心系统维护者：巩固流转 + 温度重算 + 类型分化策略） =====
// 只标记状态，不物理删除/归档（物理归档交给 fragment-compactor，职责分离）。
// 返回报告；有变更才写盘。
function dreamerRun() {
    const fragments = loadFragments();
    const now = new Date();
    const nowMs = now.getTime();
    const report = {
        total: fragments.length,
        consolidated: 0,
        expired_marked: 0,
        archived_marked: 0,
        recomputed: 0,
        changed_ids: [],
    };
    for (const f of fragments) {
        let dirty = false;
        // 1. 温度重算：把衰减后的有效激活度提交为新的 base_activation（稳定性高→衰减≈0，天然幂等）
        const act = computeActivation(f, nowMs);
        if (Math.abs((typeof f.base_activation === "number" ? f.base_activation : 0) - act) > 0.001) {
            f.base_activation = act;
            dirty = true;
            report.recomputed++;
        }
        // 2. 巩固流转：transient + 被使用 + 达延迟窗口 → consolidated（初始化 stability/base）
        if (f.consolidation_status === "transient") {
            const ageDays = (nowMs - new Date(f.created_at || now.toISOString()).getTime()) / DAY_MS;
            const used = (f.access_count || 0) >= 1;
            if (used && ageDays >= CONSOLIDATION_DAYS) {
                f.consolidation_status = "consolidated";
                f.consolidation_at = now.toISOString();
                if (!f.stability) f.stability = 0.7;
                if (!f.base_activation || f.base_activation < 0.2) f.base_activation = 0.3;
                dirty = true;
                report.consolidated++;
            }
        }
        // 3. 类型分化：过期策略（preference/episodic 有 expires_at）
        if (f.expires_at) {
            const expMs = new Date(f.expires_at).getTime();
            if (!isNaN(expMs)) {
                const expDays = (expMs - nowMs) / DAY_MS;
                if (expDays <= 0) {
                    // 已过期：标记归档（不删除，等用户确认/compact 物理移冷）
                    if (f.consolidation_status !== "archived") {
                        f.consolidation_status = "archived";
                        dirty = true;
                        report.archived_marked++;
                    }
                } else if (expDays <= RECONFIRM_DAYS && f.ttl_policy === "fixed") {
                    // 临近过期：要求确认
                    f.ttl_policy = "reconfirm_required";
                    dirty = true;
                    report.expired_marked++;
                }
            }
        }
        if (dirty) report.changed_ids.push(f.id);
    }
    if (report.changed_ids.length > 0) saveFragments(fragments);
    report.changed = report.changed_ids.length;
    return { success: true, report };
}

// 梦想家周期定时器句柄（模块级，防热重载重复建 timer 泄漏）
let _dreamTimer = null;
let _dreamBootTimer = null;

// ===== P6 自动召回（事件驱动，非定时；默认 OFF（0档）；只读核心字段；绝不写 event.system） =====
// 运行时参数经 recall-runtime.json 由 TUI 滑块/工具更新，钩子每次实时读取（mtime 缓存）。
// 功能开关 enabled（默认 false=仅主动召回）+ 档位 effort 0-6。跨进程：TUI 写 / index.js 钩子读。
const RECALL_RUNTIME_PATH = path.join(CONFIG_DIR, "recall-runtime.json");
// 档位 0-6 → 预设：effort / budget(token占比) / topK(条数) / tempMin(最低温度) / relMin(相关性下限) / cold(冷记忆)
// label=英文语义，labelZh=中文语义，pct=预算百分比（显示用）
const RECALL_PRESETS = [
    { effort: 0, budget: 0.000, topK: 0, tempMin: 1.01, relMin: 1.01, cold: false, label: "OFF", labelZh: "关闭", pct: 0 },
    { effort: 1, budget: 0.010, topK: 1, tempMin: 0.70, relMin: 0.80, cold: false, label: "Light", labelZh: "极轻", pct: 1 },
    { effort: 2, budget: 0.020, topK: 2, tempMin: 0.60, relMin: 0.75, cold: false, label: "Light+", labelZh: "轻", pct: 2 },
    { effort: 3, budget: 0.030, topK: 2, tempMin: 0.50, relMin: 0.70, cold: false, label: "Medium", labelZh: "中", pct: 3 },
    { effort: 4, budget: 0.040, topK: 3, tempMin: 0.40, relMin: 0.65, cold: true, label: "Strong", labelZh: "较强", pct: 4 },
    { effort: 5, budget: 0.045, topK: 4, tempMin: 0.30, relMin: 0.60, cold: true, label: "Strong+", labelZh: "强", pct: 4.5 },
    { effort: 6, budget: 0.050, topK: 5, tempMin: 0.20, relMin: 0.60, cold: true, label: "Max", labelZh: "最强", pct: 5 },
];
const BASE_CONTEXT_TOKENS = 8000; // 预算换算基准（token）
let _recallParams = { enabled: false, ...RECALL_PRESETS[0], updated_at: null, _mtime: 0 };

function loadRecallParams() {
    try {
        if (fs.existsSync(RECALL_RUNTIME_PATH)) {
            const mt = fs.statSync(RECALL_RUNTIME_PATH).mtimeMs;
            if (mt !== _recallParams._mtime) {
                const data = JSON.parse(fs.readFileSync(RECALL_RUNTIME_PATH, "utf-8"));
                const effort = Math.max(0, Math.min(6, Number(data.effort) || 0));
                _recallParams = { enabled: data.enabled === true, ...RECALL_PRESETS[effort], updated_at: data.updated_at || null, _mtime: mt };
            }
        }
    } catch {}
    return _recallParams;
}

// 写 recall-runtime.json（保留现有 enabled，只改档位）
function setRecallLevel(effort) {
    const lv = Math.max(0, Math.min(6, Number(effort) || 0));
    const cur = loadRecallParams();
    const rec = { enabled: cur.enabled, effort: lv, updated_at: new Date().toISOString() };
    try {
        fs.mkdirSync(CONFIG_DIR, { recursive: true });
        fs.writeFileSync(RECALL_RUNTIME_PATH, JSON.stringify(rec, null, 2));
        _recallParams = { enabled: cur.enabled, ...RECALL_PRESETS[lv], updated_at: rec.updated_at, _mtime: Date.now() };
    } catch {}
    return { ..._recallParams };
}

// 写 recall-runtime.json（功能开关，保留现有档位）
function setRecallEnabled(enabled) {
    const cur = loadRecallParams();
    const rec = { enabled: !!enabled, effort: cur.effort, updated_at: new Date().toISOString() };
    try {
        fs.mkdirSync(CONFIG_DIR, { recursive: true });
        fs.writeFileSync(RECALL_RUNTIME_PATH, JSON.stringify(rec, null, 2));
        _recallParams = { enabled: !!enabled, ...RECALL_PRESETS[cur.effort], updated_at: rec.updated_at, _mtime: Date.now() };
    } catch {}
    return { ..._recallParams };
}

// 相关性：query 词命中 content/associations 的比例（0-1）
function computeRelevance(f, terms) {
    if (!terms || terms.length === 0) return 0;
    const content = (f.content || "").toLowerCase();
    const assocs = f.associations || [];
    // 只数"有区分度的用户词"：排除整句（含空格，fragment 不可能包含）和单字（无区分度）
    const userWords = terms.filter(t => {
        const l = (t || "").toLowerCase();
        return l.length >= 2 && !/\s/.test(l);
    });
    if (userWords.length === 0) return 0;
    let hits = 0;
    for (const q of userWords) {
        const lq = (q || "").toLowerCase();
        if (content.includes(lq)) { hits++; continue; }
        if (assocs.some(a => (a || "").toLowerCase().includes(lq))) hits++;
    }
    // 饱和上限：命中前 4 个有效词即算满相关。长查询不再稀释 rel（召回语义：用户输入含记忆多个关键词→强相关）。
    return Math.min(1, hits / Math.min(userWords.length, 4));
}

// P3 召回质量（2026-11-07）：佐证加权 + 内容近似去重。轻量实现（碎片数 ≤200，直接两两计算，无需 MinHash/embedding）。
const DUP_THRESHOLD = 0.6; // 内容近似度阈值：>0.6 视为近重复（只留排序更优的，防冗余挤占预算）
function sourceBoost(st) {
    if (st === "user_confirmed") return 0.08; // 用户确认 > 佐证 > 推断（信任加权，参考 RAG re-ranking）
    if (st === "corroborated") return 0.05;
    return 0;
}
function shingleSet(s, k = 3) {
    s = String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
    const set = new Set();
    for (let i = 0; i + k <= s.length; i++) set.add(s.slice(i, i + k));
    return set;
}
function jaccardShingle(a, b) {
    const sa = shingleSet(a), sb = shingleSet(b);
    if (!sa.size || !sb.size) return 0;
    let inter = 0;
    for (const x of sa) if (sb.has(x)) inter++;
    const union = sa.size + sb.size - inter;
    return union ? inter / union : 0;
}

// 四道闸门 + 冷记忆特判 + 排序 + Token 预算截断（只读，不写库）
function autoRecallCandidates(query, params, now = Date.now()) {
    if (!params || params.effort === 0 || params.topK <= 0) return [];
    const fragments = loadFragments();
    const terms = expandQuery(query);
    const scored = [];
    for (const f of fragments) {
        if (f.consolidation_status !== "consolidated") continue;          // 巩固闸门
        if (f.expires_at && new Date(f.expires_at).getTime() <= now) continue; // 时效闸门
        const temp = computeActivation(f, now);                            // 温度
        if (temp < params.tempMin) continue;                              // 温度闸门
        const rel = computeRelevance(f, terms);                           // 相关性
        if (rel < params.relMin) continue;                                // 相关性闸门
        const cold = temp < 0.3;
        if (cold) {                                                       // 冷记忆特判
            if (!params.cold) continue;
            if (f.source_type !== "corroborated" && f.source_type !== "user_confirmed") continue;
        }
        scored.push({ ...f, relevance: rel, temperature: temp });
    }
    // P3 排序：基础分(相关性*0.5 + 温度*0.3 + 置信度*0.2) × 佐证加成(1 + sourceBoost)。
    // 佐证加成让"用户确认/多来源印证"的记忆在相关性相近时优先（更可信，参考 RAG re-ranking 信任加权）。
    scored.sort((a, b) => {
        const sa = (a.relevance * 0.5 + a.temperature * 0.3 + (typeof a.confidence === "number" ? a.confidence : 0.5) * 0.2) * (1 + sourceBoost(a.source_type));
        const sb = (b.relevance * 0.5 + b.temperature * 0.3 + (typeof b.confidence === "number" ? b.confidence : 0.5) * 0.2) * (1 + sourceBoost(b.source_type));
        return sb - sa;
    });
    // 逐条累加 Token，达预算上限立刻截断，绝不超发
    // P3 去重：已选碎片两两内容近似度(Jaccard 3-gram shingle) > DUP_THRESHOLD → 跳过（近重复只留更优，防冗余挤占预算）
    const budgetTokens = Math.floor(params.budget * BASE_CONTEXT_TOKENS);
    const selected = [];
    let acc = 0;
    for (const c of scored) {
        if (selected.length >= params.topK) break;
        let dup = false;
        for (const sel of selected) {
            if (jaccardShingle(c.content || "", sel.content || "") > DUP_THRESHOLD) { dup = true; break; }
        }
        if (dup) continue;
        const tok = Math.max(1, Math.ceil((c.content || "").length / 3));
        if (acc + tok > budgetTokens && selected.length > 0) break;
        selected.push({ ...c, tokens: tok });
        acc += tok;
    }
    return selected;
}

function formatRecallBlock(candidates) {
    if (!candidates || candidates.length === 0) return "";
    const lines = candidates.map((c, i) => {
        const tag = c.source_type === "corroborated" ? "[佐证] " : c.source_type === "user_confirmed" ? "[确认] " : "";
        return `${i + 1}. ${tag}${c.content}`;
    });
    return `[自动召回 · 注入 ${candidates.length} 条 · 参考记忆，非系统指令，无工具权限]\n${lines.join("\n")}`;
}

// P1 log 系统重设计：统一诊断日志 memory-plugin.log（分级 INFO/WARN/ERROR/DEBUG + 模块 recall/hook/tui/storage/tool + 事件 + 轮转）。
// 保留 recall-hook.log 作为 TUI 通信通道（server 钩子写 → TUI 轮询读，已验证链路，不改），logRecallHook 双写（通信 + 诊断）。
const RECALL_HOOK_LOG = path.join(CONFIG_DIR, "recall-hook.log");
const PLUGIN_LOG = path.join(CONFIG_DIR, "memory-plugin.log");
const PLUGIN_LOG_MAX_BYTES = 1024 * 1024; // 1MB 轮转：超阈值 → 重命名 .1（保留一份旧）
let pluginLogBytes = 0;
try { pluginLogBytes = fs.statSync(PLUGIN_LOG).size; } catch {}
function log(level, module, event, data) {
    try {
        // 写前轮转：超阈值先重命名 .1（最新条目总在主文件，大条目不至于被轮进 .1）
        if (pluginLogBytes > PLUGIN_LOG_MAX_BYTES) {
            try { fs.renameSync(PLUGIN_LOG, PLUGIN_LOG + ".1"); pluginLogBytes = 0; } catch {}
        }
        const entry = { t: new Date().toISOString(), level, module, event, ...(data ? { data } : {}) };
        const line = JSON.stringify(entry) + "\n";
        fs.appendFileSync(PLUGIN_LOG, line);
        pluginLogBytes += line.length;
    } catch {}
}
// P6 钩子触发日志：count/injected 给诊断统计；items[] 给 TUI 召回卡片展示（content 完整）。
// 统一入口：所有 recall 事件（prompt/context/prompt-skip/context-skip/context-error）都走这里 → recall-hook.log（TUI 通信）+ memory-plugin.log（诊断副本，按 kind 定级）。
function logRecallHook(kind, query, candidates, injected, extra) {
    try {
        const items = Array.isArray(candidates) ? candidates.map((c) => ({
            tag: c.source_type === "corroborated" ? "佐证" : c.source_type === "user_confirmed" ? "确认" : "",
            content: c.content,
        })) : [];
        const rec = {
            t: new Date().toISOString(), kind,
            ...(query ? { query: String(query).slice(0, 60) } : {}),
            ...(Array.isArray(candidates) ? { count: candidates.length, items } : {}),
            ...(injected !== undefined ? { injected } : {}),
            ...(extra ? extra : {}),
        };
        fs.appendFileSync(RECALL_HOOK_LOG, JSON.stringify(rec) + "\n");
        // 诊断副本：真召回=INFO，预期跳过=DEBUG，异常=ERROR
        const lvl = kind.includes("error") ? "ERROR" : kind.includes("skip") ? "DEBUG" : "INFO";
        log(lvl, "recall", kind, rec);
    } catch {}
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

function booleanSchema(description) {
    return { type: "boolean", ...(description ? { description } : {}) };
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
                    // 分类字段（核心系统，可选；默认值见 FRAGMENT_DEFAULTS）
                    source_type: enumSchema(["inferred", "corroborated", "user_confirmed"], "佐证分类，默认 inferred"),
                    memory_type: enumSchema(["semantic", "episodic", "preference", "procedure"], "记忆类型，默认 semantic"),
                    confidence: numberSchema("置信度 0-1，默认 0.5"),
                    ttl_policy: enumSchema(["none", "fixed", "reconfirm_required"], "过期策略，默认 none"),
                    expires_at: stringSchema("过期时间 ISO，可选"),
                }, ["content"]),
                async execute(args) {
                    const id = generateId();
                    const assocs = args.associations?.length > 0 ? args.associations : extractKeywords(args.content);
                    const fragment = {
                        ...FRAGMENT_DEFAULTS,
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
                    // 可选分类字段覆盖默认值
                    for (const k of ["source_type", "memory_type", "confidence", "ttl_policy", "expires_at"]) {
                        if (args[k] !== undefined) fragment[k] = args[k];
                    }
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
                    // 结构化过滤（核心系统能力，不传即不过滤）
                    source_type: enumSchema(["inferred", "corroborated", "user_confirmed"], "只看此佐证分类（可选）"),
                    memory_type: enumSchema(["semantic", "episodic", "preference", "procedure"], "只看此记忆类型（可选）"),
                    consolidation: enumSchema(["transient", "consolidated", "archived"], "只看此巩固状态（可选）"),
                    exclude_expired: booleanSchema("排除过期项（可选）"),
                    min_activation: numberSchema("最小激活度 0-1（可选）"),
                    sort: enumSchema(["relevance", "activation", "weight"], "排序：relevance=相关性(默认，现有行为) | activation=激活度 | weight=权重"),
                }, ["query"]),
                async execute(args) {
                    const { query, temperature = 0.5, limit = 5, layer, weight_threshold = 0.2, sort = "relevance" } = args;
                    let fragments = loadFragments();
                    if (layer) fragments = fragments.filter(f => f.layer === layer);
                    fragments = fragments.filter(f => f.weight >= weight_threshold);
                    // 结构化过滤（可选）
                    fragments = applyFragmentFilters(fragments, args);

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
                    // 排序：activation 用激活度，weight 用权重，relevance 保持现有（权重降序）
                    if (sort === "activation") {
                        selected.sort((a, b) => computeActivation(b) - computeActivation(a));
                    } else if (sort === "weight") {
                        selected.sort((a, b) => b.weight - a.weight);
                    } else {
                        selected.sort((a, b) => b.weight - a.weight);
                    }
                    // 附带计算激活度（供消费方排序/展示）
                    const results = selected.slice(0, limit).map(f => ({ ...f, activation: computeActivation(f) }));
                    return textResult(JSON.stringify({ success: true, results }, null, 2));
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
                    // 分类字段（核心系统，可选）
                    source_type: enumSchema(["inferred", "corroborated", "user_confirmed"], "佐证分类（可选）"),
                    confidence: numberSchema("置信度 0-1（可选）"),
                    memory_type: enumSchema(["semantic", "episodic", "preference", "procedure"], "记忆类型（可选）"),
                    ttl_policy: enumSchema(["none", "fixed", "reconfirm_required"], "过期策略（可选）"),
                    expires_at: stringSchema("过期时间 ISO（可选）"),
                    consolidation_status: enumSchema(["transient", "consolidated", "archived"], "巩固状态（可选）"),
                    base_activation: numberSchema("基础激活 0-1（可选）"),
                    stability: numberSchema("稳定性 0-1（可选）"),
                    decay_rate: numberSchema("衰减率 0-1（可选）"),
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
                    // 分类字段覆盖
                    for (const k of ["source_type", "confidence", "memory_type", "ttl_policy", "expires_at", "consolidation_status", "base_activation", "stability", "decay_rate"]) {
                        if (args[k] !== undefined) frag[k] = args[k];
                    }
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
                name: "memory_fragment_dream",
                description: "梦想家：巩固流转 + 温度重算 + 类型分化策略（只标记，物理归档交给 compact）",
                input: objectSchema(),
                async execute() {
                    try {
                        const result = dreamerRun();
                        return textResult(JSON.stringify(result, null, 2));
                    } catch (e) {
                        return textResult(JSON.stringify({ success: false, error: e.message }, null, 2));
                    }
                },
            });

            editor.add({
                name: "memory_recall_set",
                description: "设置自动召回档位（0-6，0=OFF；写 recall-runtime.json，TUI 滑块实时读取）",
                input: objectSchema({
                    effort: numberSchema("档位 0-6，0=OFF，1-6 递增预算/topK/相关性放宽"),
                    enabled: booleanSchema("启用自动召回功能（可选，默认保持现有）"),
                }, ["effort"]),
                async execute(args) {
                    try {
                        const rec = setRecallLevel(args.effort);
                        return textResult(JSON.stringify({ success: true, enabled: rec.enabled, effort: rec.effort, budget: rec.budget, topK: rec.topK, label: rec.label, labelZh: rec.labelZh, pct: rec.pct, relMin: rec.relMin, updated_at: rec.updated_at }, null, 2));
                    } catch (e) {
                        return textResult(JSON.stringify({ success: false, error: e.message }, null, 2));
                    }
                },
            });

            editor.add({
                name: "memory_recall_enable",
                description: "启用/关闭自动召回功能（开=显示滑块+生效；关=隐藏滑块+仅主动召回）",
                input: objectSchema({
                    enabled: booleanSchema("true=启用，false=关闭（默认=关闭，仅主动召回）"),
                }, ["enabled"]),
                async execute(args) {
                    try {
                        const rec = setRecallEnabled(args.enabled);
                        return textResult(JSON.stringify({ success: true, enabled: rec.enabled, effort: rec.effort, label: rec.label, labelZh: rec.labelZh, pct: rec.pct, updated_at: rec.updated_at }, null, 2));
                    } catch (e) {
                        return textResult(JSON.stringify({ success: false, error: e.message }, null, 2));
                    }
                },
            });

            editor.add({
                name: "memory_recall_status",
                description: "查看自动召回功能开关、档位与预设",
                input: objectSchema(),
                async execute() {
                    try {
                        const p = loadRecallParams();
                        return textResult(JSON.stringify({
                            success: true,
                            enabled: p.enabled,
                            effort: p.effort,
                            label: p.label,
                            labelZh: p.labelZh,
                            pct: p.pct,
                            budget: p.budget,
                            topK: p.topK,
                            tempMin: p.tempMin,
                            relMin: p.relMin,
                            cold: p.cold,
                            updated_at: p.updated_at,
                            runtime_file: RECALL_RUNTIME_PATH,
                        }, null, 2));
                    } catch (e) {
                        return textResult(JSON.stringify({ success: false, error: e.message }, null, 2));
                    }
                },
            });

            editor.add({
                name: "memory_recall_preview",
                description: "预览自动召回候选（四道闸门+Token预算，不写库）",
                input: objectSchema({
                    query: stringSchema("上下文关键词（可选，默认取最近消息）"),
                    limit: numberSchema("返回条数，默认 10"),
                }),
                async execute(args) {
                    try {
                        const p = loadRecallParams();
                        const candidates = autoRecallCandidates(args.query || "", p);
                        return textResult(JSON.stringify({
                            success: true,
                            effort: p.effort,
                            budget_tokens: Math.floor(p.budget * BASE_CONTEXT_TOKENS),
                            selected: candidates.slice(0, args.limit || 10).map(c => ({
                                id: c.id,
                                relevance: Number(c.relevance.toFixed(3)),
                                temperature: Number(c.temperature.toFixed(3)),
                                tokens: c.tokens,
                                source_type: c.source_type,
                                content: c.content.slice(0, 80) + (c.content.length > 80 ? "…" : ""),
                            })),
                        }, null, 2));
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

        // ===== P6 自动召回钩子（事件驱动，非定时；默认 OFF；fail-open；绝不写 event.system 保 Prompt Cache） =====
        // Prompt 钩子：深检索 → ctx.session.synthetic 注入合成用户消息。
        // synthetic 消息不重跑 prompt 钩子（官方确认）→ 无递归。零共享状态。
        await ctx.session.hook("prompt", async (event) => {
            try {
                const params = loadRecallParams();
                if (!params.enabled || params.effort === 0) return; // 零开销短路：功能关 或 档位0 → 不检索/不写库/不日志
                const text = event.prompt?.text ?? "";
                if (!text) return;
                if (isRecallBlock(text)) return; // B 兜底：synthetic 召回消息不重跑 prompt（防自引用/重复注入）
                const candidates = autoRecallCandidates(text, params);
                if (candidates.length === 0) {
                    // 诊断：prompt 钩子跑了但无候选（区分"钩子没跑" vs "跑了无候选"）
                    logRecallHook("prompt-skip", text, null, undefined, { reason: "no-candidates", relMin: params.relMin, tempMin: params.tempMin });
                    return;
                }
                const block = formatRecallBlock(candidates);
                if (event.sessionID) {
                    await ctx.session.synthetic({ sessionID: event.sessionID, text: block });
                    logRecallHook("prompt", text, candidates, true);
                }
            } catch (e) { /* fail-open：出错就当没召回 */ }
        });

        // Context 钩子：浅检索 → 只改当次 in-flight event（event.messages 追加 synthetic 消息），不持久化。
        // 绝不 push 到 event.system（System Prompt 字节级稳定，保 Prompt Cache）。零共享状态。
        // 诊断：context 钩子历史 0 触发，加 context-skip/context-error log 定位原因（query 提取？候选？结构？）
        await ctx.session.hook("context", (event) => {
            try {
                const params = loadRecallParams();
                if (!params.enabled || params.effort === 0) return; // 零开销短路：功能关 或 档位0
                // 浅检索：topK 上限 2、预算上限 2%（比深检索轻）
                const shallow = { ...params, topK: Math.min(2, params.topK), budget: Math.min(0.02, params.budget) };
                const msgs = Array.isArray(event.messages) ? event.messages : [];
                // 宽松 query 提取：倒序找最后一条 user 消息的任何 text（兼容 parts/content/字符串多种结构）
                // A 方案：跳过 synthetic 消息（召回合成消息会污染 query → 自引用循环）+ 跳过召回块内容
                let query = "";
                let lastRole = "empty";
                for (let i = msgs.length - 1; i >= 0; i--) {
                    const m = msgs[i];
                    if (!m) continue;
                    if (m.synthetic === true) continue; // 跳过合成消息（召回注入的，非用户真实输入）
                    const role = m.role ?? m.type ?? "";
                    lastRole = String(role);
                    if (role !== "user" && role !== undefined && role !== "") continue;
                    const parts = Array.isArray(m.parts) ? m.parts : Array.isArray(m.content) ? m.content : [];
                    const texts = [];
                    for (const p of parts) {
                        if (!p) continue;
                        const t = typeof p === "string" ? p : (p.text ?? p.content ?? "");
                        if (t) texts.push(String(t));
                    }
                    if (texts.length) {
                        query = texts.join(" ");
                        if (isRecallBlock(query)) { query = ""; continue; } // 召回块污染 → 继续往前找真实用户消息
                        break;
                    }
                }
                if (!query) {
                    // 诊断：context 钩子跑了但 query 提取失败（event.messages 结构问题）
                    logRecallHook("context-skip", null, null, undefined, { reason: "no-query", msgsLen: msgs.length, lastRole });
                    return;
                }
                const candidates = autoRecallCandidates(query, shallow);
                if (candidates.length === 0) {
                    // 诊断：query 提取成功但无候选（门槛问题）
                    logRecallHook("context-skip", query, null, undefined, { reason: "no-candidates", relMin: shallow.relMin, tempMin: shallow.tempMin, topK: shallow.topK });
                    return;
                }
                const block = formatRecallBlock(candidates);
                // A 方案（2026-11-07 实测）：context 注入已关——prompt 钩子 synthetic 是已验证的可靠主通道，
                // context 注入会 persist 污染消息流且与 prompt 重复（双召回块，冗余）。context 钩子仅做诊断记录。
                // 注：opencode message 结构 = { role, content: [{ type: "text", text }] }（OpenAI 形状，用 parts 报 i.content.map）。
                logRecallHook("context", query, candidates, false);
            } catch (e) {
                // 诊断：context 钩子异常（之前静默吞掉，现在记录）
                logRecallHook("context-error", null, null, undefined, { err: String(e).slice(0, 150) });
            }
        });

        // 梦想家周期定时（核心系统维护：巩固流转/温度重算/过期标记）。
        // fragment-config.json 的 dream.interval_hours 控制（0=关闭，默认 6h）。
        try {
            const dreamCfg = (loadFragmentConfig().dream ?? {});
            const intervalHours = typeof dreamCfg.interval_hours === "number" ? dreamCfg.interval_hours : 6;
            if (intervalHours > 0) {
                // 防热重载泄漏：先清旧 timer 再建新
                if (_dreamTimer) clearInterval(_dreamTimer);
                if (_dreamBootTimer) clearTimeout(_dreamBootTimer);
                _dreamTimer = setInterval(() => { try { dreamerRun(); } catch (e) {} }, intervalHours * 60 * 60 * 1000);
                _dreamBootTimer = setTimeout(() => { try { dreamerRun(); } catch (e) {} }, 60 * 60 * 1000); // 延迟首跑
            }
        } catch (e) {}
    },
});
