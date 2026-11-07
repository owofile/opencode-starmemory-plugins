# StarMenory

<p align="center">
  <img src="docs/StarMenoryLOGO.png" alt="StarMenory" width="120" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="MIT">
  <img src="https://img.shields.io/github/stars/owofile/opencode-starmemory-plugins?style=social" alt="Stars">
  <img src="https://img.shields.io/github/last-commit/owofile/opencode-starmemory-plugins" alt="Last Commit">
</p>

<p align="center"><strong>StarMenory = Star + Memory — 持久化星之记忆</strong></p>

<p align="center">OpenCode 长期记忆插件与技能系统，让 AI 记住你的偏好、规则和项目上下文。</p>



---

<p align="center">
  <img src="docs/自动记录相关记忆.gif" alt="自动记录碎片记忆" width="800"/>
  <br/><em>自动记录碎片记忆</em>
  <br/><br/>
  <img src="docs/手动查询记忆演示.gif" alt="手动查询记忆" width="800"/>
  <br/><em>手动查询记忆</em>
</p>

---

## 记忆架构

StarMenory 采用**分层记忆管理系统**，热数据与冷数据循环流动，确保高效访问与长期持久化。

```
┌─────────────────────────────────────────────────────────────────┐
│                      记忆循环流程                               │
└─────────────────────────────────────────────────────────────────┘

  用户添加记忆
       │
       ▼
  ┌─────────────────┐
  │ fragments.json  │  ◀── 热数据（JSON格式）
  └─────────────────┘
       │
       ▼
  ┌─────────────────┐     ┌──────────────┐
  │ 普通查询 search  │ ──▶ │ 只查JSON热数据 │
  └─────────────────┘     └──────────────┘

  ┌─────────────────────┐     ┌──────────────┐
  │ 深度查询 deep_search │ ──▶ │ JSON不够时查 │
  └─────────────────────┘     │ SQLite归档   │
       │                       └──────────────┘
       ▼                            │
  ┌──────────────┐                   ▼
  │ 自动恢复机制  │ ◀── 找到后自动恢复到JSON
  └──────────────┘
       │
       ▼
  ┌─────────────────┐     ┌──────────────────────┐
  │ 定期整理 compact │ ──▶ │ 冷数据归档到 SQLite    │
  └─────────────────┘     │ (fragment_archive.db) │
                          └──────────────────────┘
```

### 数据分层

| 层级 | 存储位置 | 说明 |
|------|----------|------|
| **热数据** | memory.json | 长期记忆：用户偏好、规则、项目配置 |
| **热数据** | fragments.json | 碎片记忆：经验、习惯、事件（活跃数据） |
| **热数据** | associations_map.json | 同义词映射表 |
| **冷数据** | SQLite (fragment_archive.db) | 归档数据：长期未访问的碎片记忆 |

### 核心工具

#### 记忆管理 (`memory`)

| 工具 | 操作 | 说明 |
|------|------|------|
| `memory` | view | 查看所有记忆配置 |
| `memory` | add | 添加记忆（偏好/规则） |
| `memory` | update | 更新记忆 |
| `memory` | delete | 删除记忆 |
| `memory` | search | 搜索记忆 |

#### 碎片管理 (`memory_fragment_*`)

| 工具 | 参数 | 说明 |
|------|------|------|
| `memory_fragment_add` | - | 添加碎片记忆（支持关键词/分类/层级） |
| `memory_fragment_view` | - | 查看碎片列表（支持分类/层级筛选） |
| `memory_fragment_search` | - | 普通搜索（只查 JSON 热数据） |
| `memory_fragment_update` | - | 更新碎片（内容/权重/层级） |
| `memory_fragment_delete` | - | 删除碎片 |
| `memory_fragment_stats` | - | 查看碎片统计 |
| `memory_fragment_compact` | gentle/auto/aggressive | 整理碎片，归档冷数据到 SQLite |
| `memory_fragment_restore` | list/id/query | 从 SQLite 归档恢复碎片 |
| `memory_fragment_deep_search` | - | 深度搜索（JSON + SQLite，自动恢复） |
| `memory_fragment_archive_status` | - | 查看归档状态和建议 |
| `memory_fragment_diagnosis` | - | 诊断记忆状态，输出配置+统计+饼图+AI建议 |

#### 同义词映射 (`synonym_map_*`)

| 工具 | 操作 | 说明 |
|------|------|------|
| `synonym_map_view` | - | 查看同义词映射表 |
| `synonym_map_add` | - | 添加同义词映射 |
| `synonym_map_update` | - | 更新同义词映射（完全替换） |
| `synonym_map_delete` | - | 删除同义词映射 |

