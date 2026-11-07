# StarMenory Schema 分类字段设计文档

> 版本：v2.2.0（规划） · 状态：P0–P6 已完成，P6 本机验证通过（prompt 钩子 synthetic 注入端到端），待发布 · 日期：2026-11-07
> 关联：`index.js`（数据层）、`external/*.js`（冷归档脚本）、`tui.tsx`（仪表盘）

## 实施进度

| 阶段 | 内容 | 状态 |
|:---|:---|:---|
| **P0** | 设计文档 | ✅ 完成（本文档） |
| **P1** | Schema 字段落地（fragment 默认值 + 懒迁移 + fragment_archive 加列 + compactor/restorer/deep-search 贯通） | ✅ 完成并验证（25 个旧碎片已补默认值） |
| **P2** | 核心温度/写入路径（`computeActivation` + `applyRecall` 扩展 `updateRecall`） | ✅ 完成并验证（命中回写 use_history/base_activation 生效） |
| **P3** | 显式检索结构化过滤（search 加 source_type/memory_type/consolidation/exclude_expired/min_activation/sort） | ✅ 完成并验证（过滤+激活度排序生效） |
| **P4** | 梦想家（`memory_fragment_dream` + 巩固流转 + 温度重算 + 类型分化；compactor 归档 marked；周期定时） | ✅ 完成并验证（10 碎片巩固 + 22 激活度重算） |
| **P5** | TUI 仪表盘分组（overview 加 sources/types/consolidate/temperature/expiry 行） | ✅ 完成（转译通过，数据路径已接） |
| **P6** | 自动召回（事件驱动引擎：AutoRecallEngine + 钩子；默认 OFF；四道闸门 + Token 预算截断；绝不写 event.system） | ✅ 完成并本机验证（工具 + 钩子 + TUI 滑块；相关性修复后长查询 0→1；prompt 钩子 synthetic 注入端到端：日志 `{kind:prompt,count:1,injected:true}` + 界面 `[自动召回 · 1条]`） |

---

## 一、核心认知

**分类字段属于核心记忆系统，不属于自动召回。**

这些字段让核心系统本身变得更有结构、更可分类、更可解释。自动召回只是这些字段的一个**消费者**，而非拥有者。核心系统是字段的**生产者**（写入逻辑 + 梦想家 + 显式检索命中回写），自动召回**只读不写**（除它自己的命中回写，那也是消费者行为）。

因此：**自动召回关闭时，字段照常被核心系统维护，无任何功能退化。**

```
生产者（核心系统）                         消费者
─────────────────────────              ─────────────────────
memory_fragment_add  ──写入──▶ 字段  ◀──只读── 自动召回（四道闸门）
memory_fragment_update ─▶ 字段
显式检索命中回写 ────▶ use_history/温度
梦想家（dreamer）──▶ 巩固流转/温度重算/过期标记
```

---

## 二、存储模型决策

**当前没有 `memories` 关系表**，真实模型是：

| 层 | 存储 | 说明 |
|:---|:---|:---|
| 活跃层 | `fragments.json` → `{fragments: []}` | 每个 fragment 是核心记忆单元 |
| 冷归档层 | `fragment_archive.db` → `fragment_archive` 表 | 长期未访问的碎片，字段同上 + `archived_at` |

**决策：不新建 `memories` 表。** 分类字段直接加到 fragment 对象（JSON）属性上，`fragment_archive` 表加列。JSON 是核心，SQLite 是冷存储，与现有架构一致，改动小、风险低。

---

## 三、字段定义（分组按核心能力划分）

### 3.1 来源分类

| 字段 | 类型 | 默认 | 取值 | 用途 |
|:---|:---|:---|:---|:---|
| `source_type` | TEXT | `'inferred'` | `'inferred'`/`'corroborated'`/`'user_confirmed'` | 佐证分类：显式检索过滤、TUI 分组、梦想家升级策略、冷记忆来源闸门 |
| `confidence` | REAL | `0.5` | 0.0–1.0 | 写入时置信度：检索排序加权、TUI 展示 |

> **`source_type` 与现有 `source` 并存**。`source`（`'explicit'`/`'inferred'`）= 写入口径（谁写的），`source_type` = 佐证分类（是否被佐证/确认）。两者语义不同，不混淆、不合并。

### 3.2 类型与时效

| 字段 | 类型 | 默认 | 取值 | 用途 |
|:---|:---|:---|:---|:---|
| `memory_type` | TEXT | `'semantic'` | `'semantic'`/`'episodic'`/`'preference'`/`'procedure'` | 类型分类：显式检索过滤、TUI 分组、梦想家策略分化、时效策略选择 |
| `ttl_policy` | TEXT | `'none'` | `'none'`/`'fixed'`/`'reconfirm_required'` | 过期后处理策略 |
| `expires_at` | TEXT | `null` | ISO 时间 | 偏好/事件类硬过期时间：显式检索排除、TUI 预警、时效闸门 |

