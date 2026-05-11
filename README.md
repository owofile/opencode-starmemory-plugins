# StarMenory

<p align="center">
  <img src="docs/StarMenoryLOGO.png" alt="StarMenory" width="120" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="MIT">
  <img src="https://img.shields.io/github/stars/owofile/opencode-starmemory-plugins?style=social" alt="Stars">
  <img src="https://img.shields.io/github/last-commit/owofile/opencode-starmemory-plugins" alt="Last Commit">
</p>

<p align="center"><strong>StarMenory = Star + Memory — Persistent Stellar Memory</strong></p>

<p align="center">OpenCode Long-term Memory Plugin & Skill System. Let AI remember your preferences, rules, and project context.</p>



---

<p align="center">
  <img src="docs/自动记录相关记忆.gif" alt="Auto record fragment memory" width="800"/>
  <br/><em>Auto record fragment memory</em>
  <br/><br/>
  <img src="docs/手动查询记忆演示.gif" alt="Manual query memory" width="800"/>
  <br/><em>Manual query memory</em>
</p>

---

## Memory Architecture

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

### Data Layers

| Layer | Storage | Description |
|-------|---------|-------------|
| **Hot** | memory.json | 长期记忆：用户偏好、规则、项目配置 |
| **Hot** | fragments.json | 碎片记忆：经验、习惯、事件（活跃数据） |
| **Hot** | associations_map.json | 同义词映射表 |
| **Cold** | SQLite (fragment_archive.db) | 归档数据：长期未访问的碎片记忆 |

### Core Tools

#### Memory Management (`memory`)

| Tool | Action | Description |
|------|--------|-------------|
| `memory` | view | 查看所有记忆配置 |
| `memory` | add | 添加记忆（偏好/规则） |
| `memory` | update | 更新记忆 |
| `memory` | delete | 删除记忆 |
| `memory` | search | 搜索记忆 |

#### Fragment Management (`memory_fragment_*`)

| Tool | Action | Description |
|------|--------|-------------|
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

#### Synonym Map (`synonym_map_*`)

| Tool | Action | Description |
|------|--------|-------------|
| `synonym_map_view` | - | 查看同义词映射表 |
| `synonym_map_add` | - | 添加同义词映射 |
| `synonym_map_update` | - | 更新同义词映射（完全替换） |
| `synonym_map_delete` | - | 删除同义词映射 |

#### SQLite Tool (`memory_sqlite`)

| Tool | Action | Description |
|------|--------|-------------|
| `memory_sqlite` | set/get/delete/list | SQLite key-value 存储工具（测试用） |

#### Manual (`memory_manual`)

| Tool | Action | Description |
|------|--------|-------------|
| `memory_manual` | keyword | 查询插件说明书（AI 专用） |

### Cold Data Policy

- `cold_data_days`: 超过 30 天未访问 → 视为冷数据
- `cold_data_age_days`: 超过 60 天前创建 → 视为冷数据
- `json_max_count`: JSON 最大碎片数 200（接近时自动归档）

---

## Installation

Copy and send this to AI for automatic installation:

```
Install StarMenory v1.3.1: https://github.com/owofile/opencode-starmemory-plugins/tree/main/v1.3.1
```

---

## Directory Structure

```
opencode-starmemory-plugins/
├── v1.3.1/                      # Recommended version (Latest)
│   ├── INSTALL.md
│   ├── memory.json              # 默认配置文件
│   ├── plugins/opencode-memory/
│   ├── skills/
│   │   ├── memory-manager/
│   │   └── memory-fragment/
│   ├── associations_map.json
│   └── opencode.json
├── v1.3.0/
├── v1.2.0/
├── v1.1.0/
├── v1.0.0/
├── docs/
│   ├── StarMenoryLOGO.png
│   ├── 自动记录相关记忆.gif
│   └── 手动查询记忆演示.gif
└── README.md
```

---

## License

MIT