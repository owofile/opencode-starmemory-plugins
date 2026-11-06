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

function fmtClock(msTotal: number): string {
    const t = Math.max(0, Math.floor(msTotal));
    const m = Math.floor(t / 60000);
    const s = Math.floor((t % 60000) / 1000);
    const f = t % 1000;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(f).padStart(3, "0")}`;
}

// ---------- 统计 ----------

function computeStats() {
    const frags = loadFragments();
    const config = loadFragConfig();
    const byLayer = { surface: 0, deep: 0 };
    const weightBins = { low: 0, mid: 0, high: 0 };
    const catCount = new Map<string, number>();
    for (const f of frags) {
        if (f.layer === "deep") byLayer.deep++;
        else byLayer.surface++;
        const w = f.weight ?? 0.5;
        if (w >= 0.8) weightBins.high++;
        else if (w >= 0.4) weightBins.mid++;
        else weightBins.low++;
        const c = f.category ?? "-";
        catCount.set(c, (catCount.get(c) ?? 0) + 1);
    }
    const suggestions: string[] = [];
    if (frags.length >= config.json_max_count) {
        suggestions.push(`fragments(${frags.length}) = json_max_count(${config.json_max_count}) → 必须整理`);
    } else if (frags.length >= config.json_max_count * 0.9) {
        suggestions.push(`fragments(${frags.length}) 接近上限(${config.json_max_count})，建议整理`);
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
        const theme = context.theme;
        const base = theme.text.base;
        const muted = theme.text.muted;
        const warn = (theme as any).text?.error ?? (theme as any).text?.warning ?? base;
        const accent = (theme as any).text?.primary ?? (theme as any).text?.accent ?? base;
        const ok = (theme as any).text?.success ?? accent; // success 语义色（灰绿）
        const warnC = (theme as any).text?.warning ?? warn; // warning 语义色（灰黄）
        const errC = (theme as any).text?.error ?? warn; // error 语义色（灰红）
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
            const r = await context.ui.dialog.select({
                title: "StarMenory TUI 设置",
                options: [
                    { title: `主界面底部状态插槽: ${s.footer_slot ? "开" : "关"}`, value: "footer_slot" },
                    { title: `会话侧栏状态: ${s.sidebar_slot ? "开" : "关"}`, value: "sidebar_slot" },
                    { title: `快捷键 ctrl+shift+m: ${s.hotkey ? "开" : "关"}`, value: "hotkey" },
                    { title: `打字机动效: ${typingOn() ? "开" : "关"}`, value: "typing" },
                    { title: `面板边框: ${s.panel_border ? "开" : "关"}`, value: "panel_border" },
                    { title: "关于", value: "about", selection: "none" },
                ],
            });
            if (!r) return;
            if (r === "about") {
                await context.ui.dialog.alert({
                    title: "StarMenory TUI",
                    message: "v2.1.1\n/memory 打开管理页（全部在终端内）。\n动效: 打字机入场 / 条形生长 / 变更渐退。",
                });
                return;
            }
            await settings.set({ [r]: !s[r] });
            context.ui.toast.show({ message: "设置已保存（即时生效）", variant: "success" });
        }

        // ---- 状态插槽（静态；数据变更时 3 档高亮渐退） ----
        const StatusChip = (props: { compact?: boolean }) => {
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
            // 一行版右侧：动态条形宽（受侧栏内宽约束，随 max 位数自适应）+ 数字
            const barRight = () => {
                const r = st().total / st().max;
                const num = `${st().total}/${st().max}`;
                const inner = SIDEBAR_GAUGE - 4; // border 2 + padding 2
                const barW = Math.max(2, inner - dw("⭐ memory") - dw(num) - 4);
                return heatBar(r, barW) + " " + num;
            };
            return (
                <Show when={st().total > 0}>
                    {props.compact ? (
                        <box flexShrink={0}
                            border={settings.get().panel_border !== false} borderColor={panelBorder()}
                            paddingLeft={1} paddingRight={1}
                            onClick={() => context.ui.router.navigate({ type: "plugin", name: "memory" })}>
                            <text>
                                <span fg={muted}>{"⭐ memory"}</span>
                                {" ".repeat(Math.max(1, SIDEBAR_GAUGE - 4 - dw("⭐ memory") - dw(barRight())))}
                                <span fg={tier(st().total / st().max)}>{barRight()}</span>
                            </text>
                        </box>
                    ) : (
                        <box flexShrink={0}>
                            <text fg={fg()}>
                                {`★ ${st().total}/${st().max} ${heatBar(st().total / st().max, 10)}`}
                            </text>
                        </box>
                    )}
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
                    <StatusChip compact />
                </Show>
            ),
        });

        // ---- 管理页 ----
        const MemoryPage = (props: { data?: { q?: string } }) => {
            const [tab, setTab] = createSignal<"overview" | "mesh" | "list">("overview");
            const [page, setPage] = createSignal(0);
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
            const tcTimer = setInterval(() => setTcTick((t) => t + 1), 100);
            const timecode = () => {
                tcTick(); // 响应式依赖：让 10fps tick 驱动本行重渲染
                return fmtClock(Date.now() - tcStart);
            };

            // 页面命令层：仅在页面存活期间生效
            context.keymap.layer(() => ({
                mode: "global",
                commands: [
                    { id: "opencode.memory.tab.overview", bind: "1", run: () => { setTab("overview"); play(); } },
                    { id: "opencode.memory.tab.mesh", bind: "2", run: () => { setTab("mesh"); play(); } },
                    { id: "opencode.memory.tab.list", bind: "3", run: () => { setTab("list"); play(); } },
                    { id: "opencode.memory.fold", bind: "f", run: () => { toggleFold(tab()); play(1.5); } },
                    { id: "opencode.memory.page.next", bind: ".", run: () => { setPage(Math.min(page() + 1, pages() - 1)); play(2); } },
                    { id: "opencode.memory.page.prev", bind: ",", run: () => { setPage(Math.max(0, page() - 1)); play(2); } },
                    { id: "opencode.memory.manage", bind: "e", run: () => { void browseDialog(); } },
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

            const listFrags = createMemo(() => sorted(loadFragments()));
            const pages = createMemo(() => Math.max(1, Math.ceil(listFrags().length / PER_PAGE)));
            const paged = createMemo(() => {
                const p = Math.min(page(), pages() - 1);
                return listFrags().slice(p * PER_PAGE, (p + 1) * PER_PAGE);
            });

            // 头部常量（唯一声明）
            const HEADER = [
                { text: "star-memory.execute(me);", accent: true, start: 0, right: "v2.1.1" },
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

            const TypeLine = (props: { start: number; text: string; fg: any; caret?: boolean; right?: string }) => {
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
                    <text fg={props.fg}>
                        {props.right ? (
                            <>
                                {body()}{" ".repeat(Math.max(1, GAUGE - dw(body()) - dw(props.right)))}
                                <span fg={dimColor(muted, 0.75)}>{props.right}</span>
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

            const overviewRows = createMemo(() => {
                const s = st();
                const rows: { label: string; value: string; start: number; fg: any; ratio: number }[] = [];
                const push = (label: string, value: string, start: number, fg: any, ratio = -1) =>
                    rows.push({ label, value, start, fg, ratio });
                push("total", `${heatBar(s.total / s.max, 10)} ${s.total} / ${s.max}`, BODY_START, base, s.total / s.max);
                push("layers", `surface ${s.surface} · deep ${s.deep}`, BODY_START + ROW_STAGGER, base);
                push("weights", `low ${s.weightBins.low} · mid ${s.weightBins.mid} · high ${s.weightBins.high}`, BODY_START + 2 * ROW_STAGGER, base);
                if (s.lastCompact) {
                    const days = Math.floor((Date.now() - new Date(s.lastCompact).getTime()) / 86400000);
                    push("last.compact", `${s.lastCompact.replace("T", " ").slice(0, 16)} // ${days}d ago`, BODY_START + 3 * ROW_STAGGER, base);
                } else {
                    push("last.compact", "never // 未整理过", BODY_START + 3 * ROW_STAGGER, muted);
                }
                push("top", `${s.topCategories.map((c) => `${c.name}×${c.count}`).join(" · ")}`, BODY_START + 4 * ROW_STAGGER, base);
                s.suggestions.forEach((sug, i) => {
                    push("!", sug, BODY_START + (5 + i) * ROW_STAGGER, warn);
                });
                return rows;
            });

            onCleanup(() => {
                if (clockTimer) clearInterval(clockTimer);
                clearInterval(tcTimer);
            });

            return (
                <box width="100%" flexGrow={1} flexDirection="column" paddingLeft={2} paddingRight={2} paddingTop={1}
                    border={settings.get().panel_border !== false} borderColor={panelBorder()}>
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
                    <For each={HEADER}>
                        {(s, i) => <TypeLine start={s.start} text={s.text} fg={HEADER_FG(s)} caret={caretIdx() === i()} right={s.right} />}
                    </For>
                    <text fg={muted}>{`// rev ${rev()} · updated ${lastRevAt.day} ${lastRevAt.clock}`}</text>
                    <text fg={muted}>[1] overview [2] mesh [3] list · [f] fold · [e] manage [.] [,] page [r] replay [q] back</text>

                    <Show when={tab() === "overview"}>
                        <box flexDirection="column" flexGrow={1} paddingTop={1}>
                            <text fg={base} onClick={() => toggleFold("overview")}>
                                {secHeader("overview", `total ${st().total}/${st().max}`, !isFolded("overview"), GAUGE)}
                            </text>
                            <Show when={!isFolded("overview")}>
                                <For each={overviewRows()}>
                                    {(row) => (
                                        <Fade start={row.start}>
                                            <text fg={row.ratio >= 0 ? tier(row.ratio) : row.fg}>
                                                {justify(row.label, row.value, GAUGE)}
                                            </text>
                                        </Fade>
                                    )}
                                </For>
                            </Show>
                        </box>
                    </Show>
                    <Show when={tab() === "mesh"}>
                        <box flexDirection="column" flexGrow={1} paddingTop={1}>
                            <text fg={base} onClick={() => toggleFold("mesh")}>
                                {secHeader("mesh", `${groups().length} clusters`, !isFolded("mesh"), GAUGE)}
                            </text>
                            <Show when={!isFolded("mesh")}>
                                <For each={groups()}>
                                    {(g, gi) => {
                                        const rowStart = BODY_START + gi() * (ROW_STAGGER * 3);
                                        const maxCat = Math.max(...groups().map((x) => x.items.length), 1);
                                        const fk = `mesh:${g.category}`;
                                        return (
                                            <Fade start={rowStart}>
                                                <box flexDirection="column">
                                                    <text fg={tierW(g.items.length / maxCat)} onClick={() => toggleFold(fk)}>
                                                        {secHeader(g.category, `×${g.items.length}`, !isFolded(fk), GAUGE)}
                                                    </text>
                                                    <Show when={!isFolded(fk)}>
                                                        <text fg={tier(g.items.length / maxCat)}>
                                                            {"    "}{gbar(g.items.length / maxCat, 12, rowStart + ROW_STAGGER)}
                                                        </text>
                                                        <Show when={g.links.length}>
                                                            <text fg={muted}>{"    "}{g.links.map((k) => `↔ ${k}`).join(" · ")}</text>
                                                        </Show>
                                                        <Show when={g.items.length}>
                                                            <text fg={muted}>{"    "}· {cutDW(g.items[0].content, 56)}</text>
                                                        </Show>
                                                    </Show>
                                                </box>
                                            </Fade>
                                        );
                                    }}
                                </For>
                            </Show>
                        </box>
                    </Show>
                    <Show when={tab() === "list"}>
                        <box flexDirection="column" flexGrow={1} paddingTop={1}>
                            <text fg={base} onClick={() => toggleFold("list")}>
                                {secHeader("list", `page ${page() + 1}/${pages()}`, !isFolded("list"), GAUGE)}
                            </text>
                            <Show when={!isFolded("list")}>
                                <text fg={muted}>
                                    {"  "}{padEndDW("id", 4)} {padEndDW("bar", 11)} {padEndDW("category", 16)} {padEndDW("w", 4)} content
                                </text>
                                <For each={paged()}>
                                    {(f, i) => (
                                        <Fade start={BODY_START + i() * ROW_STAGGER}>
                                            <text fg={tierW(f.weight ?? 0.5)}>
                                                {"  "}{String(page() * PER_PAGE + i() + 1).padStart(4)} {" "}{gbar(f.weight ?? 0.5, 9, BODY_START + i() * ROW_STAGGER)} {" "}{padEndDW(`${f.category ?? "-"}`, 16)} {padEndDW(`w${f.weight ?? 0.5}`, 4)} {cutDW(f.content, 40)}
                                            </text>
                                        </Fade>
                                    )}
                                </For>
                            </Show>
                        </box>
                    </Show>
                    <text fg={muted}>{justify("// star-memory", "v2.1.1 · opencode 2.2", GAUGE)}</text>
                </box>
            );
        };

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
        };
    },
});
