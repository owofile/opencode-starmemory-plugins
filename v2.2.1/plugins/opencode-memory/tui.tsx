/**
 * StarMenory TUI —— 终端内的记忆可视化 / 管理界面
 *
 * 设计语言（借鉴 world.execute(me); MV 的代码/HUD 美学）：
 *  - 页面即代码：标题 `star-memory.execute(me);`，说明用 // 注释风
 *  - HUD 行：sec / rev / beat / 时码 —— 左仪表右时码，beat 表示变更渐退进度
 *  - readout 键值列严格对齐；坚固的 █░ 激活度条；callout 走线注记
 *  - 动效克制：打字机入场、条形生长、变更时 3 档高亮渐退（rev→beat）
 *  - 无常驻动画：入场完成即停时钟，时码 10fps（页面打开期间）
 */
import { Plugin } from "@opencode/plugin/tui";
import { For, Show, createMemo, createSignal, onCleanup } from "solid-js";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { fileURLToPath } from "url";

const PLUGIN_DIR = path.dirname(fileURLToPath(import.meta.url));
const HOME_DIR = process.env.USERPROFILE || process.env.HOME || os.homedir();
const CONFIG_DIR = path.join(HOME_DIR, ".config", "opencode");

const FRAGMENTS_PATH = path.join(CONFIG_DIR, "fragments.json");
const SYNONYM_MAP_PATH = path.join(CONFIG_DIR, "associations_map.json");
const FRAGMENT_CONFIG_PATH = path.join(PLUGIN_DIR, "fragment-config.json");
const RECALL_RUNTIME_PATH = path.join(CONFIG_DIR, "recall-runtime.json"); // P6 自动召回运行时档位（滑块写/钩子读）
const AGENTS_PATH = path.join(CONFIG_DIR, "AGENTS.md"); // 全局规则文件（opencode 自动注入 system prompt）
const AGENTS_SEGMENTS_PATH = path.join(CONFIG_DIR, "agents-segments.json"); // 说明片段：开关 + 自定义内容（开=注入 AGENTS.md / 关=隐藏）
const MEMORY_PATH = path.join(CONFIG_DIR, "memory.json"); // USER PREFERENCES/STRICT 数据（字段默认值来源）

const PER_PAGE = 14;

interface Fragment {
    id: string;
    content: string;
    category?: string;
    layer?: string;
    weight?: number;
    associations?: string[];
    created_at?: string;
    access_count?: number;
    last_recalled?: string | null;
    recall_frequency?: number;
    // Schema 分类字段（核心系统）
    source_type?: string;
    confidence?: number;
    memory_type?: string;
    ttl_policy?: string;
    expires_at?: string | null;
    consolidation_status?: string;
    consolidation_at?: string | null;
    base_activation?: number;
    stability?: number;
    decay_rate?: number;
    last_accessed_at?: string | null;
    use_history?: string;
}

// ---------- 数据读取 ----------

function readJson(p: string): any {
    try {
        return JSON.parse(fs.readFileSync(p, "utf-8"));
    } catch {
        return null;
    }
}

function loadFragments(): Fragment[] {
    const data = readJson(FRAGMENTS_PATH);
    return Array.isArray(data?.fragments) ? data.fragments : [];
}

// 【手动召回预览】相关性计算（与 index.js STOP_WORDS/expandQuery/computeRelevance/computeActivation 同步）。
// 预览专用（/recall-test 命令 + /memory 召回 Tab）：真实召回在 server 钩子（index.js），此处只复现评分供显示。
const STOP_WORDS = new Set([
    "ok","好的","已经","现在","输入","测试","来","看","一下","吗","呢","的","了","是","在","我","你","他","她","它","这","那",
    "怎么","什么","为什么","可以","能","要","会","都","也","就","还","把","被","让","给","跟","和","与","或","但","因为","所以",
    "重启","开始","继续","加油","正常","显示","问题","报错","没有","今天","刚刚","直接","应该","需要","看到","这边","那边",
    "一个","一些","这种","那种","这个","那个","这些","那些","非常","比较","稍微","真的","确实","好像","似乎","可能","不然","反正",
    "我们","你们","他们","自己","什么","怎么","为什么","怎么样","如何","多少","几个",
]);
function expandQuery(query: string): string[] {
    const expanded = new Set<string>();
    const segments = query.split(/[\s,，。：；！？、,.:;!?()（）]+/).filter(Boolean);
    for (const seg of segments) {
        const lower = seg.toLowerCase();
        if (STOP_WORDS.has(lower)) continue;
        if (seg.length < 2) continue;
        expanded.add(seg);
        expanded.add(lower);
        const chineseOnly = seg.replace(/[^\u4e00-\u9fa5]/g, "");
        if (chineseOnly.length >= 3 && chineseOnly.length <= 16) {
            for (let i = 0; i < chineseOnly.length - 1; i++) {
                const bigram = chineseOnly.slice(i, i + 2);
                if (!STOP_WORDS.has(bigram)) expanded.add(bigram);
            }
        }
    }
    expanded.add(query);
    expanded.add(query.toLowerCase());
    return Array.from(expanded);
}
function computeRelevance(f: any, terms: string[]): number {
    if (!terms || terms.length === 0) return 0;
    const content = (f.content || "").toLowerCase();
    const assocs = Array.isArray(f.associations) ? f.associations : [];
    const userWords = terms.filter((t) => { const l = (t || "").toLowerCase(); return l.length >= 2 && !/\s/.test(l); });
    if (userWords.length === 0) return 0;
    let hits = 0;
    for (const q of userWords) {
        const lq = (q || "").toLowerCase();
        if (content.includes(lq)) { hits++; continue; }
        if (assocs.some((a: any) => (a || "").toLowerCase().includes(lq))) hits++;
    }
    return Math.min(1, hits / Math.min(userWords.length, 4));
}
function computeActivation(f: any, now: number): number {
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
    const decay = Math.exp(-decayRate * (1 - stability) * days);
    return Math.max(0, Math.min(1, base * decay));
}
// 召回预览：当前档位参数下，query 会召回哪些记忆（consolidated + 四道闸门 + 排序 + topK 截断）
function previewRecall(query: string): Array<{ tag?: string; content?: string; rel?: number }> | null {
    const q = (query || "").trim();
    if (!q) return null;
    const rt = loadRecallRuntime();
    const params = RECALL_PRESETS[Math.max(0, Math.min(6, Number(rt.effort) || 0))];
    if (!rt.enabled || params.effort === 0 || params.topK <= 0) return [];
    const terms = expandQuery(q);
    const now = Date.now();
    const scored: Array<any> = [];
    for (const f of loadFragments() as any[]) {
        if (f.consolidation_status !== "consolidated") continue;
        if (f.expires_at && new Date(f.expires_at).getTime() <= now) continue;
        const temp = computeActivation(f, now);
        if (temp < params.tempMin) continue;
        const rel = computeRelevance(f, terms);
        if (rel < params.relMin) continue;
        const cold = temp < 0.3;
        if (cold) {
            if (!params.cold) continue;
            if (f.source_type !== "corroborated" && f.source_type !== "user_confirmed") continue;
        }
        scored.push({ f, rel, temp });
    }
    scored.sort((a, b) => b.rel - a.rel);
    return scored.slice(0, params.topK).map((c) => ({
        tag: c.f.source_type === "corroborated" ? "佐证" : c.f.source_type === "user_confirmed" ? "确认" : "",
        content: c.f.content,
        rel: c.rel,
    }));
}

function loadSynonymMap(): Record<string, string[]> {
    const raw = readJson(SYNONYM_MAP_PATH);
    const map: Record<string, string[]> = {};
    for (const [key, value] of Object.entries(raw ?? {})) {
        if (Array.isArray(value)) map[key.toLowerCase()] = value;
    }
    return map;
}

function loadFragConfig(): any {
    return {
        json_max_count: 200,
        cold_data_days: 30,
        cold_data_age_days: 60,
        last_compact: null as string | null,
        ...(readJson(FRAGMENT_CONFIG_PATH) ?? {}),
    };
}

// ---- P6 自动召回运行时（滑块/功能开关 ↔ recall-runtime.json ↔ index.js 钩子） ----
function loadRecallRuntime(): { enabled: boolean; effort: number } {
    const data = readJson(RECALL_RUNTIME_PATH);
    const e = Number(data?.effort);
    return {
        enabled: data?.enabled === true,
        effort: Number.isFinite(e) ? Math.max(0, Math.min(6, Math.floor(e))) : 0,
    };
}

function saveRecallEffort(effort: number): boolean {
    try {
        const cur = loadRecallRuntime();
        const lv = Math.max(0, Math.min(6, Math.floor(Number(effort) || 0)));
        fs.mkdirSync(CONFIG_DIR, { recursive: true });
        fs.writeFileSync(RECALL_RUNTIME_PATH, JSON.stringify({ enabled: cur.enabled, effort: lv, updated_at: new Date().toISOString() }, null, 2), "utf-8");
        return true;
    } catch {
        return false;
    }
}

function saveRecallEnabled(enabled: boolean): boolean {
    try {
        const cur = loadRecallRuntime();
        fs.mkdirSync(CONFIG_DIR, { recursive: true });
        fs.writeFileSync(RECALL_RUNTIME_PATH, JSON.stringify({ enabled: !!enabled, effort: cur.effort, updated_at: new Date().toISOString() }, null, 2), "utf-8");
        return true;
    } catch {
        return false;
    }
}

// ---- 通用设置（fragment-config.json `general` 块；持久、跨进程，TUI + index.js 均可读） ----
// 目前仅语言；后续功能往 general 加键即可。
function loadLang(): "en" | "zh" {
    const g = readJson(FRAGMENT_CONFIG_PATH)?.general;
    return g?.lang === "zh" ? "zh" : "en"; // 默认英文
}

function saveLang(lang: "en" | "zh"): boolean {
    try {
        const cfg = readJson(FRAGMENT_CONFIG_PATH) ?? {};
        cfg.general = { ...(cfg.general ?? {}), lang };
        fs.mkdirSync(PLUGIN_DIR, { recursive: true });
        fs.writeFileSync(FRAGMENT_CONFIG_PATH, JSON.stringify(cfg, null, 2), "utf-8");
        return true;
    } catch {
        return false;
    }
}

// 语言响应式状态（模块级；设置页切换即时反映到滑块/状态条）
const [langState, setLangState] = createSignal<"en" | "zh">(loadLang());

// ---------- AGENTS.md 管理（P7：/memory 专门 Tab，模板 + 字段编辑 + 手动更改） ----------
// 字段定义：key 对应 AGENTS.md 里 `key: value` 行（YAML 风格）。username/reasoningLanguage 等核心字段。
const AGENTS_FIELDS: Array<{ key: string; i18n: string; def: string }> = [
    { key: "username", i18n: "agentsFieldUsername", def: "" },
    { key: "assistantName", i18n: "agentsFieldAssistant", def: "" },
    { key: "reasoningLanguage", i18n: "agentsFieldReasoning", def: "中文" },
    { key: "responseStyle", i18n: "agentsFieldStyle", def: "" },
    { key: "language", i18n: "agentsFieldLang", def: "中文" },
];

// 字段预设选项（模板）：有预设的字段用 dialog.select（预设 + 自定义入口）；无预设（username/assistantName）用自由输入。
// 默认值不动（def 保留），仅增加选项。用户可随时选"自定义..."走 prompt 自由输入。
const AGENT_FIELD_OPTIONS: Record<string, string[]> = {
    reasoningLanguage: ["中文", "English"],
    responseStyle: ["简洁直接", "详细全面", "温和友好"],
    language: ["中文", "English"],
};

// ---------- 说明片段（P8：一段一段、可开关、可自定义；开=注入 AGENTS.md，关=隐藏） ----------
// 与模板（整体替换）不同：片段是独立可开关段落，开关状态 + 自定义内容存 agents-segments.json。
// 渲染时启用的片段拼进 AGENTS.md 的标记区内（标记前后为用户基础内容，模板/字段/手动编辑不受影响）。
const SEG_MARK_START = "<!-- starmemory:segments -->";
const SEG_MARK_END = "<!-- /starmemory:segments -->";
const AGENTS_SEGMENTS: Array<{ id: string; i18n: string; defEnabled: boolean; defContent: string }> = [
    {
        id: "utf8",
        i18n: "agentsSegUtf8",
        defEnabled: true,
        defContent: [
            "## Windows 编码（UTF-8）",
            "",
            "PowerShell 5.1 中文系统默认代码页 GBK（gb2312 / chcp 936），不是 UTF-8，shell 里碰中文易乱码。",
            "",
            "- 读中文文件用 read / grep 工具，别用 Get-Content / type / cat",
            "- 写 .ps1 脚本注释用英文（中文注释 UTF-8 无 BOM 会让解析失败）",
            "- 输出可能含中文的命令前加 [Console]::OutputEncoding=[System.Text.Encoding]::UTF8",
            "- Node 脚本不受影响（原生 UTF-8），只有 Windows PowerShell 控制台这一层是坑",
        ].join("\n"),
    },
];

// 模板：`{{key}}` 占位符运行时替换成字段值。提供 4 套（中文/英文 × 简洁/详细）。
const AGENTS_TEMPLATES: Array<{ id: string; i18n: string; content: string }> = [
    {
        id: "zh-basic", i18n: "agentsTplZhBasic",
        content: [
            "# StarMemory 全局规则",
            "",
            "## 身份",
            "- username: {{username}}",
            "- assistantName: {{assistantName}}",
            "",
            "## 语言与风格",
            "- reasoningLanguage: {{reasoningLanguage}}",
            "- responseStyle: {{responseStyle}}",
            "- language: {{language}}",
            "",
            "## 行为约束",
            "- 下载任何依赖/库/文件前必须先询问用户",
            "- 删除和下载操作必须暂停执行",
        ].join("\n"),
    },
    {
        id: "zh-full", i18n: "agentsTplZhFull",
        content: [
            "# StarMemory 全局规则（详细）",
            "",
            "## 身份",
            "- username: {{username}}",
            "- assistantName: {{assistantName}}",
            "",
            "## 语言与风格",
            "- reasoningLanguage: {{reasoningLanguage}}",
            "- responseStyle: {{responseStyle}}",
            "- language: {{language}}",
            "",
            "## 行为约束",
            "- 下载任何依赖/库/文件前必须先询问用户",
            "- 删除和下载操作必须暂停执行",
            "- 清理/删除文件前必须核实其确实未被代码或配置引用，只删除确认不用的东西",
            "",
            "## 记忆协作",
            "- AI 应在合适时机自动使用碎片记忆记住用户提到的偏好、习惯等信息，无需用户明确要求",
            "- 在编程任务中主动观察并记忆用户的代码风格偏好（如缩进、命名规范、注释习惯）、常用工具和框架",
            "- 当用户询问无从下手或不知道的内容时，只要可能是已记录的信息（如偏好、习惯、配置、账号、历史等），必须优先查询碎片记忆",
        ].join("\n"),
    },
    {
        id: "en-basic", i18n: "agentsTplEnBasic",
        content: [
            "# StarMemory Global Rules",
            "",
            "## Identity",
            "- username: {{username}}",
            "- assistantName: {{assistantName}}",
            "",
            "## Language & Style",
            "- reasoningLanguage: {{reasoningLanguage}}",
            "- responseStyle: {{responseStyle}}",
            "- language: {{language}}",
            "",
            "## Behavior",
            "- Ask before downloading any dependency/library/file",
            "- Pause on delete and download operations",
        ].join("\n"),
    },
    {
        id: "en-full", i18n: "agentsTplEnFull",
        content: [
            "# StarMemory Global Rules (Detailed)",
            "",
            "## Identity",
            "- username: {{username}}",
            "- assistantName: {{assistantName}}",
            "",
            "## Language & Style",
            "- reasoningLanguage: {{reasoningLanguage}}",
            "- responseStyle: {{responseStyle}}",
            "- language: {{language}}",
            "",
            "## Behavior",
            "- Ask before downloading any dependency/library/file",
            "- Pause on delete and download operations",
            "- Verify a file is not referenced by code/config before deleting; only delete confirmed-unused items",
            "",
            "## Memory Collaboration",
            "- Automatically save user preferences/habits to fragment memory when appropriate, without explicit request",
            "- Observe and remember user code style preferences in programming tasks",
            "- When unsure, query fragment memory first before any other search",
        ].join("\n"),
    },
];

// 读 AGENTS.md（不存在返回 null）
function loadAgents(): string | null {
    try {
        return fs.readFileSync(AGENTS_PATH, "utf-8");
    } catch {
        return null;
    }
}

// 从 memory.json USER PREFERENCES 取默认字段值（username→name 等）
function loadPrefDefaults(): Record<string, string> {
    const prefs = readJson(MEMORY_PATH)?.user?.preferences ?? {};
    const m: Record<string, string> = {};
    if (prefs.name) m.username = String(prefs.name);
    if (prefs.assistantName) m.assistantName = String(prefs.assistantName);
    if (prefs.language) m.language = String(prefs.language);
    if (prefs.responseStyle) m.responseStyle = String(prefs.responseStyle);
    return m;
}