### 3.3 巩固状态

| 字段 | 类型 | 默认 | 取值 | 用途 |
|:---|:---|:---|:---|:---|
| `consolidation_status` | TEXT | `'transient'` | `'transient'`/`'consolidated'`/`'archived'` | 显式检索默认排除 transient、TUI 进度、巩固闸门 |
| `consolidation_at` | TEXT | `null` | ISO 时间 | 梦想家执行巩固的时间 |

### 3.4 温度基础

| 字段 | 类型 | 默认 | 用途 |
|:---|:---|:---|:---|
| `base_activation` | REAL | `0.0` | 显式检索排序、TUI 温度展示、温度闸门 |
| `stability` | REAL | `1.0` | 决定衰减速度、检索排序 |
| `decay_rate` | REAL | `0.5` | 按 `memory_type` 分化 |
| `last_accessed_at` | TEXT (`null`) | — | 命中回写时间 |
| `access_count` | INTEGER | `0` | 命中次数（已存在） |
| `use_history` | TEXT | `'[]'` | 命中回写、温度重算、recall heat 展示（JSON 数组，有上限） |

> **`weight` 与温度体系并存**。现有 `weight`（0.0–1.0）保留做向后兼容兜底：当 `base_activation` 未初始化时，排序回退到 `weight`。温度体系是增强层，不破坏现有检索行为。

---

## 四、生产者 / 消费者映射

| 字段 | 生产者（写） | 消费者（读） |
|:---|:---|:---|
| `source_type`/`confidence` | `memory_fragment_add`（写时）· 梦想家（inferred→corroborated 升级） | 显式检索过滤 · TUI 分组 · 自动召回冷来源闸门 |
| `memory_type` | `memory_fragment_add`（写时） | 显式检索过滤 · TUI 分组 · 梦想家策略分化 |
| `ttl_policy`/`expires_at` | `memory_fragment_add`（写时）· 梦想家（标记过期） | 显式检索排除过期 · TUI 预警 · 时效闸门 |
| `consolidation_status`/`consolidation_at` | 梦想家（transient→consolidated→archived） | 显式检索排除 transient · TUI 进度 · 巩固闸门 |
| `base_activation`/`stability`/`decay_rate` | 梦想家（批量重算）· 显式检索命中回写（增量） | 显式检索排序 · TUI 温度 · 温度闸门 |
| `last_accessed_at`/`access_count`/`use_history` | 显式检索命中回写（核心系统自己写） | 温度重算 · recall heat 展示 |

---

## 五、核心函数（新增到 `index.js`）

### 5.1 `computeActivation(f, now)`
计算有效激活度（确定性，核心系统函数）：

```
effective = base_activation × exp(-decay_rate × (1 - stability) × daysSince(last_accessed_at))
```

- `last_accessed_at` 为空 → 用 `created_at`
- `base_activation` 为 0 且 `weight` 存在 → 回退返回 `weight`（向后兼容）
- 返回 0.0–1.0，用于排序与温度展示

### 5.2 `applyRecall(f, now)`
显式检索命中回写（核心系统自己的写入，不依赖自动召回）：

```
use_history = push(use_history, now).slice(-MAX_HISTORY)   // 有上限，如 20
access_count += 1
last_accessed_at = now
base_activation = min(1.0, base_activation + RECALL_BOOST)  // 命中升温，如 +0.15
```

### 5.3 `backfillDefaults(f)`
懒迁移：加载时补齐缺失字段（默认值），旧碎片自动升级，不丢数据、不破坏现有。

### 5.4 `dreamerRun(config)`
梦想家执行（手动工具 + 会话内周期定时触发）：

1. **巩固流转**：`transient` → 延迟窗口 + 被使用 → `consolidated`（初始化 stability/base_activation）；`transient` + 过期/低价值 → `archived`
2. **温度重算**：批量 `computeActivation` 更新 `base_activation`
3. **类型分化策略**：
   - `preference`：临近过期 → 标 `reconfirm_required` + `expires_at`；过期 → 移冷归档（不删除，等确认）
   - `procedure`：长期未命中 → 归档
   - `episodic`：过期 → 优先归档（保留但不参与默认检索）
   - `semantic`：长期保留、慢衰减
4. 复用现有 `fragment-compactor.js` 的归档通道，保持 compact 行为兼容

---

## 六、P6 自动召回架构（事件驱动定稿）