#### SQLite 工具 (`memory_sqlite`)

| 工具 | 操作 | 说明 |
|------|------|------|
| `memory_sqlite` | set/get/delete/list | SQLite key-value 存储工具（测试用） |

#### 说明书 (`memory_manual`)

| 工具 | 参数 | 说明 |
|------|------|------|
| `memory_manual` | keyword | 查询插件说明书（AI 专用） |

### 冷数据策略

- `cold_data_days`：超过 30 天未访问 → 视为冷数据
- `cold_data_age_days`：超过 60 天前创建 → 视为冷数据
- `json_max_count`：JSON 最大碎片数 200（接近时自动归档）

---

## 终端 TUI（v2.2.1）

全新的终端内记忆管理界面，无需外部浏览器：

- 输入 `/memory`（或快捷键 `ctrl+shift+m`）打开全屏管理页，三个视图：
  - **overview 概览**：readout 键值读数 + `████░░░░` 激活度条
  - **mesh 记忆网络**：callout 走线注记 + 同义词关联浏览
  - **list 列表**：ps 式对齐表头，按召回热度分页
- `e` 打开管理菜单：查看全文 / 删除 / 提高权重（原子写 fragments.json）
- 主界面底部 + 侧栏常驻状态 chip（可开关）
- `/memory-settings` 调整各项开关（插槽 / 快捷键 / 打字机动效）
- 动效克制：打字机入场、条形生长、数据变更三档高亮渐退——入场结束即停时钟，零常驻开销

### v2.2.1 诊断与召回历史
- log 系统重设计：memory-plugin.log 统一诊断（分级 + 模块 recall/hook/tui/storage/tool + 事件 + 写前轮转 1MB→.1），logRecallHook 统一入口双写
- /memory 召回 Tab 分栏：左召回设置 + 右召回历史，方向键阅读（↑↓ 选择 / Enter 切换展开 / → 展开 / ← 收起），单行摘要 + 滚动视口丝滑（复用 list Tab 模式）
- 删除 session.panel 召回历史面板（/recall 命令 + RecallHistoryPanel，实测 Esc/× 关闭都不 work）

### v2.2.0 召回可见性
- `composer.top` slot 召回提示卡片：⭐ 注入 N 条 + ▶ 展开看内容 + × 关闭，8s 无交互自动消失
- 自引用循环修复：synthetic 召回消息不再污染 context query 提取（跳过 synthetic + `isRecallBlock` 检测 + 档位6 relMin 0.60）
- context 零污染注入：prompt synthetic 是可靠主通道，context 钩子仅诊断（`injected:false`），无重复召回块
- 动态弹出动画记录为**已知限制**：属性/结构动画在 `composer.top` slot 边界不响应（渲染器边界），卡片稳定全显

### v2.1.1 仪表板打磨
- 仪表板样式：面板边框、HUD 行左右贴边、动态走线分区头、括号激活条 `[████░░]`（三档语义色）、省略号 `…` 截断
- 分区可折叠（overview / mesh / list，本页会话内记忆），`/memory-settings` 新增 `panel_border` 边框开关
- 侧栏状态 chip 改为紧凑一行：`⭐ memory` + `[███░] N/M`（语义色），点击直接进入 `/memory`

---

## 安装

复制以下命令让 AI 自动安装：

```
安装 StarMenory v2.2.1：https://github.com/owofile/opencode-starmemory-plugins/tree/main/v2.2.1
```

---

## 目录结构

```
opencode-starmemory-plugins/
├── v2.2.1/                      # 推荐版本（最新）
│   ├── INSTALL.md
│   ├── memory.json              # 默认配置文件
│   ├── plugins/opencode-memory/
│   │   ├── index.js
│   │   └── tui.tsx              # 终端 TUI 管理界面（v2.2.1）
│   ├── plugins/opencode-memory/external/
│   ├── skills/
│   │   ├── memory-manager/
│   │   └── memory-fragment/
│   ├── associations_map.json
│   └── opencode.json
├── v2.2.0/
├── v2.1.1/
├── v2.1.0/
├── v2.0.0/
├── v1.4.0/
├── v1.3.1/
├── v1.3.0/
├── v1.2.0/
├── v1.1.0/
├── v1.0.0/
├── docs/
│   ├── StarMenoryLOGO.png
│   ├── 自动记录相关记忆.gif
│   └── 手动查询记忆演示.gif
├── README.md
└── README_CN.md
```

---

## License

MIT