// 从 AGENTS.md 内容解析字段值（`- key: value` 或 `key: value`）
function parseAgentsFields(content: string): Record<string, string> {
    const out: Record<string, string> = {};
    for (const f of AGENTS_FIELDS) {
        const re = new RegExp(`(?:^|\\n)\\s*-?\\s*${f.key}\\s*[:：]\\s*(.+?)\\s*(?:\\n|$)`, "i");
        const m = content.match(re);
        if (m && m[1] && !m[1].includes("{{")) out[f.key] = m[1].trim();
    }
    return out;
}

// 渲染模板：{{key}} → 字段值（缺失用默认）
function renderTemplate(tpl: string, fields: Record<string, string>): string {
    let out = tpl;
    for (const f of AGENTS_FIELDS) {
        out = out.split(`{{${f.key}}}`).join(fields[f.key] ?? f.def);
    }
    return out;
}

// 应用字段值到内容：已有 `key: value` 行替换，否则追加到末尾（空值且无行则跳过，避免追加空行）。返回新内容。
function applyFieldsToContent(content: string, fields: Record<string, string>): string {
    let out = content;
    for (const f of AGENTS_FIELDS) {
        const v = fields[f.key] ?? f.def;
        const re = new RegExp(`(^|\\n)(\\s*-?\\s*${f.key}\\s*[:：]\\s*)(.*?)(\\s*\\n|$)`, "i");
        if (re.test(out)) {
            out = out.replace(re, `$1$2${v}$4`);
        } else if (v) {
            out = out.replace(/\s*$/, "") + `\n- ${f.key}: ${v}\n`;
        }
    }
    return out;
}

// 写 AGENTS.md
function saveAgents(content: string): boolean {
    try {
        fs.mkdirSync(CONFIG_DIR, { recursive: true });
        fs.writeFileSync(AGENTS_PATH, content, "utf-8");
        return true;
    } catch {
        return false;
    }
}

// ---------- 说明片段：读写 agents-segments.json + 重建 AGENTS.md ----------
type SegState = { enabled: boolean; content: string };
function loadSegments(): Record<string, SegState> {
    try {
        const d = JSON.parse(fs.readFileSync(AGENTS_SEGMENTS_PATH, "utf-8"));
        return d && typeof d === "object" ? d : {};
    } catch { return {}; }
}
function saveSegments(segs: Record<string, SegState>): void {
    try {
        fs.mkdirSync(CONFIG_DIR, { recursive: true });
        fs.writeFileSync(AGENTS_SEGMENTS_PATH, JSON.stringify(segs, null, 2), "utf-8");
    } catch {}
}
function segState(id: string): SegState {
    const d = AGENTS_SEGMENTS.find((s) => s.id === id);
    return { enabled: d?.defEnabled ?? false, content: d?.defContent ?? "" };
}
// 重建 AGENTS.md = 基础内容（标记区前）+ 启用的片段（标记区内）。无启用片段则不输出标记区。
function rebuildAgents(base: string, segs: Record<string, SegState>): string {
    const startIdx = base.indexOf(SEG_MARK_START);
    const basePart = (startIdx >= 0 ? base.slice(0, startIdx) : base).replace(/\s+$/, "");
    const enabledParts = AGENTS_SEGMENTS
        .filter((s) => (segs[s.id] ?? segState(s.id)).enabled)
        .map((s) => (segs[s.id] ?? segState(s.id)).content);
    if (enabledParts.length === 0) return basePart;
    return `${basePart}${basePart ? "\n\n" : ""}${SEG_MARK_START}\n${enabledParts.join("\n\n")}\n${SEG_MARK_END}`;
}

// ---------- 开发者模式（P9：Overview 标题点 5 下解锁；硬性规则快速编辑，不面向用户） ----------
// 解锁状态存 agents-segments.json 顶层 _devUnlocked（持久，重开 /memory 仍解锁）
function loadDevUnlocked(): boolean {
    return !!(readJson(AGENTS_SEGMENTS_PATH)?._devUnlocked);
}
function saveDevUnlocked(v: boolean): void {
    try {
        const d = readJson(AGENTS_SEGMENTS_PATH) ?? {};
        d._devUnlocked = v;
        fs.mkdirSync(CONFIG_DIR, { recursive: true });
        fs.writeFileSync(AGENTS_SEGMENTS_PATH, JSON.stringify(d, null, 2), "utf-8");
    } catch {}
}
function saveMemoryJson(mem: any): boolean {
    try {
        fs.mkdirSync(CONFIG_DIR, { recursive: true });
        fs.writeFileSync(MEMORY_PATH, JSON.stringify(mem, null, 2), "utf-8");
        return true;
    } catch { return false; }
}

// i18n 字典：MemoryPage 硬编码文字统一走这里。新增 Tab/功能时加 key 即可，zh/en 两套对齐。
const I18N = {
    zh: {
        tabOverview: "概览", tabList: "列表", tabRecall: "召回", tabAgents: "AGENTS",
        hintCycle: "切换", hintSelect: "选择", hintFold: "折叠",
        hintSettings: "设置", hintManage: "管理", hintBack: "返回",
        recallStateHint: "侧栏滑块调整档位",
        diagTrig: "触发", diagInj: "注入", diagBlock: "拦截", diagCand: "候选",
        avgPerHit: "条/次",
        recallDesc0: "自动召回关闭，仅显式搜索 / 工具触发",
        recallDesc1: "极轻：只翻热记忆，注入 1 条",
        recallDesc2: "轻：热记忆，注入 2 条",
        recallDesc3: "平衡（推荐）：热 + 温，注入 2 条",
        recallDesc4: "较强：热 + 温 + 部分冷，注入 3 条",
        recallDesc5: "强：放宽相关性下限，注入 4 条",
        recallDesc6: "最强：翻冷记忆，注入 5 条，预算 5%",
        recallHintPrefix: "自动召回 · 注入",
        recallHintUnit: "条",
        recallHintExpand: "展开",
        recallHistoryTitle: "召回历史",
        recallHistoryUnit: "条",
        recallHistoryEmpty: "暂无召回记录",
        recallHistoryItems: " 条",
        recallTestUsage: "用法: /recall-test 关键词（如 Termux SSH）",
        recallTestOff: "自动召回已关闭（档位 0），先在 /memory 打开",
        recallTestNone: "无匹配记忆: ",
        agentsPath: "全局规则文件",
        agentsNone: "未创建",
        agentsTemplate: "模板",
        agentsFields: "字段",
        agentsContent: "内容",
        agentsSave: "保存",
        agentsReload: "重载",
        agentsEdit: "手动编辑",
        agentsSaved: "已保存到",
        agentsNoFields: "无字段（手动编辑模式）",
        agentsPlaceholder: "输入值（Enter 确认 / Esc 取消）",
        agentsFieldUsername: "用户名",
        agentsFieldAssistant: "助手名",
        agentsFieldReasoning: "思维链语言",
        agentsFieldStyle: "回复风格",
        agentsFieldLang: "界面语言",
        agentsTplZhBasic: "中文简洁",
        agentsTplZhFull: "中文详细",
        agentsTplEnBasic: "英文简洁",
        agentsTplEnFull: "英文详细",
        agentsCustom: "自定义...",
        agentsCustomDesc: "手动输入任意值（Enter 确认 / Esc 取消）",
        agentsFieldCur: "当前",
        agentsSegments: "说明片段",
        agentsSegUtf8: "Windows 编码",
        agentsSegDesc: "开=注入 AGENTS.md / 关=隐藏；Enter 切换，编辑按钮改内容",
        agentsEditSeg: "编辑片段",
        tabDev: "开发者",
        devRules: "硬性规则",
        devAddRule: "添加规则",
    },
    en: {
        tabOverview: "Overview", tabList: "List", tabRecall: "Recall", tabAgents: "AGENTS",
        hintCycle: "cycle", hintSelect: "select", hintFold: "fold",
        hintSettings: "settings", hintManage: "manage", hintBack: "back",
        recallStateHint: "adjust via sidebar slider",
        diagTrig: "trig", diagInj: "inj", diagBlock: "block", diagCand: "cand",
        avgPerHit: "/hit",
        recallDesc0: "auto recall off, only explicit search/tool",
        recallDesc1: "minimal: hot only, inject 1",
        recallDesc2: "light: hot memory, inject 2",
        recallDesc3: "balanced (recommended): hot+warm, inject 2",
        recallDesc4: "stronger: hot+warm+some cold, inject 3",
        recallDesc5: "strong: relax relevance floor, inject 4",
        recallDesc6: "max: cold memory, inject 5, budget 5%",
        recallHintPrefix: "Auto recall · injected",
        recallHintUnit: "items",
        recallHintExpand: "expand",
        recallHistoryTitle: "Recall History",
        recallHistoryUnit: "entries",
        recallHistoryEmpty: "No recall records",
        recallHistoryItems: " items",
        recallTestUsage: "Usage: /recall-test <keyword> (e.g. Termux SSH)",
        recallTestOff: "Auto recall off (effort 0), enable in /memory first",
        recallTestNone: "No match: ",
        agentsPath: "global rules file",
        agentsNone: "not created",
        agentsTemplate: "template",
        agentsFields: "fields",
        agentsContent: "content",
        agentsSave: "save",
        agentsReload: "reload",
        agentsEdit: "manual edit",
        agentsSaved: "saved to",
        agentsNoFields: "no fields (manual edit mode)",
        agentsPlaceholder: "enter value (Enter confirm / Esc cancel)",
        agentsFieldUsername: "username",
        agentsFieldAssistant: "assistant",
        agentsFieldReasoning: "reasoning language",
        agentsFieldStyle: "response style",
        agentsFieldLang: "interface language",
        agentsTplZhBasic: "Chinese basic",
        agentsTplZhFull: "Chinese detailed",
        agentsTplEnBasic: "English basic",
        agentsTplEnFull: "English detailed",
        agentsCustom: "Custom...",
        agentsCustomDesc: "enter any value (Enter confirm / Esc cancel)",
        agentsFieldCur: "current",
        agentsSegments: "segments",
        agentsSegUtf8: "Windows encoding",
        agentsSegDesc: "on=inject AGENTS.md / off=hide; Enter toggles, edit button edits content",
        agentsEditSeg: "edit segment",
        tabDev: "Developer",
        devRules: "hard rules",
        devAddRule: "add rule",
    },
} as const;
type I18nKey = keyof typeof I18N.zh;
// t() 读 langState() → 响应式：设置里切语言后，所有 t() 文字即时重渲染
const t = (k: I18nKey): string => I18N[langState()][k] ?? k;

// ---------- 文本工具（中文双宽度感知） ----------

function oneLine(s: string): string {
    return String(s ?? "").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
}

function dw(s: string): number {
    let w = 0;
    for (const ch of s) w += (ch.codePointAt(0) ?? 0) >= 0x2e80 ? 2 : 1;
    return w;
}

function padEndDW(s: string, n: number): string {
    const diff = n - dw(s);
    return diff > 0 ? s + " ".repeat(diff) : s;
}

function cutDW(s: string, w: number): string {
    const src = oneLine(s);
    if (dw(src) <= w) return src;
    let acc = 0;
    let out = "";
    for (const ch of src) {
        const cw = (ch.codePointAt(0) ?? 0) >= 0x2e80 ? 2 : 1;
        if (acc + cw > w) break;
        acc += cw;
        out += ch;
    }
    return out + "…";
}

/** 内部填充：仅 █░，不带括号 */
function heatFill(ratio: number, width = 10): string {
    const f = Math.max(0, Math.min(width, Math.round(ratio * width)));
    return "█".repeat(f) + "░".repeat(width - f);
}

/** 括号条形：[████░░]，仪表盘母题 */
function heatBar(ratio: number, width = 10): string {
    return "[" + heatFill(ratio, width) + "]";
}

/** 右侧摘要对齐用面板内容宽度（近似：80 列终端 - border 2 - padding 2×2） */
const GAUGE = 72;

/** label 靠左 / value 靠右，中间空隙自动算满（min 1 空格）；超宽时截断 value */
function justify(label: string, value: string, gauge: number = GAUGE): string {
    const lw = dw(label);
    const vw = dw(value);
    if (lw + vw + 1 > gauge) {
        const maxV = gauge - lw - 1;
        return label + " " + (maxV > 0 ? cutDW(value, maxV) : "");
    }
    return label + " ".repeat(gauge - lw - vw) + value;
}

/** 动态走线分区头：▼/▶ 标题 ──────── 右侧摘要 */
function secHeader(title: string, summary: string, open: boolean, gauge: number = GAUGE): string {
    const head = (open ? "▼ " : "▶ ") + title + " ";
    const dashes = Math.max(2, gauge - dw(head) - dw(summary));
    return head + "─".repeat(dashes) + summary;
}

/** 侧栏宽度（visual-cache 默认 26 / MIN 20，留 border+padding 余量） */
const SIDEBAR_GAUGE = 26;

/** 压暗颜色（hex × factor），用于次要文字 / 边框 */
function dimColor(hex: string, factor = 0.5): string {
    const m = /^#?([0-9a-fA-F]{6})$/.exec(String(hex ?? ""));
    if (!m) return hex;
    const n = parseInt(m[1], 16);
    const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v * factor))).toString(16).padStart(2, "0");
    return "#" + ch((n >> 16) & 255) + ch((n >> 8) & 255) + ch(n & 255);
}

// ---------- 颜色工具（移植自 opencode-visual-cache 的 dist/core/color.ts，MIT） ----------
// 核心思路：从主题取色后 desaturateTo 降到 Morandi 风格（低饱和、协调但可区分）。
/** 从 hex 字符串或 {r,g,b} 对象提取 0-255 RGB；非法返回 null */
function rgb(raw: unknown): { r: number; g: number; b: number } | null {
    if (typeof raw === "string" && raw.startsWith("#")) {
        const h = raw.slice(1);
        return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
    }
    if (raw && typeof raw === "object") {
        const o = raw as any;
        if (typeof o.r === "number" && typeof o.g === "number" && typeof o.b === "number") {
            const scale = o.r > 1 || o.g > 1 || o.b > 1 ? 1 : 255;
            return { r: Math.round(o.r * scale), g: Math.round(o.g * scale), b: Math.round(o.b * scale) };
        }
    }
    return null;
}
/** HSL 饱和度（0-1） */
function saturation(r: number, g: number, b: number): number {
    const max = Math.max(r, g, b) / 255;
    const min = Math.min(r, g, b) / 255;
    const delta = max - min;
    if (delta === 0) return 0;
    const L = (max + min) / 2;
    return L <= 0.5 ? delta / (max + min) : delta / (2 - max - min);
}
/** 若颜色饱和度超 maxSat，向灰色拉直到降到 maxSat；返回 hex */
function desaturateTo(raw: unknown, maxSat: number, fallback: string): string {
    const c = rgb(raw);
    if (!c) return fallback;
    const sat = saturation(c.r, c.g, c.b);
    if (sat <= maxSat) return "#" + [c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, "0")).join("");
    const luma = c.r * 0.299 + c.g * 0.587 + c.b * 0.114;
    let lo = 0, hi = 1;
    for (let i = 0; i < 12; i++) {
        const mid = (lo + hi) / 2;
        const nr = Math.round(c.r + (luma - c.r) * mid);
        const ng = Math.round(c.g + (luma - c.g) * mid);
        const nb = Math.round(c.b + (luma - c.b) * mid);
        if (saturation(nr, ng, nb) > maxSat) lo = mid;
        else hi = mid;
    }
    const nr = Math.round(c.r + (luma - c.r) * hi);
    const ng = Math.round(c.g + (luma - c.g) * hi);
    const nb = Math.round(c.b + (luma - c.b) * hi);
    return "#" + [nr, ng, nb].map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0")).join("");
}
/** Morandi 风格回退色板（主题缺字段时兜底） */
const FALLBACK = {
    primary: "#8B9DAF",
    text: "#C5C5BB",
    muted: "#7A7A72",
    success: "#9CAF8B",
    warning: "#C5B88D",
    error: "#B08A8A",
    border: "#6B6B63",
};
/** 降饱和上限：Morandi 风格 ≈0.15-0.30 饱和度，0.28 靠上限（保色可区分又不过艳） */
const MAX_SAT = 0.28;
/** 从 opentui 主题映射到 V1 形状（primary/text/textMuted/success/warning/error/border）。
 *  V2 主题结构：primary 在 hue.interactive[300]，语义色在 text.feedback.*（不在 text 顶层）。 */
function mapTheme(theme: any) {
    const text = theme?.text ?? {};
    const feedback = text.feedback ?? {};
    return {
        primary: theme?.hue?.interactive?.[300],
        text: text.base ?? text.default,
        textMuted: text.muted ?? text.subdued,
        success: feedback.success?.base ?? feedback.success?.default,
        warning: feedback.warning?.base ?? feedback.warning?.default,
        error: feedback.error?.base ?? feedback.error?.default,
        border: text.muted ?? text.subdued,
    };
}