自动召回是**独立消费者子系统**，默认档位 0=OFF（零开销短路 `if (effort===0) return`），事件驱动、非定时器，绝不写 `event.system`（保 Prompt Cache 字节稳定）。

| 组件 | 职责 |
|:---|:---|
| `AutoRecallEngine` | 纯逻辑：四道闸门过滤 + 排序 + Token 预算截断（只读核心字段） |
| `AutoRecallHooks` | OpenCode 钩子接入：prompt 深检索 → `ctx.session.synthetic`；context 浅检索 → 只改当次 in-flight event |
| `RECALL_PRESETS`（0-6） | 档位→预算/topK/温度下限/相关性下限/冷记忆开关 |
| `recall-runtime.json` | TUI 滑块写档位，钩子 mtime 缓存实时读（跨进程，无重载） |

**四道闸门**（按序）：
1. 巩固：`consolidation_status === 'consolidated'`
2. 时效：`expires_at` 空 或 `> now`
3. 温度：`computeActivation` ∈ 档位允许范围
4. 相关性：`computeRelevance` ≥ 滑块下限（0.55–0.80）
   - 冷记忆特判：温度 < 0.3 时须 `source_type` ∈ {corroborated, user_confirmed} 且滑块冷记忆开关开

**排序**：`相关性×0.5 + 温度×0.3 + 置信度×0.2`，取 topK，逐条累加 Token 达预算（≤5% × 8000 基准）即截断，绝不超发。

**两路径零共享状态**，独立 `try/catch`（fail-open，出错就当没召回，不阻断主对话）。

**关键实现要点**：
- prompt 钩子：深检索（完整预设）→ `ctx.session.synthetic({sessionID, text})` 注入合成用户消息；synthetic 不重跑 prompt 钩子（官方确认）→ 无递归
- context 钩子：浅检索（topK≤2，budget≤2%）→ 只 `event.messages.push` 合成消息，不持久化
- `computeRelevance` 分母用"有效用户词"（排除整句/单字）+ 饱和上限（命中前 4 词即满相关），避免长查询稀释 rel（本机验证：7 词查询候选 0→1）

> 每阶段独立可交付，不破坏现有功能。P1–P3 是核心系统能力（自动召回关闭也生效），P4–P5 增强可观测性，P6 为可选消费者子系统。

---

## 七、归档层贯通（P1 细节）

`fragment_archive` 表需加列（与 fragment 字段一致）：

```sql
ALTER TABLE fragment_archive ADD COLUMN source_type TEXT DEFAULT 'inferred';
ALTER TABLE fragment_archive ADD COLUMN confidence REAL DEFAULT 0.5;
ALTER TABLE fragment_archive ADD COLUMN memory_type TEXT DEFAULT 'semantic';
ALTER TABLE fragment_archive ADD COLUMN ttl_policy TEXT DEFAULT 'none';
ALTER TABLE fragment_archive ADD COLUMN expires_at TEXT;
ALTER TABLE fragment_archive ADD COLUMN consolidation_status TEXT DEFAULT 'transient';
ALTER TABLE fragment_archive ADD COLUMN consolidation_at TEXT;
ALTER TABLE fragment_archive ADD COLUMN base_activation REAL DEFAULT 0.0;
ALTER TABLE fragment_archive ADD COLUMN stability REAL DEFAULT 1.0;
ALTER TABLE fragment_archive ADD COLUMN decay_rate REAL DEFAULT 0.5;
ALTER TABLE fragment_archive ADD COLUMN last_accessed_at TEXT;
ALTER TABLE fragment_archive ADD COLUMN use_history TEXT DEFAULT '[]';
```

需同步更新：
- `fragment-compactor.js` 的 `INSERT` 列清单（归档时带上全部新字段）
- `fragment-restorer.js` 的 `INSERT` 列清单（恢复时写回）
- `fragment-deep-search.js` 读取（`SELECT *` + spread，基本自动，需确认字段名）

---

## 八、自动召回与分类字段（消费者视角）

自动召回是**消费者**，按四道闸门消费字段（只读）：

| 闸门 | 消费字段 | 生产者（核心维护） |
|:---|:---|:---|
| 巩固状态闸门 | `consolidation_status` | 梦想家 |
| 时效闸门 | `expires_at`、`ttl_policy` | 写时设置 + 梦想家标记 |
| 温度闸门 | `base_activation`、`stability`、`decay_rate` | 梦想家重算 + 命中回写 |
| 冷记忆来源闸门 | `source_type` | 写时设置 + 梦想家升级 |

**关键**：字段生产者是核心系统，自动召回只读。自动召回关闭，字段照常维护，无退化。