function fmtClock(msTotal: number): string {
    const t = Math.max(0, Math.floor(msTotal));
    const m = Math.floor(t / 60000);
    const s = Math.floor((t % 60000) / 1000);
    const f = t % 1000;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(f).padStart(3, "0")}`;
}

// ---------- 召回滑块：单焦点居中 + 惯性进度条 + 呼吸（P6 高质感版） ----------
// 档位名（用户定稿）：0 OFF / 1 MIN / 2 LIGHT / 3 BAL / 4 STRONG / 5 DEEP / 6 MAX
const RECALL_LEVELS = ["OFF", "MIN", "LIGHT", "BAL", "STRONG", "DEEP", "MAX"];

// 【Alice 新增】P6 底层参数预设（与 index.js RECALL_PRESETS 同步；TUI 展示用，真实生效值在 server）
// effort 0-6 → budget(token占比)/topK(条数)/tempMin(最低温度)/relMin(相关性下限)/cold(是否翻冷记忆)/pct(预算%)
const RECALL_PRESETS = [
    { budget: 0.000, topK: 0, tempMin: 1.01, relMin: 1.01, cold: false, pct: 0 },
    { budget: 0.010, topK: 1, tempMin: 0.70, relMin: 0.80, cold: false, pct: 1 },
    { budget: 0.020, topK: 2, tempMin: 0.60, relMin: 0.75, cold: false, pct: 2 },
    { budget: 0.030, topK: 2, tempMin: 0.50, relMin: 0.70, cold: false, pct: 3 },
    { budget: 0.040, topK: 3, tempMin: 0.40, relMin: 0.65, cold: true, pct: 4 },
    { budget: 0.045, topK: 4, tempMin: 0.30, relMin: 0.60, cold: true, pct: 4.5 },
    { budget: 0.050, topK: 5, tempMin: 0.20, relMin: 0.55, cold: true, pct: 5 },
];
const BASE_CONTEXT_TOKENS = 8000; // 预算换算基准（token）

// 【Alice 新增】list 列标签：类型/状态/来源缩写 + 温度 tier（weight 0-1 → H/W/C）
const typeTag = (mt?: string) => (mt === "preference" ? "PREF" : mt === "procedure" ? "PROC" : mt === "episodic" ? "EPI" : "SEM");
const consTag = (cs?: string) => (cs === "consolidated" ? "C" : cs === "archived" ? "A" : "T");
const srcTag = (st?: string) => (st === "user_confirmed" ? "USER" : st === "corroborated" ? "CORR" : "INF");
const tmpTag = (w?: number) => { const v = w ?? 0.5; return v >= 0.7 ? "H" : v >= 0.35 ? "W" : "C"; };

// 【Alice 新增】recall tab：hook 日志读取 + 滑块轨道/档位说明/底层参数（展示用）
const RECALL_HOOK_LOG = path.join(CONFIG_DIR, "recall-hook.log"); // index.js logRecallHook 写入 {t,kind,query,count,injected}
function readRecallHookLog(): { t: string; kind: string; query: string; count: number; injected: number }[] {
    try {
        if (!fs.existsSync(RECALL_HOOK_LOG)) return [];
        return fs.readFileSync(RECALL_HOOK_LOG, "utf-8").split("\n").filter(Boolean)
            .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    } catch { return []; }
}
// 刻度轨道：当前档 @，其余 o，区间 ─────
function recallTrack(lv: number): string {
    let s = "";
    for (let i = 0; i < 7; i++) {
        s += i === lv ? "@" : "o";
        if (i < 6) s += "─────";
    }
    return s;
}
function recallDesc(lv: number): string {
    return t(`recallDesc${Math.max(0, Math.min(6, lv))}` as I18nKey);
}
function recallParams(lv: number): string {
    const p = RECALL_PRESETS[Math.max(0, Math.min(6, lv))];
    const tok = Math.floor(p.budget * BASE_CONTEXT_TOKENS);
    return `budget ${p.pct}% (~${tok} tok) · topK ${p.topK} · tempMin ${p.tempMin} · relMin ${p.relMin} · cold ${p.cold ? "✓" : "✗"}`;
}
// 【Alice 新增】日期格式化（MM/DD，无效/空返回 -）
function fmtDate(iso?: string | null): string {
    if (!iso) return "-";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "-";
    return `${d.getMonth() + 1}/${d.getDate()}`;
}

// 颜色渐变引擎（hex 线性插值）：0%绿 → 25%青 → 50%黄 → 75%橙 → 100%红
function lerpHex(a: string, b: string, t: number): string {
    const pa = parseInt(a.slice(1), 16);
    const pb = parseInt(b.slice(1), 16);
    const ch = (sh: number) =>
        Math.round(((pa >> sh) & 255) + (((pb >> sh) & 255) - ((pa >> sh) & 255)) * t)
            .toString(16)
            .padStart(2, "0");
    return "#" + ch(16) + ch(8) + ch(0);
}
// 滑块渐变已迁到 setup 内（recallGrad/recallColor，主题色）——模块级 RECALL_GRAD/recallLevelColor 已废弃删除

/** 探测元素可用宽度（OpenTUI renderable）：优先 getMaxWidth（父容器约束=可用宽），再 getLayout/getComputedLayout 兜底 */
function measureWidth(el: any): number {
    try {
        const mw = el?.getMaxWidth?.();
        if (mw && typeof mw === "number" && mw > 0 && isFinite(mw)) return mw;
    } catch {}
    try {
        const l = el?.getLayout?.() ?? el?.getComputedLayout?.();
        if (l && typeof l.width === "number" && l.width > 0) return l.width;
    } catch {}
    return 0;
}

/**
 * 容器宽度 hook：box 设 ref + alignSelf stretch 填满侧栏后，读实际宽度驱动内容自适应。
 * 返回 [ref, widthSignal]；未测得（w=0）时由调用方用默认值兜底。组件卸载自动清 timer。
 * 测两次（30ms/150ms）：布局完成时间不定，二次重测兜底。
 */
function useBoxWidth(): [any, () => number] {
    const [w, setW] = createSignal(0);
    const timers: ReturnType<typeof setTimeout>[] = [];
    const ref = (node: any) => {
        for (const t of timers) clearTimeout(t);
        timers.length = 0;
        if (node) {
            const measure = () => {
                const m = measureWidth(node);
                if (m > 0) setW(m);
            };
            timers.push(setTimeout(measure, 30));
            timers.push(setTimeout(measure, 150));
        }
    };
    onCleanup(() => {
        for (const t of timers) clearTimeout(t);
    });
    return [ref, w];
}

// ---------- 统计 ----------

function computeStats() {
    const frags = loadFragments();
    const config = loadFragConfig();
    const byLayer = { surface: 0, deep: 0 };
    const weightBins = { low: 0, mid: 0, high: 0 };
    const catCount = new Map<string, number>();
    const bySourceType: Record<string, number> = {};
    const byMemoryType: Record<string, number> = {};
    const byConsolidation: Record<string, number> = {};
    const byActivation = { hot: 0, warm: 0, cold: 0 };
    let expiringPast = 0;
    let expiringSoon = 0;
    const now = Date.now();
    for (const f of frags) {
        if (f.layer === "deep") byLayer.deep++;
        else byLayer.surface++;
        const w = f.weight ?? 0.5;
        if (w >= 0.8) weightBins.high++;
        else if (w >= 0.4) weightBins.mid++;
        else weightBins.low++;
        const c = f.category ?? "-";
        catCount.set(c, (catCount.get(c) ?? 0) + 1);
        // 分类分组（核心系统字段）
        const st = f.source_type ?? "inferred";
        bySourceType[st] = (bySourceType[st] ?? 0) + 1;
        const mt = f.memory_type ?? "semantic";
        byMemoryType[mt] = (byMemoryType[mt] ?? 0) + 1;
        const cs = f.consolidation_status ?? "transient";
        byConsolidation[cs] = (byConsolidation[cs] ?? 0) + 1;
        // 温度分布：base_activation 优先，weight 兜底
        const act = (f.base_activation ?? f.weight ?? 0.5) as number;
        if (act >= 0.6) byActivation.hot++;
        else if (act >= 0.3) byActivation.warm++;
        else byActivation.cold++;
        // 时效预警
        if (f.expires_at) {
            const expMs = new Date(f.expires_at).getTime();
            if (!isNaN(expMs)) {
                const expDays = (expMs - now) / 86400000;
                if (expDays <= 0) expiringPast++;
                else if (expDays <= 3) expiringSoon++;
            }
        }
    }
    const suggestions: string[] = [];
    if (frags.length >= config.json_max_count) {
        suggestions.push(`fragments(${frags.length}) = json_max_count(${config.json_max_count}) → 必须整理`);
    } else if (frags.length >= config.json_max_count * 0.9) {
        suggestions.push(`fragments(${frags.length}) 接近上限(${config.json_max_count})，建议整理`);
    }
    if (expiringPast > 0) {
        suggestions.push(`${expiringPast} 条已过期（preference/episodic），建议 memory_fragment_dream 标记归档`);
    } else if (expiringSoon > 0) {
        suggestions.push(`${expiringSoon} 条临近过期（≤3天），建议确认`);
    }
    if (config.last_compact) {
        const days = (Date.now() - new Date(config.last_compact).getTime()) / 86400000;
        if (days > config.cold_data_days) {
            suggestions.push(`距上次整理 ${Math.floor(days)} 天（阈值 ${config.cold_data_days}）`);
        }
    } else if (frags.length > 0) {
        suggestions.push("从未整理过 → AI 侧执行 memory_fragment_compact");
    }
    return {
        total: frags.length,
        surface: byLayer.surface,
        deep: byLayer.deep,
        weightBins,
        max: config.json_max_count,
        lastCompact: config.last_compact as string | null,
        suggestions,
        bySourceType,
        byMemoryType,
        byConsolidation,
        byActivation,
        expiringPast,
        expiringSoon,
        topCategories: [...catCount.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)
            .map(([name, count]) => ({ name, count })),
    };
}

type Stats = ReturnType<typeof computeStats>;

// ---------- 搜索 ----------

function sorted(frags: Fragment[]): Fragment[] {
    return frags
        .slice()
        .sort((a, b) => (b.recall_frequency ?? 0) - (a.recall_frequency ?? 0) || (b.weight ?? 0.5) - (a.weight ?? 0.5));
}

function matchFragments(q: string): Fragment[] {
    const kws = q.toLowerCase().split(/\s+/).filter(Boolean);
    const frags = loadFragments();
    if (!kws.length) return sorted(frags);
    const syn = loadSynonymMap();
    const terms: string[] = [];
    for (const w of kws) {
        terms.push(w.toLowerCase());
        for (const s of syn[w.toLowerCase()] ?? []) terms.push(s.toLowerCase());
    }
    return sorted(
        frags.filter((f) => {
            const hay = [f.content, f.category, ...(f.associations ?? [])].join(" ").toLowerCase();
            const cat = (f.category ?? "").toLowerCase();
            for (const t of terms) {
                if (hay.includes(t)) return true;
                for (const c of syn[t] ?? []) {
                    if (c.toLowerCase() === cat) return true;
                }
            }
            return false;
        }),
    );
}

// ---------- TUI 插件 ----------

export default Plugin.define({
    id: "opencode-memory.tui",
    setup(context) {
        // 主题颜色：V2 结构经 mapTheme 映射 → desaturateTo 降饱和到 Morandi 风格（visual-cache 同款方案）
        // 修复：原取 theme.text.primary / theme.text.success 等路径在 V2 主题里不存在（全 fallback 到灰）→ 颜色失效。
        // 正确路径：primary 在 theme.hue.interactive[300]，语义色在 theme.text.feedback.*。
        const _th = mapTheme(context.theme);
        const base = desaturateTo(_th.text, MAX_SAT, FALLBACK.text);
        const muted = desaturateTo(_th.textMuted, MAX_SAT, FALLBACK.muted);
        const accent = desaturateTo(_th.primary, MAX_SAT, FALLBACK.primary);
        const ok = desaturateTo(_th.success, MAX_SAT, FALLBACK.success); // success 语义色（灰绿）
        const warnC = desaturateTo(_th.warning, MAX_SAT, FALLBACK.warning); // warning 语义色（灰黄）
        const errC = desaturateTo(_th.error, MAX_SAT, FALLBACK.error); // error 语义色（灰红）
        const warn = warnC; // 警告色别名（多处用）
        // 语义三档（括号条形）：高→success / 中→warning / 低→error
        const tier = (r: number) => (r >= 0.7 ? ok : r >= 0.35 ? warnC : errC);
        // 温和版（列表 weight 用）：低→muted 不红
        const tierW = (r: number) => (r >= 0.7 ? ok : r >= 0.35 ? warnC : muted);
        // 面板边框色：低饱和压暗近似 #6B6B63
        const panelBorder = () => dimColor(muted, 0.9);

        // ---- 文件热更新：watcher + mtime 轮询兜底 ----
        const [rev, bump] = createSignal(0);
        const flashTimers: ReturnType<typeof setTimeout>[] = [];
        const [flashStep, setFlashStep] = createSignal(2);
        function startFlash() {
            for (const t of flashTimers) clearTimeout(t);
            flashTimers.length = 0;
            setFlashStep(0);
            flashTimers.push(setTimeout(() => setFlashStep(1), 450));
            flashTimers.push(setTimeout(() => setFlashStep(2), 950));
        }
        const monitor = { prev: loadFragments().length, cur: loadFragments().length };
        let lastRevAt = { clock: "--:--:--", day: "" };
        let debounce: ReturnType<typeof setTimeout> | undefined;
        const schedule = () => {
            clearTimeout(debounce);
            debounce = setTimeout(() => {
                bump(rev() + 1);
                monitor.prev = monitor.cur;
                monitor.cur = loadFragments().length;
                startFlash();
                const d = new Date();
                lastRevAt = { clock: d.toTimeString().slice(0, 8), day: d.toISOString().slice(0, 10) };
            }, 250);
        };
        const watchers: fs.FSWatcher[] = [];
        for (const p of watchPaths()) {
            try {
                if (fs.existsSync(p)) watchers.push(fs.watch(p, { persistent: false }, schedule));
            } catch {}
        }
        let lastMtimes = watchPaths().map((p) => {
            try {
                return fs.statSync(p).mtimeMs;
            } catch {
                return 0;
            }
        });
        function watchPaths(): string[] {
            return [FRAGMENTS_PATH, SYNONYM_MAP_PATH, FRAGMENT_CONFIG_PATH];
        }
        const poll = setInterval(() => {
            watchPaths().forEach((p, i) => {
                try {
                    const m = fs.statSync(p).mtimeMs;
                    if (m !== lastMtimes[i]) {
                        lastMtimes[i] = m;
                        schedule();
                    }
                } catch {}
            });
        }, 5000);

        // ---- 设置 ----
        const makeSettings = () => {
            const initial = {
                footer_slot: true,
                sidebar_slot: true,
                hotkey: true,
                typing: true,
                panel_border: true,
                meteor: true, // 流星特效（召回滑块 MAX 后 2s 深蓝流光），可关
                meteor_rainbow: false, // 彩虹猫色带（流星特效开时切换蓝/彩虹），可关
                auto_recall: loadRecallRuntime().enabled, // 功能开关：开=显示滑块+自动召回生效；关=仅主动召回
                ...(loadFragConfig().tui ?? {}),
            };
            try {
                const stored: any = context.storage.store("opencode-memory.settings", { initial });
                const [a, b] = Array.isArray(stored)
                    ? stored
                    : [stored?.get ?? stored, stored?.set ?? stored?.update];
                const read = () => (typeof a === "function" ? a() : a);
                if (!b || typeof b !== "function") throw new Error("storage setter missing");
                const update = async (patch: Record<string, boolean>) => {
                    await b((draft: Record<string, boolean>) => Object.assign(draft, patch));
                };
                return { get: read, set: update };
            } catch {
                const [sig, setSig] = createSignal(initial);
                return {
                    get: sig,
                    set: async (patch: Record<string, boolean>) => setSig({ ...sig(), ...patch }),
                };
            }
        };
        const settings = makeSettings();
        const typingOn = () => settings.get().typing !== false;

        // ---- 记忆操作 ----
        function saveFragments(list: Fragment[]) {
            const tmp = FRAGMENTS_PATH + ".tui-tmp";
            fs.writeFileSync(tmp, JSON.stringify({ fragments: list }, null, 2), "utf-8");
            try {
                fs.renameSync(tmp, FRAGMENTS_PATH);
            } catch {
                fs.writeFileSync(FRAGMENTS_PATH, JSON.stringify({ fragments: list }, null, 2), "utf-8");
                try {
                    fs.unlinkSync(tmp);
                } catch {}
            }
        }

        async function operateFragment(frag: Fragment): Promise<void> {
            const act = await context.ui.dialog.select({
                title: "操作记忆",
                options: [
                    { title: "查看全文", value: "view", description: cutDW(frag.content, 60) },
                    { title: "删除记忆", value: "delete", description: "立即从热数据移除" },
                    { title: `提高权重 (当前 ${frag.weight ?? 0.5})`, value: "weight" },
                    { title: frag.source_type === "user_confirmed" ? "已确认 ✓" : "标记确认（user_confirmed）", value: "confirm", description: frag.source_type === "user_confirmed" ? "已是用户确认" : "提升为可信记忆（置信度≥0.8，P3 佐证加权受益）" },
                    { title: "返回", value: "back", selection: "none" },
                ],
            });
            if (!act || act === "back") return;
            if (act === "view") {
                await context.ui.dialog.alert({ title: frag.category ?? "记忆", message: frag.content });
                return;
            }
            if (act === "delete") {
                const ok = await context.ui.dialog.confirm({
                    title: "删除确认",
                    message: `确认删除？\n${cutDW(frag.content, 60)}`,
                    label: { confirm: "删除", cancel: "取消" },
                });
                if (ok) {
                    saveFragments(loadFragments().filter((f) => f.id !== frag.id));
                    context.ui.toast.show({ message: "已删除", variant: "success" });
                }
                return;
            }
            if (act === "weight") {
                const list = loadFragments();
                const item = list.find((f) => f.id === frag.id);
                if (item) {
                    item.weight = Math.min(1, Math.round(((item.weight ?? 0.5) + 0.1) * 10) / 10);
                    saveFragments(list);
                    context.ui.toast.show({ message: `权重已更新为 ${item.weight}`, variant: "success" });
                }
                return;
            }
            if (act === "confirm") {
                if (frag.source_type === "user_confirmed") return; // 已确认
                const list = loadFragments();
                const item = list.find((f) => f.id === frag.id);
                if (item) {
                    item.source_type = "user_confirmed";
                    item.confidence = Math.max(Number(item.confidence) || 0.5, 0.8);
                    saveFragments(list);
                    context.ui.toast.show({ message: "已标记为可信记忆（user_confirmed，置信度≥0.8）", variant: "success" });
                }
                return;
            }
        }

        async function searchDialog(initial?: string) {
            let q = (initial ?? "").trim();
            for (;;) {
                if (!q) {
                    q = ((await context.ui.dialog.prompt({ title: "搜索记忆", placeholder: "输入关键词（中英文均可）" })) ?? "").trim();
                    if (!q) return;
                }
                const hits = matchFragments(q);
                if (!hits.length) {
                    await context.ui.dialog.alert({
                        title: "没有命中",
                        message: `“${q}”没有命中热数据。\n归档数据可在 AI 侧用 memory_fragment_deep_search 查询。`,
                    });
                    q = "";
                    continue;
                }
                const pick = await context.ui.dialog.select({
                    title: `记忆搜索: ${q}（${hits.length} 条命中）`,
                    current: hits[0].id,
                    options: hits.slice(0, 60).map((f) => ({
                        title: `[${f.layer ?? "?"}] ${f.category ?? "-"} · w${f.weight ?? 0.5} · r${f.recall_frequency ?? 0}`,
                        value: f.id,
                        description: cutDW(f.content, 80),
                    })),
                });
                if (!pick) return;
                const frag = hits.find((f) => f.id === pick);
                if (frag) await operateFragment(frag);
            }
        }

        async function browseDialog() {
            for (;;) {
                const list = sorted(loadFragments());
                if (!list.length) {
                    await context.ui.dialog.alert({ title: "记忆为空", message: "热数据中还没有碎片记忆。" });
                    return;
                }
                const pick = await context.ui.dialog.select({
                    title: `管理记忆（${list.length} 条，按热度排序）`,
                    options: list.slice(0, 80).map((f) => ({
                        title: `[${f.layer ?? "?"}] ${f.category ?? "-"} · w${f.weight ?? 0.5}`,
                        value: f.id,
                        description: cutDW(f.content, 80),
                    })),
                });
                if (!pick) return;
                const frag = list.find((f) => f.id === pick);
                if (frag) await operateFragment(frag);
            }
        }

        async function settingsDialog() {
            const s = settings.get();
            const curLang = langState();
            const r = await context.ui.dialog.select({
                title: "StarMenory TUI 设置",
                options: [
                    { title: `主界面底部状态插槽: ${s.footer_slot ? "开" : "关"}`, value: "footer_slot" },
                    { title: `会话侧栏状态: ${s.sidebar_slot ? "开" : "关"}`, value: "sidebar_slot" },
                    { title: `自动召回功能: ${s.auto_recall === true ? "开" : "关"}`, value: "auto_recall" },
                    { title: `界面语言: ${curLang === "zh" ? "中文" : "英文"}`, value: "lang" },
                    { title: `快捷键 ctrl+shift+m: ${s.hotkey ? "开" : "关"}`, value: "hotkey" },
                    { title: `打字机动效: ${typingOn() ? "开" : "关"}`, value: "typing" },
                    { title: `面板边框: ${s.panel_border ? "开" : "关"}`, value: "panel_border" },
                    { title: `流星特效(召回MAX后): ${s.meteor !== false ? "开" : "关"}`, value: "meteor" },
                    { title: `彩虹流星: ${s.meteor_rainbow === true ? "开" : "关"}`, value: "meteor_rainbow" },
                    { title: "关于", value: "about", selection: "none" },
                ],
            });
            if (!r) return;
            if (r === "about") {
                await context.ui.dialog.alert({
                    title: "StarMenory TUI",
                    message: "v2.2.1\n/memory 打开管理页（全部在终端内）。\n动效: 打字机入场 / 条形生长 / 变更渐退。",
                });
                return;
            }
            if (r === "auto_recall") {
                // 功能开关：开=显示滑块+自动召回生效；关=仅主动召回。写 recall-runtime.json（跨进程 index.js 读）
                const next = !(s.auto_recall === true);
                await settings.set({ auto_recall: next });
                saveRecallEnabled(next);
            } else if (r === "lang") {
                // 语言：默认英文，可切中文。写 fragment-config.json general.lang（通用设置）
                const next: "en" | "zh" = curLang === "zh" ? "en" : "zh";
                saveLang(next);
                setLangState(next);
            } else {
                await settings.set({ [r]: !s[r] });
            }
            context.ui.toast.show({ message: "设置已保存（即时生效）", variant: "success" });
        }

        // ---- 状态插槽（home.footer.status 静态一行版；侧栏统一面板见 MemoryPanel） ----
        const StatusChip = () => {
            const st = createMemo((): Stats => {
                rev();
                return computeStats();
            });
            const fg = () => {
                const s = flashStep();
                if (s === 0) return accent;
                if (s === 1) return base;
                return st().suggestions.length ? warn : muted;
            };
            return (
                <Show when={st().total > 0}>
                    <box flexShrink={0}>
                        <text fg={fg()}>
                            {`★ ${st().total}/${st().max} ${heatBar(st().total / st().max, 10)}`}
                        </text>
                    </box>
                </Show>
            );
        };

        // ---- 召回滑块（P6 高质感：单焦点居中 + 惯性进度条 + 呼吸 + 颜色渐变 + 宽命中区） ----
        // 共享状态（setup 级：滑块组件 + 动画循环共用；组件卸载停动画，重挂载恢复）
        const [recallTarget, setRecallTarget] = createSignal(loadRecallRuntime().effort); // 目标档位 0-6
        const [recallDisplay, setRecallDisplay] = createSignal(recallTarget()); // 动画渲染浮点 0-6
        const [recallFrame, setRecallFrame] = createSignal(0); // 帧计数：恒递增 → 驱动呼吸/边缘闪烁每帧重渲染
        const [recallDrag, setRecallDrag] = createSignal(false);
        const [recallWriteOk, setRecallWriteOk] = createSignal(true);
        let recallAnim: ReturnType<typeof setInterval> | undefined;
        let recallFlashAt = 0; // 最近一次档位变更（边缘闪烁判定）
        // 档位变更 → 写 recall-runtime.json（index.js 钩子 mtime 缓存实时读到，不触发插件重载）
        function recallSet(lv: number) {
            const v = Math.max(0, Math.min(6, Math.floor(Number(lv) || 0)));
            if (v === recallTarget()) return; // 档位未变：不重复写盘/不闪烁（拖动同档位省 IO）
            setRecallTarget(v);
            setRecallWriteOk(saveRecallEffort(v));
            recallFlashAt = Date.now();
        }
        // 惯性插值循环：~30fps；拖动时快速逼近（k=0.5，基本跟手），非拖动慢速惯性（k=0.15，平滑）
        function startRecallAnim() {
            if (recallAnim) return;
            recallAnim = setInterval(() => {
                const t = recallTarget();
                const d = recallDisplay();
                const diff = t - d;
                const k = recallDrag() ? 0.5 : 0.15; // 拖动：每帧补 50% → 2帧内追上鼠标；松开：15% 惯性
                if (Math.abs(diff) > 0.02) setRecallDisplay(d + diff * k);
                else setRecallDisplay(t);
                setRecallFrame((f) => f + 1); // 恒递增：即使到位也重渲染（呼吸/闪烁）
            }, 33);
        }
        function stopRecallAnim() {
            if (recallAnim) {
                clearInterval(recallAnim);
                recallAnim = undefined;
            }
        }

        // ---- 召回进度条行（统一面板内 recall 行：label + 渐变bar + 1字符手柄 + 档位名，整条可拖） ----
        // props.barW/valW 由父 MemoryPanel 算好传入（number 值，非 signal：父不因 recall 动画重渲染）
        // ---- 召回滑块渐变（主题语义色，往 MAX 变深）----
        // 纯语义色：0% 绿（低档）→ 50% 黄（平衡）→ 100% 红（MAX，最深）。对齐 visual-cache hitColor（纯绿/黄/红）。
        // 之前端点用 lerpHex(muted, ok, 0.5)（灰绿中间≈灰）和 dimColor(errC, 0.85)（压暗）→ 低档看起来像灰 → 改纯色。
        const recallGrad = [
            { at: 0, c: ok },       // 绿（低档）
            { at: 50, c: warnC },   // 黄（平衡）
            { at: 100, c: errC },   // 红（MAX，最深）
        ];
        const recallColor = (pct: number): string => {
            const p = Math.max(0, Math.min(100, pct));
            for (let i = 0; i < recallGrad.length - 1; i++) {
                if (p <= recallGrad[i + 1].at) {
                    const t = (p - recallGrad[i].at) / (recallGrad[i + 1].at - recallGrad[i].at);
                    return lerpHex(recallGrad[i].c, recallGrad[i + 1].c, t);
                }
            }
            return recallGrad[recallGrad.length - 1].c;
        };

        const RecallBar = (props: { barW: number; valW: number; label: string; labelW: number }) => {
            onCleanup(() => stopRecallAnim()); // 组件卸载（auto_recall 关）→ 停动画
            // 挂载同步：外部（工具/其它进程）可能已改档位 → 重挂载后显示正确；不设 flash（避免开滑块误闪）
            const rt = loadRecallRuntime().effort;
            if (rt !== recallTarget()) setRecallTarget(rt);
            startRecallAnim(); // 挂载即启动动画
            // 每帧重渲染：disp() 读 recallFrame()（恒递增）→ Solid 跟踪到 → 惯性/闪烁都动
            const disp = () => { recallFrame(); return recallDisplay(); };
            const lv = () => Math.max(0, Math.min(6, Math.round(disp())));
            const lvName = () => RECALL_LEVELS[lv()];
            const barW = () => props.barW;
            const valW = () => props.valW;
            // 1 字符手柄（▓）在填充边界；整条 bar 都是命中区（宽容差，解决"按不上"）
            const thumbX = () => Math.round((disp() / 6) * Math.max(0, barW() - 1)); // 0..barW-1
            const fill = () => thumbX();
            const empty = () => Math.max(0, barW() - thumbX() - 1);
            const pct = () => Math.round((disp() / 6) * 100);
            const barColor = () => recallColor(pct()); // 渐变：0%浅绿→50%黄→100%深红（主题色，往 MAX 变深）
            const flash = () => Date.now() - recallFlashAt < 240; // 刚变更 → 手柄提亮（操作反馈）
            const valStr = () => " ".repeat(Math.max(0, valW() - dw(lvName()))) + lvName(); // 右对齐
            // ---- 流星特效（拖到 MAX 立即：亮核+拖尾+光晕+闪点，深蓝流光/可选彩虹）----
            // 触发：档位=6（MAX）且设置开 → 整条立即变流星；拖回非 MAX 立即恢复（丝滑无延迟）。
            // 深蓝系（底要可见——条一直存在，不能暗到看不见）
            const METEOR_HEAD = "#f4fbff";   // 核前短辉（最亮）
            const METEOR_CORE = "#d6ecff";   // 亮核（亮蓝白）
            const METEOR_NEAR = "#8fd0ff";   // 近核
            const METEOR_MID = "#2a5a8c";    // 中蓝（拖尾中段）
            const METEOR_DEEP = "#16324f";   // 深蓝底（可见，条始终存在）
            const METEOR_TAIL = "#0e2238";   // 拖尾末端（最暗但可见）
            const METEOR_BG_DARK = "#0a1826";  // bg 流光层：暗底
            const METEOR_BG_LIGHT = "#16324f"; // bg 流光层：亮带（集中在核附近，=DEEP）
            // 彩虹猫硬色带（可选模式，设置 meteor_rainbow 切换）
            const RAINBOW = ["#ff3b3b", "#ff9f1a", "#ffe600", "#3bff6b", "#1ac8ff", "#6b3bff", "#ff3bd4"] as const;
            // 设置开（默认开）且档位=MAX → 立即进入流星；拖回非 MAX 立即恢复
            const meteorOn = (): boolean => {
                if (settings.get().meteor === false) return false; // 设置关
                return recallTarget() === 6; // 拖到 MAX 立即出现，拖回即消失
            };
            // 核位置：0..barW-1 循环移动（约 2.4s 划过一次，从容优雅）
            const meteorCorePos = (): number => {
                const cycle = ((recallFrame() * 33) / 2400) % 1;
                return cycle * Math.max(1, barW() - 1);
            };
            // 流星格：双层叠加 —— bg 深蓝流光底 + fg 流星（核/拖尾，柔光呼吸，环形无缝循环）
            const meteorCell = (i: number): { ch: string; fg: string; bg: string } => {
                const core = meteorCorePos();
                const span = Math.max(1, barW());
                // —— bg 流光层（底层）：亮带峰在核处，环形连续（cos 周期=span，随核无缝流动）——
                const wave = 0.5 + 0.5 * Math.cos(2 * Math.PI * ((i - core) / span));
                const bg = lerpHex(METEOR_BG_DARK, METEOR_BG_LIGHT, Math.pow(wave, 2));
                // —— 单一连贯光波：波长=全条（相邻格相位差小，无噪点），沿拖尾缓缓流动，接缝处连续 ——
                const frameMs = recallFrame() * 33;
                const breath = 0.5 + 0.5 * Math.sin(2 * Math.PI * (frameMs / 1200) + 2 * Math.PI * (i / span));
                // —— 环形距离：核绕条一圈，拖尾跨接缝连续（无跳变，循环流畅）——
                const ad = ((i - core) % span + span) % span; // 沿移动方向 i 在核前方距离（0..span-1）
                const td = ((core - i) % span + span) % span; // 沿移动方向 i 在核后方距离（0..span-1）
                // —— 边缘淡入淡出：只淡"亮头+近核"，拖尾远端环形常亮（连续流动，接入流畅）——
                const pos = core / Math.max(1, span - 1);
                const edgeFade = Math.max(0, Math.min(1, Math.min(pos, 1 - pos) / 0.08));
                const coreGlow = 0.75 + 0.25 * Math.sin(2 * Math.PI * (frameMs / 1600));
                // —— 核前辉光：前方 2 格平滑衰减（亮头前缘，无硬边）——
                if (ad <= 2) {
                    const headFg = lerpHex(METEOR_CORE, METEOR_HEAD, coreGlow);
                    const frontFade = 1 - ad / 2;
                    return { ch: "█", fg: lerpHex(lerpHex(METEOR_DEEP, headFg, frontFade), bg, 1 - edgeFade), bg };
                }
                // —— 拖尾：后方渐变（环形，前方留暗区→彗星形状清晰），拖尾 75% ——
                const trail = Math.max(4, Math.round(span * 0.75));
                const tt = Math.min(1, td / trail);
                const useRainbow = settings.get().meteor_rainbow === true;
                const baseFg = useRainbow
                    ? RAINBOW[Math.min(RAINBOW.length - 1, Math.floor(tt * RAINBOW.length))]
                    : (() => {
                        if (tt < 0.18) return lerpHex(METEOR_CORE, METEOR_NEAR, tt / 0.18);
                        if (tt < 0.45) return lerpHex(METEOR_NEAR, METEOR_MID, (tt - 0.18) / 0.27);
                        if (tt < 0.75) return lerpHex(METEOR_MID, METEOR_DEEP, (tt - 0.45) / 0.30);
                        return lerpHex(METEOR_DEEP, METEOR_TAIL, (tt - 0.75) / 0.25);
                    })();
                // —— 呼吸提亮：平滑渐变（近核幅度大，尾端几乎不动），连贯光波，无硬切 ——
                const bright = useRainbow ? "#ffffff" : METEOR_HEAD; // 恒比 baseFg 亮（一致提亮）
                let fg = lerpHex(baseFg, bright, breath * (1 - tt) * 0.4);
                // 只近核（td<3）在接缝淡出，远端拖尾环形常亮（接入流畅）
                const nearFade = 1 - Math.min(1, td / 3);
                fg = lerpHex(fg, bg, (1 - edgeFade) * nearFade);
                return { ch: "█", fg, bg }; // 整条单字符 █ + 纯色渐变，无 █▓▒░ 硬台阶
            };
            // 兼容薄包装（外部行为不变，内部已升级）
            const meteorCharColor = (i: number): string => meteorCell(i).fg;
            // ---- 命中区：整条 bar 都可拖（修复不跟手 3 连） ----
            // ① bar 起点偏移：行起点 = label(labelW) + gap(1) → bar 从 labelW+1 列才开始；点击需减偏移
            const BAR_OFFSET = () => props.labelW + 1;
            // 缓存 mousedown 时的行起点（drag 事件 currentTarget 可能变，用 down 时基准最稳）
            let downBase = 0;
            const evX = (e: any) => typeof e?.x === "number" ? e.x : typeof e?.col === "number" ? e.col : null;
            const evBase = (e: any) => { const t = e?.currentTarget; return typeof t?.x === "number" ? t.x : 0; };
            // ② 统一映射：点击/手柄都用 (barW-1) 做分母，手柄位置=点击位置
            const lvFromX = (l: number) => Math.round(Math.max(0, Math.min(1, l / Math.max(1, barW() - 1))) * 6);
            const onDown = (e: any) => { try { const cx = evX(e); if (cx === null) return; downBase = evBase(e); setRecallDrag(true); recallSet(lvFromX(cx - downBase - BAR_OFFSET())); } catch {} };
            const onDrag = (e: any) => { try { if (!recallDrag()) return; const cx = evX(e); if (cx === null) return; recallSet(lvFromX(cx - downBase - BAR_OFFSET())); } catch {} };
            const onUp = () => { try { setRecallDrag(false); } catch {} };
            return (
                <text selectable={false} onMouseDown={onDown} onMouseDrag={onDrag} onMouseUp={onUp}>
                    {/* label 等宽列（padEndDW 到 PANEL_LABEL_W）+ 1 空格 gap；span 颜色必须 style.fg（直接 fg prop 不生效） */}
                    <span style={{ fg: muted }}>{padEndDW(props.label, PANEL_LABEL_W) + " "}</span>
                    {/* 渐变填充 + 1 字符手柄 + 背景；流星模式：亮核+拖尾深蓝流光（逐字符着色） */}
                    {meteorOn() ? (
                        <>
                            {Array.from({ length: fill() }).map((_, i) => {
                                const cell = meteorCell(i);
                                return (
                                    <span style={{ fg: cell.fg, bg: cell.bg }}>{cell.ch}</span>
                                );
                            })}
                            {/* 手柄：流星模式保持亮色，bg 亮带延续（双核感低） */}
                            <span style={{ fg: flash() ? "#e6f7ff" : METEOR_NEAR, bg: METEOR_BG_LIGHT }}>{"▓"}</span>
                            <span style={{ fg: METEOR_DEEP, bg: METEOR_BG_DARK }}>{"░".repeat(empty())}</span>
                        </>
                    ) : (
                        <>
                            <span style={{ fg: barColor() }}>{"█".repeat(fill())}</span>
                            <span style={{ fg: flash() ? base : accent }}>{"▓"}</span>
                            <span style={{ fg: dimColor(muted, 0.65) }}>{"░".repeat(empty())}</span>
                        </>
                    )}
                    {/* 2 空格 gap + 档位名（右对齐） */}
                    <span style={{ fg: muted }}>{"  "}</span>
                    <span style={{ fg: barColor() }}>{valStr()}</span>
                    {!recallWriteOk() ? <span style={{ fg: errC }}>!</span> : null}
                </text>
            );
        };

        // ---- 统一面板（一个框合并 memory + recall 两行，统一无括号进度条 ██░░，严格对齐） ----
        const PANEL_LABEL_W = 6; // memory/recall 等宽标签列（memory/recall/DEEP 等均 ≤6）
        const MemoryPanel = () => {
            const st = createMemo((): Stats => {
                rev();
                return computeStats();
            });
            const [boxRef, boxW] = useBoxWidth();
            const innerW = () => (boxW() > 0 ? boxW() - 4 : 26); // 去 border2 + padding2；未测得 26 兜底
            // 值列宽：覆盖 memory 数字 + recall 档位名（最长 STRONG=6）；不读 recallDisplay（避免父每帧重渲染）
            const memNum = () => `${st().total}/${st().max}`;
            const VAL_W = () => Math.max(6, dw(memNum()));
            // bar 预算：innerW - label6 - gap1 - val - gap2（绝不超宽换行）
            const BAR_W = () => Math.max(4, innerW() - PANEL_LABEL_W - 1 - VAL_W() - 2);
            const title = () => (langState() === "zh" ? "⭐ 星记忆" : "⭐ StarMemory");
            const memLabel = () => (langState() === "zh" ? "记忆" : "memory");
            const recLabel = () => (langState() === "zh" ? "召回" : "recall");
            const memVal = () => " ".repeat(Math.max(0, VAL_W() - dw(memNum()))) + memNum(); // 右对齐
            return (
                <Show when={st().total > 0}>
                    <box ref={boxRef} alignSelf="stretch" flexShrink={0}
                        border={settings.get().panel_border !== false} borderColor={panelBorder()}
                        paddingX={1} paddingY={1} gap={1}
                        onClick={() => context.ui.router.navigate({ type: "plugin", name: "memory" })}>
                        {/* 框标题：左上角 */}
                        <text fg={muted}>{title()}</text>
                        {/* 行1：memory = label + 无括号条形 + 数字（右对齐）。保持原样（span fg，用户要求"记忆不要变"） */}
                        <text>
                            <span fg={muted}>{padEndDW(memLabel(), PANEL_LABEL_W) + " "}</span>
                            <span fg={tier(st().total / st().max)}>{heatFill(st().total / st().max, BAR_W())}</span>
                            <span fg={muted}>{"  "}</span>
                            <span fg={tier(st().total / st().max)}>{memVal()}</span>
                        </text>
                        {/* 行2：recall（自动召回功能开才显示） */}
                        <Show when={settings.get().auto_recall === true}>
                            <RecallBar barW={BAR_W()} valW={VAL_W()} label={recLabel()} labelW={PANEL_LABEL_W} />
                        </Show>
                    </box>
                </Show>
            );
        };

        context.ui.slot({
            append: "home.footer.status",
            render: () => (
                <Show when={settings.get().footer_slot}>
                    <StatusChip />
                </Show>
            ),
        });
        context.ui.slot({
            append: "sidebar.footer",
            render: () => (
                <Show when={settings.get().sidebar_slot}>
                    {/* 统一面板：一个框合并 memory + recall（recall 行由 auto_recall 控制显隐） */}
                    <MemoryPanel />
                </Show>
            ),
        });

        // ---- 管理页 ----
        const MemoryPage = (props: { data?: { q?: string } }) => {
            const [tab, setTab] = createSignal<"overview" | "list" | "recall" | "agents">("overview");
            // Tab 标签：走 i18n（langState 切换即时反映）
            const tabLabel = (tk: "overview" | "list" | "recall" | "agents" | "dev") =>
                tk === "overview" ? t("tabOverview") : tk === "list" ? t("tabList") : tk === "recall" ? t("tabRecall") : tk === "agents" ? t("tabAgents") : t("tabDev");
            // ---- 开发者模式（P9）：Overview 标题点 5 下解锁（硬性规则快速编辑，不面向用户） ----
            const [devUnlocked, setDevUnlocked] = createSignal(loadDevUnlocked());
            const [devClicks, setDevClicks] = createSignal(0);
            const [devMsg, setDevMsg] = createSignal("");
            const [devSel, setDevSel] = createSignal(0);
            const [devFocus, setDevFocus] = createSignal({ row: 0, col: 0 }); // 焦点网格：row 0 规则列表 / row 1 操作行（编辑选中、添加规则）
            const DEV_CLICK_TARGET = 7;
            function devTap() {
                const n = devClicks() + 1;
                setDevClicks(n);
                if (!devUnlocked() && n >= DEV_CLICK_TARGET) {
                    setDevUnlocked(true);
                    saveDevUnlocked(true);
                    setDevMsg("开发者模式已解锁");
                    context.ui.toast.show({ message: t("tabDev") + " · unlocked", variant: "success" });
                } else if (!devUnlocked()) {
                    setDevMsg(`overview 按 d ${n}/${DEV_CLICK_TARGET} 解锁开发者模式`);
                }
            }
            // 可用 Tab：召回功能关时直接隐藏召回 Tab（与侧栏 RecallBar 门控一致，settings.get().auto_recall === true）
            // AGENTS Tab 始终可用（P7：管理全局规则文件，与召回无关）；dev 仅解锁后出现（P9）
            const availableTabs = createMemo(() => {
                const base = settings.get().auto_recall === true
                    ? (["overview", "list", "recall", "agents"] as const)
                    : (["overview", "list", "agents"] as const);
                return devUnlocked() ? ([...base, "dev"] as const) : base;
            });
            // 有效 Tab：当前 tab 不可达（功能刚关）时回退 overview，避免空挂
            const effTab = createMemo<"overview" | "list" | "recall" | "agents" | "dev">(() => {
                const t = tab();
                return (availableTabs() as readonly string[]).includes(t) ? t : "overview";
            });
            const [selIndex, setSelIndex] = createSignal(0);
            const [scrollTop, setScrollTop] = createSignal(0);

            // ---- AGENTS.md 管理（P7）：内容 state + 操作 ----
            const [agentsContent, setAgentsContent] = createSignal<string>(loadAgents() ?? "");
            const [agentsMsg, setAgentsMsg] = createSignal("");
            // ---- 说明片段（P8）：开关状态 + 自定义内容 ----
            const [agentsSegs, setAgentsSegs] = createSignal<Record<string, SegState>>(loadSegments());
            // 初始字段：优先从现有内容解析，缺失用 memory.json USER PREFERENCES 默认
            const initialFields = (() => {
                const cur = agentsContent();
                const parsed = cur ? parseAgentsFields(cur) : {};
                return { ...loadPrefDefaults(), ...parsed };
            })();
            const [agentsFields, setAgentsFields] = createSignal<Record<string, string>>(initialFields);
            const [agentsTouched, setAgentsTouched] = createSignal(false); // 有未保存改动标记
            // 当前模式：manual = 用户手动编辑过内容（不再自动重渲染字段）；template = 跟随模板
            const [agentsManual, setAgentsManual] = createSignal(false);
            // 字段值变更 → 应用到内容（模板模式替换占位符所在行 / 手动模式替换 key 行或追加）
            function agentsApplyField(key: string, value: string) {
                const fields = { ...agentsFields(), [key]: value };
                setAgentsFields(fields);
                setAgentsContent(applyFieldsToContent(agentsContent(), fields));
                setAgentsTouched(true);
                setAgentsMsg("");
            }
            // 应用模板：渲染占位符 → 内容；字段保留（模板占位符被字段值替换）
            function agentsApplyTemplate(id: string) {
                const tpl = AGENTS_TEMPLATES.find((t) => t.id === id);
                if (!tpl) return;
                setAgentsContent(renderTemplate(tpl.content, agentsFields()));
                setAgentsManual(false);
                setAgentsTouched(true);
                setAgentsMsg("");
            }
            // 切换片段开关：开=注入 AGENTS.md 片段区 / 关=移除；同步 agents-segments.json
            function agentsToggleSegment(id: string) {
                const cur = agentsSegs()[id] ?? segState(id);
                const next = { ...agentsSegs(), [id]: { ...cur, enabled: !cur.enabled } };
                setAgentsSegs(next);
                saveSegments(next);
                setAgentsContent(rebuildAgents(agentsContent(), next));
                setAgentsTouched(true);
                setAgentsMsg("");
            }
            // 编辑片段内容：选中片段 → prompt 编辑（\n 转义展示）→ 同步 + 重建 AGENTS.md
            async function agentsEditSegment() {
                const sel = await context.ui.dialog.select({
                    title: t("agentsEditSeg") + " · " + t("agentsSegments"),
                    current: "",
                    options: AGENTS_SEGMENTS.map((s) => ({
                        title: t(s.i18n),
                        value: s.id,
                        description: (agentsSegs()[s.id] ?? segState(s.id)).enabled ? "on" : "off",
                        selection: "none",
                    })),
                });
                if (!sel) return;
                const cur = agentsSegs()[sel] ?? segState(sel);
                const raw = await context.ui.dialog.prompt({
                    title: `${t("agentsEditSeg")} · ${t("agentsSegUtf8")}`,
                    placeholder: cur.content.slice(0, 60),
                });
                if (raw === undefined) return;
                const next = { ...agentsSegs(), [sel]: { ...cur, content: raw.replace(/\\n/g, "\n") } };
                setAgentsSegs(next);
                saveSegments(next);
                setAgentsContent(rebuildAgents(agentsContent(), next));
                setAgentsTouched(true);
                setAgentsMsg("");
            }
            // ---- 开发者模式（P9）：硬性规则列表（memory.json）快速编辑，不面向用户 ----
            type DevItem = { kind: "cmd" | "rule" | "pref"; idx: number; label: string; value: string; sub?: string };
            function devItems(): DevItem[] {
                const mem = readJson(MEMORY_PATH) ?? {};
                const items: DevItem[] = [];
                const cmds = mem.strict?.forbiddenCommands ?? [];
                (cmds as any[]).forEach((c: any, i: number) => items.push({ kind: "cmd", idx: i, label: `禁止命令 ${i + 1}`, value: c?.pattern ?? "", sub: c?.description }));
                ((mem.strict?.rules ?? []) as any[]).forEach((r: string, i: number) => items.push({ kind: "rule", idx: i, label: `规则 ${i + 1}`, value: String(r) }));
                const prefs = mem.user?.preferences ?? {};
                ["downloadPolicy", "operationConfirmation", "no_emoji", "utf8_encoding_rule"].forEach((k) => {
                    if (prefs[k]) items.push({ kind: "pref", idx: 0, label: k, value: String(prefs[k]) });
                });
                return items;
            }
            // 焦点：row 0 = 规则列表（纵向，up/down 逐项移动），row 1 = 操作行（col 0 编辑选中 / col 1 添加规则，left/right 移动）
            // 下移：列表内逐项到底；到底后再按 down 才进操作行（落在"编辑选中"）。上移：操作行 up 回列表（落在上次选中项）。左右：仅操作行有效（列表是纵向的）。
            function devMove(dr: number, dc: number) {
                const n = devItems().length;
                const cur = devFocus();
                if (cur.row === 0) {
                    if (dr > 0) {
                        if (cur.col >= n - 1) setDevFocus({ row: 1, col: 0 }); // 列表底 → 操作行（编辑选中）
                        else { const col = cur.col + 1; setDevFocus({ row: 0, col }); setDevSel(col); }
                    } else if (dr < 0) {
                        const col = Math.max(0, cur.col - 1);
                        setDevFocus({ row: 0, col });
                        setDevSel(col);
                    }
                    // dc 忽略（列表纵向）
                } else {
                    if (dr < 0) setDevFocus({ row: 0, col: Math.min(devSel(), n - 1) }); // 操作行 up → 回列表选中项
                    else if (dr === 0) { const col = Math.max(0, Math.min(1, cur.col + dc)); setDevFocus({ row: 1, col }); }
                    // dr > 0 停在操作行
                }
            }
            function devActivate() {
                const { row, col } = devFocus();
                if (row === 0) { setDevSel(col); void devEdit(); }
                else if (col === 0) void devEdit(); // 编辑选中（devSel 保持上次列表焦点）
                else void devAddRule();
            }
            const devFocusOn = (row: number, col: number) => devFocus().row === row && devFocus().col === col;
            async function devEdit() {
                const items = devItems();
                const it = items[devSel()];
                if (!it) return;
                const mem = readJson(MEMORY_PATH) ?? {};
                const raw = await context.ui.dialog.prompt({ title: `${it.label} · ${t("agentsEdit")}`, placeholder: it.value.slice(0, 60) });
                if (raw === undefined) return;
                const v = raw.replace(/\\n/g, "\n");
                if (it.kind === "cmd") {
                    const c = mem.strict?.forbiddenCommands?.[it.idx];
                    if (c) c.pattern = v;
                } else if (it.kind === "rule") {
                    mem.strict.rules[it.idx] = v;
                } else {
                    mem.user.preferences[it.label] = v;
                }
                if (saveMemoryJson(mem)) { setDevMsg("已保存 " + MEMORY_PATH); context.ui.toast.show({ message: "dev saved", variant: "success" }); }
                else setDevMsg("保存失败");
            }
            async function devAddRule() {
                const mem = readJson(MEMORY_PATH) ?? {};
                const raw = await context.ui.dialog.prompt({ title: t("devAddRule"), placeholder: t("agentsPlaceholder") });
                if (raw === undefined) return;
                mem.strict = mem.strict ?? {}; mem.strict.rules = mem.strict.rules ?? [];
                mem.strict.rules.push(raw.replace(/\\n/g, "\n"));
                if (saveMemoryJson(mem)) { setDevMsg("已保存 " + MEMORY_PATH); const n = devItems().length - 1; setDevSel(n); setDevFocus({ row: 0, col: n }); }
            }
            function agentsReload() {
                setAgentsContent(loadAgents() ?? "");
                setAgentsManual(false);
                setAgentsTouched(false);
                setAgentsMsg("");
                context.ui.toast.show({ message: t("agentsReload") + " · " + (loadAgents() ? "OK" : t("agentsNone")), variant: "info" });
            }
            function agentsSave() {
                if (saveAgents(agentsContent())) {
                    setAgentsTouched(false);
                    setAgentsMsg(t("agentsSaved") + " " + AGENTS_PATH);
                    context.ui.toast.show({ message: t("agentsSaved") + " AGENTS.md", variant: "success" });
                } else {
                    setAgentsMsg("✗ save failed");
                    context.ui.toast.show({ message: "✗ " + t("agentsSave") + " failed", variant: "error" });
                }
            }
            async function agentsEditField(key: string) {
                const f = AGENTS_FIELDS.find((x) => x.key === key);
                const label = t(f?.i18n ?? key);
                const cur = agentsFields()[key] ?? "";
                const opts = AGENT_FIELD_OPTIONS[key];
                // 有预设选项 → select（预设 + 自定义入口）；无预设（username/assistantName）→ 自由输入
                if (opts && opts.length > 0) {
                    const pick = await context.ui.dialog.select({
                        title: `${label} (${key}) · 当前: ${cur || "—"}`,
                        current: cur,
                        options: [
                            ...opts.map((o) => ({ title: o, value: o, description: o === cur ? t("agentsFieldCur") : undefined })),
                            { title: t("agentsCustom"), value: "__custom__", description: t("agentsCustomDesc"), selection: "none" },
                        ],
                    });
                    if (!pick) return;
                    if (pick === "__custom__") {
                        const v = await context.ui.dialog.prompt({ title: label, placeholder: t("agentsPlaceholder") });
                        if (v === undefined) return;
                        agentsApplyField(key, v.trim());
                    } else {
                        agentsApplyField(key, pick);
                    }
                } else {
                    const v = await context.ui.dialog.prompt({ title: `${label} (${key})`, placeholder: t("agentsPlaceholder") });
                    if (v === undefined) return;
                    agentsApplyField(key, v.trim());
                }
            }
            async function agentsManualEdit() {
                // 手动编辑全文：dialog.prompt 单行输入（换行用 \n 转义，展示时替换为真实换行）
                const cur = agentsContent();
                const raw = await context.ui.dialog.prompt({
                    title: t("agentsEdit") + " · " + t("agentsContent"),
                    placeholder: cur.slice(0, 60),
                });
                if (raw === undefined) return;
                setAgentsContent(raw.replace(/\\n/g, "\n"));
                setAgentsManual(true);
                setAgentsTouched(true);
                setAgentsMsg("");
            }
            // ---- AGENTS 焦点网格导航（方向键选中 + Enter 激活；与 list ↑↓ 选中同一模式） ----
            // 3 行：模板行(4) / 字段行(5) / 操作行(3)。row/col 定位，跨行 col 夹紧。
            const agentsRowLen = [AGENTS_TEMPLATES.length, AGENTS_FIELDS.length, AGENTS_SEGMENTS.length, 4];
            const [agentsFocus, setAgentsFocus] = createSignal<{ row: number; col: number }>({ row: 0, col: 0 });
            function agentsMove(dr: number, dc: number) {
                const cur = agentsFocus();
                const row = Math.max(0, Math.min(agentsRowLen.length - 1, cur.row + dr));
                const col = Math.max(0, Math.min(agentsRowLen[row] - 1, cur.col + dc));
                setAgentsFocus({ row, col });
            }
            function agentsActivate() {
                const { row, col } = agentsFocus();
                if (row === 0) agentsApplyTemplate(AGENTS_TEMPLATES[col].id);
                else if (row === 1) void agentsEditField(AGENTS_FIELDS[col].key);
                else if (row === 2) agentsToggleSegment(AGENTS_SEGMENTS[col].id);
                else if (row === 3) {
                    if (col === 0) agentsSave();
                    else if (col === 1) agentsReload();
                    else if (col === 2) void agentsManualEdit();
                    else void agentsEditSegment();
                }
            }
            // 焦点判定（渲染高亮用）
            const agentsFocusOn = (row: number, col: number) => agentsFocus().row === row && agentsFocus().col === col;
            // 终端高度自适应（响应式：resize 更新；零依赖，process.stdout 自带）
            const [termRows, setTermRows] = createSignal(process.stdout.rows || 30);
            const onResize = () => setTermRows(process.stdout.rows || 30);
            process.stdout.on("resize", onResize);
            onCleanup(() => { process.stdout.off("resize", onResize); });
            // 折叠分区状态（本页会话内 Set，不持久化，避免 store 频繁写入）
            const [folded, setFolded] = createSignal<Set<string>>(new Set());
            const toggleFold = (k: string) =>
                setFolded((s) => {
                    const n = new Set(s);
                    if (n.has(k)) n.delete(k);
                    else n.add(k);
                    return n;
                });
            const isFolded = (k: string) => folded().has(k);

            // 入场时钟：~30fps，HORIZON 后停止（零常驻开销）
            const SPEED_PER_CHAR = 9;
            const STAGGER = 55;
            const ROW_STAGGER = 40;
            const BODY_START = 640;
            const HORIZON = 2600;
            const [ms, setMs] = createSignal(HORIZON);
            let clockTimer: ReturnType<typeof setInterval> | undefined;
            function play(factor = 1) {
                if (clockTimer) clearInterval(clockTimer);
                const t0 = Date.now();
                setMs(0);
                clockTimer = setInterval(() => {
                    const m = (Date.now() - t0) * factor;
                    setMs(m);
                    if (m >= HORIZON) {
                        setMs(HORIZON);
                        clearInterval(clockTimer);
                        clockTimer = undefined;
                    }
                }, 33);
            }

            // 时码：页面打开期间 10fps 滚动
            const [tcTick, setTcTick] = createSignal(0);
            const tcStart = Date.now();
            const tcTimer = setInterval(() => setTcTick((t) => t + 1), 33); // 30fps：时码丝滑滚动（原 10fps 粗糙）
            const timecode = () => {
                tcTick(); // 响应式依赖：让 10fps tick 驱动本行重渲染
                return fmtClock(Date.now() - tcStart);
            };

            // 页面命令层：仅在页面存活期间生效
            context.keymap.layer(() => ({
                mode: "global",
                commands: [
                    { id: "opencode.memory.tab.1", bind: "1", run: () => { const t = availableTabs()[0]; if (t) setTab(t); } },
                    { id: "opencode.memory.tab.2", bind: "2", run: () => { const t = availableTabs()[1]; if (t) setTab(t); } },
                    { id: "opencode.memory.tab.3", bind: "3", run: () => { const t = availableTabs()[2]; if (t) setTab(t); } },
                    { id: "opencode.memory.tab.4", bind: "4", run: () => { const t = availableTabs()[3]; if (t) setTab(t); } },
                    { id: "opencode.memory.tab.next", bind: "tab", run: () => {
                        const tabs = availableTabs();
                        const i = tabs.indexOf(effTab());
                        setTab(tabs[(i + 1) % tabs.length]);
                    } },
                    { id: "opencode.memory.sel.up", bind: "up", run: () => { if (effTab() === "list") selectIndex(selIndex() - 1); else if (effTab() === "agents") agentsMove(-1, 0); else if (effTab() === "recall") recallMove(-1); else if (effTab() === "dev") devMove(-1, 0); } },
                    { id: "opencode.memory.sel.down", bind: "down", run: () => { if (effTab() === "list") selectIndex(selIndex() + 1); else if (effTab() === "agents") agentsMove(1, 0); else if (effTab() === "recall") recallMove(1); else if (effTab() === "dev") devMove(1, 0); } },
                    { id: "opencode.memory.sel.left", bind: "left", run: () => { if (effTab() === "agents") agentsMove(0, -1); else if (effTab() === "recall") recallCollapse(); else if (effTab() === "dev") devMove(0, -1); } },
                    { id: "opencode.memory.sel.right", bind: "right", run: () => { if (effTab() === "agents") agentsMove(0, 1); else if (effTab() === "recall") recallExpand(); else if (effTab() === "dev") devMove(0, 1); } },
                    { id: "opencode.memory.sel.enter", bind: "enter", run: () => { if (effTab() === "agents") agentsActivate(); else if (effTab() === "recall") recallToggle(); else if (effTab() === "dev") devActivate(); } },
                    { id: "opencode.memory.dev", bind: "d", run: () => { if (effTab() === "overview") devTap(); } },
                    { id: "opencode.memory.fold", bind: "f", run: () => toggleFold(effTab()) },
                    { id: "opencode.memory.manage", bind: "e", run: () => { void browseDialog(); } },
                    { id: "opencode.memory.settings", bind: "s", run: () => { void settingsDialog(); } },
                    { id: "opencode.memory.replay", bind: "r", run: () => { play(); } },
                    { id: "opencode.memory.back", bind: "q", run: () => context.ui.router.navigate({ type: "home" }) },
                ],
            }));

            // 挂载即播放入场
            play();

            const st = createMemo((): Stats => {
                rev();
                return computeStats();
            });

            const groups = createMemo(() => {
                const s = st();
                const byCat = new Map<string, Fragment[]>();
                for (const f of loadFragments()) {
                    const c = f.category ?? "-";
                    if (!byCat.has(c)) byCat.set(c, []);
                    byCat.get(c)!.push(f);
                }
                const syn = loadSynonymMap();
                return [...byCat.entries()]
                    .sort((a, b) => b[1].length - a[1].length)
                    .slice(0, 8)
                    .map(([category, items]) => {
                        const cat = category.toLowerCase();
                        const links = Object.entries(syn)
                            .filter(([, cats]) => cats.some((x) => x.toLowerCase() === cat))
                            .slice(0, 4)
                            .map(([k]) => k);
                        return { category, items, links, max: Math.max(s.total, 1) };
                    });
            });

            const [filterCat, setFilterCat] = createSignal(""); // N1：list 分类过滤（""=全部）
            const catList = createMemo(() => { // 当前所有碎片的分类统计（chips 显示，不过滤）
                const m = new Map<string, number>();
                for (const f of loadFragments()) { const c = f.category ?? "general"; m.set(c, (m.get(c) || 0) + 1); }
                return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
            });
            const listFrags = createMemo(() => {
                let all = sorted(loadFragments());
                const fc = filterCat();
                if (fc) all = all.filter((f) => (f.category ?? "general") === fc);
                return all;
            });
            const VIEWPORT = createMemo(() => Math.max(4, termRows() - 14)); // 列表可见行数（自适应终端高度，填满空位）
            const selectIndex = (i: number) => {
                const max = listFrags().length - 1;
                const clamped = Math.max(0, Math.min(max, i));
                setSelIndex(clamped);
                const top = scrollTop();
                if (clamped < top) setScrollTop(clamped);
                else if (clamped >= top + VIEWPORT()) setScrollTop(Math.max(0, clamped - VIEWPORT() + 1));
            };
            const visible = createMemo(() => {
                const all = listFrags();
                const max = all.length;
                const top = Math.min(scrollTop(), Math.max(0, max - VIEWPORT()));
                const end = Math.min(top + VIEWPORT(), max);
                const out: { f: Fragment; abs: number }[] = [];
                for (let i = top; i < end; i++) out.push({ f: all[i], abs: i });
                return out;
            });
            // 【Alice 新增】recall tab 会话诊断：读 recall-hook.log 统计（触发/注入/拦截/kind 分布）
            const recallDiag = createMemo(() => {
                const rows = readRecallHookLog();
                const total = rows.length;
                const injected = rows.reduce((a, r) => a + (r.injected || 0), 0);
                const cand = rows.reduce((a, r) => a + (r.count || 0), 0);
                const blocked = Math.max(0, cand - injected);
                const kinds = new Map<string, number>();
                for (const r of rows) kinds.set(r.kind || "?", (kinds.get(r.kind || "?") || 0) + 1);
                return { total, injected, blocked, cand, kinds };
            });
            // 召回历史：读 recall-hook.log 真召回（prompt/context，有注入内容）倒序，5s tick 刷新（新召回自动出现）
            const [histTick, setHistTick] = createSignal(0);
            const [recallHistOpen, setRecallHistOpen] = createSignal<Record<number, boolean>>({});
            const [recallSel, setRecallSel] = createSignal(0); // 键盘阅读：当前选中历史条（↑↓ 移动 / Enter 展开 / ← 收起）
            const histTickTimer = setInterval(() => setHistTick((v) => v + 1), 5000);
            onCleanup(() => clearInterval(histTickTimer));
            const recallHist = createMemo(() => {
                void histTick(); // 依赖 histTick → tick 变则重算（读文件拿最新）
                const rows = readRecallHookLog();
                return rows
                    .filter((r) => r.kind === "prompt" || r.kind === "context")
                    .reverse() // 最新在前
                    .map((r) => ({
                        t: String(r.t ?? ""), kind: String(r.kind ?? "?"),
                        count: Number(r.count) || 0,
                        query: String((r as any).query ?? ""),
                        items: Array.isArray((r as any).items) ? (r as any).items : [],
                    }));
            });
            // 召回历史条目时间：HH:MM:SS（ISO 串太长杂乱）
            const shortT = (iso: string) => { try { return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }); } catch { return iso; } };
            // 单行摘要：优先触发 query，否则首条注入内容（cutDW 截断保证单行简约；宽 26 紧凑）
            const recallSummary = (e: { query?: string; items: Array<{ content?: string }> }) => {
                if (e.query) return cutDW(e.query, 26);
                const first = e.items[0];
                return first?.content ? cutDW(first.content, 26) : "";
            };
            // 键盘阅读：↑↓ 移动选中（clamp + 滚动跟随，参考 list Tab selectIndex 丝滑）/ Enter 切换展开 / → 展开 / ← 收起
            const [recallScroll, setRecallScroll] = createSignal(0); // 历史视口滚动（选中移出时翻页，同 list scrollTop）
            const RECALL_VIEWPORT = createMemo(() => Math.max(3, termRows() - 16)); // 历史可见行数（自适应终端，比 list 少 2 行留 recallHistory header）
            const recallMove = (d: number) => {
                const n = recallHist().length;
                if (!n) return;
                const cur = Math.max(0, Math.min(n - 1, recallSel() + d));
                setRecallSel(cur);
                const top = recallScroll();
                const vp = RECALL_VIEWPORT();
                if (cur < top) setRecallScroll(cur);
                else if (cur >= top + vp) setRecallScroll(Math.max(0, cur - vp + 1));
            };
            const recallToggle = () => { const i = recallSel(); if (recallHist().length === 0) return; setRecallHistOpen((p) => ({ ...p, [i]: !p[i] })); };
            const recallExpand = () => { const i = recallSel(); if (recallHist().length === 0) return; setRecallHistOpen((p) => ({ ...p, [i]: true })); };
            const recallCollapse = () => { const i = recallSel(); if (recallHist().length === 0) return; setRecallHistOpen((p) => ({ ...p, [i]: false })); };
            // 历史视口切片：只渲染可见行（同 list visible()），abs 为绝对索引（用于 recallSel/recallHistOpen）
            const recallVisible = createMemo(() => {
                const all = recallHist();
                const max = all.length;
                const top = Math.min(recallScroll(), Math.max(0, max - RECALL_VIEWPORT()));
                const end = Math.min(top + RECALL_VIEWPORT(), max);
                const out: { e: (typeof all)[number]; abs: number }[] = [];
                for (let i = top; i < end; i++) out.push({ e: all[i], abs: i });
                return out;
            });
            // 【Alice 新增】recall 热力榜（top5 命中 / top5 吃灰）
            const recallHeat = createMemo(() => {
                const frags = loadFragments();
                const hit = [...frags]
                    .sort((a, b) => (b.recall_frequency ?? 0) - (a.recall_frequency ?? 0))
                    .slice(0, 5);
                const cutoff = new Date(Date.now() - 30 * 86400000).getTime();
                const cold = frags
                    .filter((f) => !f.last_recalled || new Date(f.last_recalled).getTime() < cutoff)
                    .sort((a, b) => String(a.last_recalled ?? "").localeCompare(String(b.last_recalled ?? "")))
                    .slice(0, 5);
                return { hit, cold };
            });
            const selected = createMemo(() => {
                const i = selIndex();
                const all = listFrags();
                return i >= 0 && i < all.length ? all[i] : null;
            });

            // 头部常量（唯一声明）
            const HEADER = [
                { text: "star-memory.execute(me);", accent: true, start: 0, right: "v2.2.1" },
                { text: "// memory introspector", muted: true, start: STAGGER, right: undefined as string | undefined },
            ];

            // 打字中的唯一光标：最后一个未打完的 header 行
            const caretIdx = createMemo(() => {
                const m = ms();
                if (!typingOn()) return -1;
                let idx = -1;
                HEADER.forEach((s, i) => {
                    const n = Math.min(s.text.length, Math.floor(Math.max(0, m - s.start) / SPEED_PER_CHAR));
                    if (n > 0 && n < s.text.length) idx = i;
                });
                return idx;
            });

            const TypeLine = (props: { start: number; text: string; fg: any; caret?: boolean; right?: string; onClick?: () => void }) => {
                const n = createMemo(() => {
                    ms();
                    if (!typingOn()) return props.text.length;
                    return Math.min(props.text.length, Math.floor(Math.max(0, ms() - props.start) / SPEED_PER_CHAR));
                });
                const body = createMemo(() => {
                    const t = props.text.slice(0, n());
                    return props.caret && n() < props.text.length ? t + "▌" : t;
                });
                return (
                    <text fg={props.fg} onClick={props.onClick}>
                        {props.right ? (
                            <>
                                {body()}{" ".repeat(Math.max(1, GAUGE - dw(body()) - dw(props.right)))}
                                <span style={{ fg: dimColor(muted, 0.75) }}>{props.right}</span>
                            </>
                        ) : (
                            body()
                        )}
                    </text>
                );
            };

            const Fade = (props: { start: number; children: any }) => (
                <Show when={!typingOn() || ms() >= props.start}>{props.children}</Show>
            );

            // 条形生长：入场期间从 0 长到目标（ease-out cubic），括号静态
            const gbar = (ratio: number, width: number, start: number): string => {
                const inner = (): string => {
                    if (!typingOn() || ms() >= HORIZON) return heatFill(ratio, width);
                    const t = Math.max(0, (ms() - start) / 600);
                    const k = 1 - Math.pow(1 - Math.min(1, t), 3);
                    return heatFill(ratio * k, width);
                };
                return "[" + inner() + "]";
            };

            const HEADER_FG = (h: (typeof HEADER)[number]) => (h.accent ? accent : muted);

            // 【重设计】Metric 键值行（cache-stats 风格）：label 左（截断）/ value 加粗 / suffix 右对齐
            const Metric = (props: { label: string; value: string; fg?: any; suffix?: string; start?: number }) => (
                <Fade start={props.start ?? BODY_START}>
                    <box flexDirection="row" gap={1} width="100%">
                        <text fg={muted} flexGrow={1} flexShrink={1} minWidth={0} wrapMode="none" truncate>{props.label}</text>
                        <text fg={props.fg ?? base} flexShrink={0} wrapMode="none">{props.value}</text>
                        <Show when={props.suffix !== undefined}>
                            <text fg={muted} width={8} textAlign="right" flexShrink={0} wrapMode="none">{props.suffix}</text>
                        </Show>
                    </box>
                </Fade>
            );

            // 【重设计】设置行（点击切换开关，同 Metric 布局）
            const SettingRow = (props: { label: string; value: string; onClick: () => void; fg?: any }) => (
                <box flexDirection="row" gap={1} width="100%" onClick={props.onClick}>
                    <text fg={muted} flexGrow={1} flexShrink={1} minWidth={0} wrapMode="none" truncate>{props.label}</text>
                    <text fg={props.fg ?? base} flexShrink={0} wrapMode="none">{props.value}</text>
                </box>
            );

            const overviewRows = createMemo(() => {
                const s = st();
                const rows: { label: string; value: string; start: number; fg: any; ratio: number }[] = [];
                let r = 0;
                const push = (label: string, value: string, fg: any, ratio = -1) =>
                    rows.push({ label, value, start: BODY_START + r++ * ROW_STAGGER, fg, ratio });
                push("total", `${heatBar(s.total / s.max, 10)} ${s.total} / ${s.max}`, base, s.total / s.max);
                push("layers", `surface ${s.surface} · deep ${s.deep}`, base);
                push("weights", `low ${s.weightBins.low} · mid ${s.weightBins.mid} · high ${s.weightBins.high}`, base);
                // 分类分组（核心系统字段）
                push("sources", `inferred ${s.bySourceType.inferred ?? 0} · corroborated ${s.bySourceType.corroborated ?? 0} · user_confirmed ${s.bySourceType.user_confirmed ?? 0}`, base);
                push("types", `semantic ${s.byMemoryType.semantic ?? 0} · episodic ${s.byMemoryType.episodic ?? 0} · preference ${s.byMemoryType.preference ?? 0} · procedure ${s.byMemoryType.procedure ?? 0}`, base);
                push("consolidate", `transient ${s.byConsolidation.transient ?? 0} · consolidated ${s.byConsolidation.consolidated ?? 0} · archived ${s.byConsolidation.archived ?? 0}`, base);
                push("temperature", `${heatBar(s.byActivation.hot / Math.max(1, s.total), 8)} hot ${s.byActivation.hot} · warm ${s.byActivation.warm} · cold ${s.byActivation.cold}`, base, s.byActivation.hot / Math.max(1, s.total));
                if (s.expiringPast > 0 || s.expiringSoon > 0) {
                    push("expiry", `past ${s.expiringPast} · soon(≤3d) ${s.expiringSoon}`, warn);
                }
                if (s.lastCompact) {
                    const days = Math.floor((Date.now() - new Date(s.lastCompact).getTime()) / 86400000);
                    push("last.compact", `${s.lastCompact.replace("T", " ").slice(0, 16)} // ${days}d ago`, base);
                } else {
                    push("last.compact", "never // 未整理过", muted);
                }
                push("top", `${s.topCategories.map((c) => `${c.name}×${c.count}`).join(" · ")}`, base);
                s.suggestions.forEach((sug) => push("!", sug, warn));
                return rows;
            });

            onCleanup(() => {
                if (clockTimer) clearInterval(clockTimer);
                clearInterval(tcTimer);
            });

            return (
                <box width="100%" flexGrow={1} flexDirection="column" paddingLeft={2} paddingRight={2} paddingTop={1}
                    border={settings.get().panel_border !== false} borderColor={panelBorder()}>
                    {/* HUD 行：sec/rev/beat 左 · 时码右（30fps 丝滑滚动） */}
                    <text fg={muted}>
                        {justify(
                            `sec memory · rev ${String(rev()).padStart(4, "0")}` +
                                (flashStep() < 2
                                    ? ` (${monitor.cur - monitor.prev >= 0 ? "+" : ""}${monitor.cur - monitor.prev}) · beat ${flashStep() + 1}`
                                    : " · beat --"),
                            timecode(),
                            GAUGE,
                        )}
                    </text>
                    {/* 标题（打字机入场）+ 版本右 */}
                    <For each={HEADER}>
                        {(s, i) => <TypeLine start={s.start} text={s.text} fg={HEADER_FG(s)} caret={caretIdx() === i()} right={s.right} />}
                    </For>
                    {/* 状态注释行 */}
                    <text fg={muted}>{`// ${st().total} fragments · ${st().byActivation.hot} hot · ${st().byActivation.cold} cold · rev ${rev()} · updated ${lastRevAt.day} ${lastRevAt.clock}`}</text>
                    {/* Tab 行（点击切换，无动画重播→丝滑；召回 Tab 随 auto_recall 显隐） */}
                    <box flexDirection="row" gap={2} paddingTop={1}>
                        <For each={availableTabs()}>
                            {(tk) => (
                                <text fg={effTab() === tk ? accent : (tk === "recall" ? ok : tk === "dev" ? warnC : muted)} onClick={() => setTab(tk)}>
                                    {effTab() === tk ? `[${tabLabel(tk)}]` : ` ${tabLabel(tk)} `}
                                </text>
                            )}
                        </For>
                    </box>
                    <Show when={effTab() === "overview"}>
                        <box flexDirection="column" flexGrow={1} paddingTop={1}>
                            <text fg={base} onClick={() => toggleFold("overview")}>
                                {secHeader("overview", `${st().total}/${st().max} · ${st().byActivation.hot} hot · ${st().byActivation.cold} cold`, !isFolded("overview"), GAUGE)}
                            </text>
                            <Show when={!isFolded("overview")}>
                                <Fade start={BODY_START}>
                                    <text>
                                        <span fg={muted}>{"activate "}</span>
                                        <span fg={tier(st().total / st().max)}>{heatFill(st().total / st().max, 14)}</span>
                                        <span fg={muted}>{" "}{Math.round((st().total / st().max) * 100)}% · {st().total}/{st().max}</span>
                                    </text>
                                </Fade>
                                <Metric label="layers" value={`surface ${st().surface} · deep ${st().deep} · weights ${st().weightBins.low}/${st().weightBins.mid}/${st().weightBins.high}`} />
                                <Metric label="types" value={`sem ${st().byMemoryType.semantic ?? 0} · epi ${st().byMemoryType.episodic ?? 0} · pref ${st().byMemoryType.preference ?? 0} · proc ${st().byMemoryType.procedure ?? 0}`} />
                                <Metric label="sources" value={`infer ${st().bySourceType.inferred ?? 0} · corrob ${st().bySourceType.corroborated ?? 0} · user ${st().bySourceType.user_confirmed ?? 0}`} />
                                <Metric label="consolidate" value={`trans ${st().byConsolidation.transient ?? 0} · cons ${st().byConsolidation.consolidated ?? 0} · arch ${st().byConsolidation.archived ?? 0}`} />
                                <Metric label="temperature" value={`hot ${st().byActivation.hot} · warm ${st().byActivation.warm} · cold ${st().byActivation.cold}`} fg={tier(st().byActivation.hot / Math.max(1, st().total))} />
                                <Show when={st().expiringPast > 0 || st().expiringSoon > 0}>
                                    <Metric label="expiry" value={`past ${st().expiringPast} · soon ${st().expiringSoon}`} fg={warn} />
                                </Show>
                                <Metric label="last.compact" value={st().lastCompact ? `${st().lastCompact.replace("T", " ").slice(0, 10)} · ${Math.floor((Date.now() - new Date(st().lastCompact).getTime()) / 86400000)}d ago` : "never"} />
                                <Metric label="top" value={st().topCategories.map((c) => `${c.name}×${c.count}`).join(" · ")} />
                            </Show>
                        </box>
                    </Show>
                    <Show when={effTab() === "list"}>
                        <box flexDirection="column" flexGrow={1} paddingTop={1}>
                            <text fg={base} onClick={() => toggleFold("list")}>{secHeader("fragments", `${listFrags().length} · ↑↓ select · #${selIndex() + 1}`, !isFolded("list"), GAUGE)}</text>
                            <Show when={!isFolded("list")}>
                            {/* N1：分类过滤 chips（点击过滤 / 再点清除；关键词搜索用 /memory <关键词> slash 命令） */}
                            <box flexDirection="row" gap={1}>
                                <text fg={filterCat() === "" ? base : muted} selectable={false} onClick={() => setFilterCat("")}>{"[全部]"}</text>
                                <For each={catList()}>
                                    {(c) => (
                                        <text fg={filterCat() === c[0] ? base : muted} selectable={false} onClick={() => setFilterCat(filterCat() === c[0] ? "" : c[0])}>
                                            {`[${c[0]}×${c[1]}]`}
                                        </text>
                                    )}
                                </For>
                            </box>
                            <box flexDirection="row" flexGrow={1}>
                                <box flexDirection="column" flexGrow={1} flexBasis={0} minWidth={0}>
                                    <For each={visible()}>
                                        {({ f, abs }) => (
                                            <text fg={abs === selIndex() ? base : tierW(f.weight ?? 0.5)}
                                                onClick={() => selectIndex(abs)}>
                                                {`${abs === selIndex() ? "▶" : " "} ${String(abs + 1).padStart(3)} ${gbar(f.weight ?? 0.5, 5, BODY_START)} ${padEndDW(`${f.category ?? "-"}`, 5)} ${cutDW(f.content, 14)}`}
                                            </text>
                                        )}
                                    </For>
                                </box>
                                <box flexDirection="column" flexGrow={1} paddingLeft={1} flexBasis={0} minWidth={0}>
                                    <Show when={selected()}>
                                        {(sel) => (
                                            <box flexDirection="column">
                                                <text fg={base}>{sel.content}</text>
                                                <Metric label="type" value={`${typeTag(sel.memory_type)} · ${consTag(sel.consolidation_status)} · ${tmpTag(sel.weight)}`} />
                                                <Metric label="src" value={`${srcTag(sel.source_type)} · conf ${sel.confidence ?? "-"} · w ${sel.weight ?? "-"}`} />
                                                <Metric label="time" value={`created ${fmtDate(sel.created_at)} · access ${fmtDate(sel.last_accessed_at)}`} />
                                                <Metric label="recall" value={`×${sel.recall_frequency ?? 0} · last ${fmtDate(sel.last_recalled)}`} />
                                                <Metric label="cat" value={sel.category ?? "-"} />
                                                <Show when={sel.associations?.length}>
                                                    <Metric label="tags" value={sel.associations!.join(" · ")} />
                                                </Show>
                                            </box>
                                        )}
                                    </Show>
                                    <Show when={!selected()}>
                                        <text fg={muted}>no selection</text>
                                    </Show>
                                </box>
                            </box>
                            </Show>
                        </box>
                    </Show>
                    <Show when={effTab() === "dev"}>
                        <box flexDirection="column" flexGrow={1} paddingTop={1}>
                            <text fg={base} onClick={() => toggleFold("dev")}>
                                {secHeader("dev · 开发者模式", `${devUnlocked() ? "已解锁" : "未解锁"} · ${t("devRules")}`, !isFolded("dev"), GAUGE)}
                            </text>
                            <Show when={!isFolded("dev")}>
                                <Fade start={BODY_START}>
                                    <text fg={muted}>{`${t("devRules")} (${MEMORY_PATH}):`}</text>
                                    <For each={devItems()}>
                                        {(it, i) => (
                                            <text fg={devFocusOn(0, i()) ? accent : base} onClick={() => { setDevFocus({ row: 0, col: i() }); setDevSel(i()); void devEdit(); }}>
                                                {`${devFocusOn(0, i()) ? "▶" : " "}${it.label}: ${cutDW(oneLine(it.value), 40)}${it.sub ? ` · ${it.sub}` : ""}`}
                                            </text>
                                        )}
                                    </For>
                                    <box flexDirection="row" gap={1} paddingTop={1}>
                                        <text fg={devFocusOn(1, 0) ? accent : base} onClick={() => { setDevFocus({ row: 1, col: 0 }); void devEdit(); }}>{`${devFocusOn(1, 0) ? "▶" : " "}[${t("agentsEdit")}]`}</text>
                                        <text fg={devFocusOn(1, 1) ? accent : base} onClick={() => { setDevFocus({ row: 1, col: 1 }); void devAddRule(); }}>{`${devFocusOn(1, 1) ? "▶" : " "}[${t("devAddRule")}]`}</text>
                                    </box>
                                    <Show when={devMsg()}>
                                        <text fg={accent}>{devMsg()}</text>
                                    </Show>
                                </Fade>
                            </Show>
                        </box>
                    </Show>
                    <Show when={effTab() === "recall"}>
                        <box flexDirection="row" flexGrow={1} paddingTop={1} gap={1}>
                            {/* 左：召回设置（档位/参数/诊断） */}
                            <box flexDirection="column" flexGrow={1} flexBasis={0} minWidth={0}>
                                <text fg={base} onClick={() => toggleFold("recall")}>
                                    {secHeader("recall", `${RECALL_LEVELS[recallTarget()]} · auto ${loadRecallRuntime().enabled ? "on" : "off"}`, !isFolded("recall"), GAUGE)}
                                </text>
                                <Show when={!isFolded("recall")}>
                                    <Fade start={BODY_START}>
                                        <text>
                                            <span fg={muted}>{"track "}</span>
                                            <span style={{ fg: recallColor((recallTarget() / 6) * 100) }}>{recallTrack(recallTarget())}</span>
                                            <span fg={muted}>{" "}{RECALL_LEVELS[recallTarget()]}</span>
                                        </text>
                                    </Fade>
                                    <Metric label="desc" value={recallDesc(recallTarget())} />
                                    <Metric label="params" value={recallParams(recallTarget())} />
                                    <Metric label="state" value={`auto_recall ${loadRecallRuntime().enabled ? "on" : "off"} · ${t("recallStateHint")}`} fg={loadRecallRuntime().enabled ? base : muted} />
                                    <Metric label="diag" value={`${t("diagTrig")} ${recallDiag().total} · ${t("diagInj")} ${recallDiag().injected} · ${t("diagBlock")} ${recallDiag().blocked} · ${t("diagCand")} ${recallDiag().cand}`} />
                                    <Show when={recallDiag().total > 0}>
                                        <Metric label="avg" value={`${(recallDiag().injected / Math.max(1, recallDiag().total)).toFixed(1)} ${t("avgPerHit")} · ~${recallDiag().injected * 30} tok`} />
                                    </Show>
                                </Show>
                            </box>
                            {/* 右：召回历史（↑↓ 选择 + Enter/→ 展开 + ← 收起，参考 list Tab 键盘模式） */}
                            <box flexDirection="column" flexGrow={1} flexBasis={0} minWidth={0} paddingLeft={1}>
                                <text fg={base} onClick={() => toggleFold("recallHistory")}>
                                    {secHeader("recallHistory", `${t("recallHistoryTitle")} · ${recallHist().length} ${t("recallHistoryUnit")} · ↑↓ select · #${recallHist().length ? recallSel() + 1 : 0}`, !isFolded("recallHistory"), GAUGE)}
                                </text>
                                <Show when={!isFolded("recallHistory")}>
                                    <Show when={recallHist().length === 0}>
                                        <text fg={muted}>{"— " + t("recallHistoryEmpty") + " —"}</text>
                                    </Show>
                                    <For each={recallVisible()}>
                                        {({ e, abs }) => (
                                            <box flexDirection="column">
                                                <text fg={recallSel() === abs ? base : muted}
                                                    onClick={() => { setRecallSel(abs); setRecallHistOpen((p) => ({ ...p, [abs]: !p[abs] })); }}>
                                                    {`${recallSel() === abs ? "▶" : " "} ${shortT(e.t)} · ${e.count}${t("recallHistoryItems")} · ${recallSummary(e)}`}
                                                </text>
                                                <Show when={recallHistOpen()[abs]}>
                                                    <For each={e.items}>
                                                        {(it) => (
                                                            <text fg={muted}>{`    • ${it.tag ? "[" + it.tag + "] " : ""}${cutDW(it.content ?? "", 46)}`}</text>
                                                        )}
                                                    </For>
                                                </Show>
                                            </box>
                                        )}
                                    </For>
                                </Show>
                            </box>
                        </box>
                    </Show>
                    <Show when={effTab() === "agents"}>
                        <box flexDirection="column" flexGrow={1} paddingTop={1}>
                            <text fg={base} onClick={() => toggleFold("agents")}>
                                {secHeader("agents.md", `${fs.existsSync(AGENTS_PATH) ? "✓ " + AGENTS_PATH : t("agentsNone")}${agentsTouched() ? " · ●" : ""}`, !isFolded("agents"), GAUGE)}
                            </text>
                            <Show when={!isFolded("agents")}>
                                <Fade start={BODY_START}>
                                    {/* 模板行：4 个模板按钮，方向键选中 + Enter 应用（占位符用当前字段值渲染） */}
                                    <box flexDirection="row" gap={1} paddingBottom={1}>
                                        <For each={AGENTS_TEMPLATES}>
                                            {(tpl, i) => (
                                                <text fg={agentsFocusOn(0, i()) ? accent : muted} onClick={() => agentsApplyTemplate(tpl.id)}>
                                                    {`${agentsFocusOn(0, i()) ? "▶" : " "}[${t(tpl.i18n)}]`}
                                                </text>
                                            )}
                                        </For>
                                    </box>
                                    {/* 字段行：核心字段（username/reasoningLanguage 等），方向键选中 + Enter 编辑 */}
                                    <text fg={muted}>{`${t("agentsFields")}:`}</text>
                                    <box flexDirection="row" gap={1} flexWrap="wrap" paddingBottom={1}>
                                        <For each={AGENTS_FIELDS}>
                                            {(f, i) => (
                                                <text fg={agentsFocusOn(1, i()) ? accent : base} onClick={() => void agentsEditField(f.key)}>
                                                    {`${agentsFocusOn(1, i()) ? "▶" : " "}${t(f.i18n)}: ${agentsFields()[f.key] ?? f.def} ·`}
                                                </text>
                                            )}
                                        </For>
                                    </box>
                                    {/* 说明片段行（P8）：可开关段落，开=注入 AGENTS.md / 关=隐藏；Enter 切换 */}
                                    <text fg={muted}>{`${t("agentsSegments")}:`}</text>
                                    <box flexDirection="row" gap={1} flexWrap="wrap" paddingBottom={1}>
                                        <For each={AGENTS_SEGMENTS}>
                                            {(s, i) => {
                                                const on = (agentsSegs()[s.id] ?? segState(s.id)).enabled;
                                                return (
                                                    <text fg={agentsFocusOn(2, i()) ? accent : (on ? base : muted)} onClick={() => agentsToggleSegment(s.id)}>
                                                        {`${agentsFocusOn(2, i()) ? "▶" : " "}[${on ? "开" : "关"}] ${t(s.i18n)} ·`}
                                                    </text>
                                                );
                                            }}
                                        </For>
                                    </box>
                                    {/* 操作行：保存 / 重载 / 手动编辑 / 编辑片段（方向键选中 + Enter 执行） */}
                                    <box flexDirection="row" gap={1} paddingBottom={1}>
                                        <text fg={agentsFocusOn(3, 0) ? accent : (agentsTouched() ? accent : muted)} onClick={() => agentsSave()}>
                                            {`${agentsFocusOn(3, 0) ? "▶" : " "}[${t("agentsSave")}${agentsTouched() ? " ●" : ""}]`}
                                        </text>
                                        <text fg={agentsFocusOn(3, 1) ? accent : muted} onClick={() => agentsReload()}>
                                            {`${agentsFocusOn(3, 1) ? "▶" : " "}[${t("agentsReload")}]`}
                                        </text>
                                        <text fg={agentsFocusOn(3, 2) ? accent : muted} onClick={() => void agentsManualEdit()}>
                                            {`${agentsFocusOn(3, 2) ? "▶" : " "}[${t("agentsEdit")}]`}
                                        </text>
                                        <text fg={agentsFocusOn(3, 3) ? accent : muted} onClick={() => void agentsEditSegment()}>
                                            {`${agentsFocusOn(3, 3) ? "▶" : " "}[${t("agentsEditSeg")}]`}
                                        </text>
                                    </box>
                                    {/* 消息行 */}
                                    <Show when={agentsMsg()}>
                                        <text fg={accent}>{agentsMsg()}</text>
                                    </Show>
                                    {/* 内容预览（读内容，换行显示） */}
                                    <Show when={agentsContent()}>
                                        <box flexDirection="column" flexGrow={1} paddingTop={1}>
                                            <text fg={muted}>{t("agentsContent")} ({agentsContent().split("\n").length} 行):</text>
                                            <text fg={base} flexGrow={1}>{agentsContent()}</text>
                                        </box>
                                    </Show>
                                    <Show when={!agentsContent()}>
                                        <text fg={muted}>{t("agentsNone") + " · " + t("agentsTemplate") + " ↓"}</text>
                                    </Show>
                                </Fade>
                            </Show>
                        </box>
                    </Show>
                    <text fg={muted}>{justify("// star-memory", "v2.2.1 · opencode 2.2", GAUGE)}</text>
                </box>
            );
        };

        // ---- 召回卡片（session.composer.top slot）：召回发生时在输入框上方显示 ⭐ 提示条，可折叠看内容 ----
        // server 召回 → recall-hook.log 追加（含 items[]）→ TUI 轮询 mtime → 解析最新"真实召回"（跳过 context-skip/error）→ setRecallEvent → 卡片显示
        type RecallEvent = { t: string; kind: string; count: number; items: Array<{ tag?: string; content?: string; category?: string; confidence?: number; memory_type?: string }> };
        const RECALL_AUTO_HIDE_MS = 8000; // 召回卡片自动消失超时：用户只想确认召回发生一次，8s 无交互且未展开 → 自动隐藏（不想一直看着）
        const [recallEvent, setRecallEvent] = createSignal<RecallEvent | null>(null);
        const [recallOpen, setRecallOpen] = createSignal(false);
        // 动态弹出动画（属性/结构）经 4 次验证确认对 composer.top slot 不可行（详见 RECALL_VISIBILITY.md 根因分析）。
        // recallPop/startRecallPop 已删除（无效动画代码），卡片稳定全显。
        let lastRecallLogMtime = 0;
        try { lastRecallLogMtime = fs.statSync(RECALL_HOOK_LOG).mtimeMs; } catch {}
        let lastRecallShownT = ""; // 已展示过的事件 t（避免 × 关闭后轮询重显同一事件）
        function loadLatestRecall(): RecallEvent | null {
            try {
                const lines = fs.readFileSync(RECALL_HOOK_LOG, "utf-8").split("\n").filter(Boolean);
                // 倒序找最新"真实召回"（prompt/context），跳过 context-skip/context-error（count=0 诊断条目，会导致"注入0条"误显示）
                for (let i = lines.length - 1; i >= 0; i--) {
                    const rec = JSON.parse(lines[i]);
                    if (rec.kind === "prompt" || rec.kind === "context") {
                        return { t: rec.t ?? "", kind: rec.kind ?? "", count: Number(rec.count) || 0, items: Array.isArray(rec.items) ? rec.items : [] };
                    }
                }
                return null;
            } catch { return null; }
        }
        // 启动时加载最近一次召回（5 分钟内）显示，给用户上下文
        const initEv = loadLatestRecall();
        if (initEv) {
            const ageMs = Date.now() - new Date(initEv.t).getTime();
            if (ageMs < 5 * 60 * 1000) {
                setRecallEvent(initEv);
                lastRecallShownT = initEv.t;
            }
        }
        const recallLogPoll = setInterval(() => {
            try {
                // 自动消失：卡片显示超 RECALL_AUTO_HIDE_MS 且未展开 → 自动隐藏
                // （用户展开看内容时不打扰；关闭展开后超时立即消失。解决"长时间停留"不优雅）
                if (recallEvent() && lastRecallShownT && !recallOpen()) {
                    const ageMs = Date.now() - new Date(lastRecallShownT).getTime();
                    if (ageMs > RECALL_AUTO_HIDE_MS) setRecallEvent(null);
                }
                if (!fs.existsSync(RECALL_HOOK_LOG)) return; // 文件尚未创建（首次召回前）→ 跳过，避免每 2s 抛异常
                const m = fs.statSync(RECALL_HOOK_LOG).mtimeMs;
                if (m === lastRecallLogMtime) return;
                lastRecallLogMtime = m;
                // 读最新条目（任何 kind），判断是新召回还是新消息无召回
                const lines = fs.readFileSync(RECALL_HOOK_LOG, "utf-8").split("\n").filter(Boolean);
                if (lines.length === 0) return;
                const latest = JSON.parse(lines[lines.length - 1]);
                if (latest.kind === "prompt" || latest.kind === "context") {
                    // 真实召回 → 显示卡片
                    if (latest.t === lastRecallShownT) return;
                    lastRecallShownT = latest.t;
                    setRecallEvent({ t: latest.t, kind: latest.kind, count: Number(latest.count) || 0, items: Array.isArray(latest.items) ? latest.items : [] });
                    setRecallOpen(false);
                } else if (latest.kind === "prompt-skip") {
                    // 新用户消息无召回 → 清空卡片（下一条聊天自动消失）
                    // context-skip/context-error 不清空（AI 回复过程中的模型请求，不代表新用户消息）
                    if (recallEvent()) setRecallEvent(null);
                }
            } catch {}
        }, 2000);
        const RecallHintCard = (props: { event: RecallEvent }) => {
            const ev = props.event;
            if (!ev) return null;
            // 动态弹出动画（属性/结构）经 3+1 次验证确认对 composer.top slot 不可行（详见 RECALL_VISIBILITY.md 根因分析）。
            // 回退到稳定全显版本：内容直接渲染，无内层 Show 分档（避免 recallPop 首次渲染读 0 导致内容空白的非确定性风险）。
            // 注意：OpenTUI 的 onClick 在 <text>/<box> 上生效，<span> 不支持 → 可点击元素必须用 text，放 box row 里
            // O2 召回卡片增强：可信度汇总（确认/佐证记忆数，P3 佐证加权后让用户感知召回可信度）
            const trusted = ev.items.filter((it) => it.tag === "确认" || it.tag === "佐证").length;
            return (
                <box border borderColor={panelBorder()} paddingX={1} flexDirection="column">
                    <box flexDirection="row" gap={1}>
                        <text fg={accent}>{"⭐"}</text>
                        <text fg={base}>{t("recallHintPrefix") + " " + ev.count + " " + t("recallHintUnit")}</text>
                        {trusted > 0 ? <text fg={ok}>{"· 可信 " + trusted + "/" + ev.count}</text> : null}
                        <text fg={muted}>{"· " + ev.kind}</text>
                        <text fg={muted} selectable={false} onMouseDown={() => setRecallOpen(!recallOpen())}>{(recallOpen() ? "▼ " : "▶ ") + t("recallHintExpand")}</text>
                        <text fg={muted} selectable={false} onMouseDown={() => setRecallEvent(null)}>{"×"}</text>
                    </box>
                    <Show when={recallOpen()}>
                        <For each={ev.items}>
                            {(it) => (
                                <text fg={muted}>{"• " + (it.tag ? "[" + it.tag + "] " : "") + (it.content ?? "") + (it.confidence !== undefined ? " (conf " + it.confidence + ")" : "")}</text>
                            )}
                        </For>
                    </Show>
                </box>
            );
        };
        context.ui.slot({
            append: "session.composer.top",
            render: () => (
                <Show when={recallEvent() && settings.get().auto_recall}>
                    {/* 动态 event props：babel 不提升动态 vnode → get children() 每次新 vnode → Show memo equals 不同 → pop 变化触发重渲染 */}
                    <RecallHintCard event={recallEvent()} />
                </Show>
            ),
        });

        context.ui.router.register({
            name: "memory",
            render: (input) => <MemoryPage data={input?.data} />,
        });

        // ---- 全局命令 / 快捷键 ----
        context.keymap.layer(() => ({
            mode: "global",
            priority: 10,
            commands: [
                {
                    id: "opencode.memory.open",
                    title: "记忆: 打开管理页 / 搜索记忆",
                    group: "Memory",
                    bind: "ctrl+shift+m",
                    palette: true,
                    slash: { name: "memory", aliases: ["mem"], arguments: true },
                    enabled: () => true,
                    run: (input?: string) => {
                        if (!settings.get().hotkey) {
                            context.ui.toast.show({ message: "快捷键已在设置中关闭" });
                            return;
                        }
                        const q = (input ?? "").trim();
                        if (q) {
                            void searchDialog(q);
                        } else {
                            context.ui.router.navigate({ type: "plugin", name: "memory" });
                        }
                    },
                },
                {
                    id: "opencode.memory.settings",
                    title: "记忆: TUI 设置（插槽/快捷键开关）",
                    group: "Memory",
                    palette: true,
                    slash: { name: "memory-settings" },
                    enabled: () => true,
                    run: () => void settingsDialog(),
                },
                // 【已停用】/recall-test 手动召唤测试命令（用户反馈"还不如直接输入文本"，回归直接输入触发召回）
                // {
                //     id: "opencode.memory.recallTest",
                //     title: "记忆: 召回测试（输入关键词，预览会召回哪些记忆）",
                //     group: "Memory",
                //     palette: true,
                //     slash: { name: "recall-test", aliases: ["recall"], arguments: true },
                //     enabled: () => true,
                //     run: (input?: string) => {
                //         const q = (input ?? "").trim();
                //         if (!q) {
                //             context.ui.toast.show({ message: t("recallTestUsage") });
                //             return;
                //         }
                //         const rt = loadRecallRuntime();
                //         if (!rt.enabled || Number(rt.effort) === 0) {
                //             context.ui.toast.show({ message: t("recallTestOff") });
                //             return;
                //         }
                //         const items = previewRecall(q);
                //         if (!items || items.length === 0) {
                //             context.ui.toast.show({ message: t("recallTestNone") + q });
                //             return;
                //         }
                //         // 复用 RecallHintCard + 弹出动画：手动召唤（kind="manual" 不走 log 轮询）
                //         const evT = new Date().toISOString();
                //         setRecallEvent({ t: evT, kind: "manual", count: items.length, items: items.map((it) => ({ tag: it.tag, content: it.content })), pop: 0 });
                //         lastRecallShownT = evT; // 手动召唤：同步显示时间，自动消失从此刻计时（否则旧 t 会立即清空卡片）
                //         setRecallOpen(false);
                //         startRecallPop();
                //     },
                // },
            ],
        }));

        return () => {
            clearTimeout(debounce);
            clearInterval(poll);
            for (const t of flashTimers) clearTimeout(t);
            for (const w of watchers) {
                try {
                    w.close();
                } catch {}
            }
            clearInterval(recallLogPoll);
        };
    },
});
