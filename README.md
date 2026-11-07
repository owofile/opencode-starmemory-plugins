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

StarMenory uses a **layered memory management system** with hot and cold data circulating to ensure efficient access and long-term persistence.

```
┌─────────────────────────────────────────────────────────────────┐
│                    Memory Cycle Flow                             │
└─────────────────────────────────────────────────────────────────┘

  User adds memory
        │
        ▼
  ┌─────────────────┐
  │ fragments.json  │  ◀── Hot data (JSON format)
  └─────────────────┘
        │
        ▼
  ┌─────────────────┐     ┌──────────────┐
  │ Normal search   │ ──▶ │ JSON only    │
  └─────────────────┘     └──────────────┘

  ┌─────────────────────┐     ┌──────────────┐
  │ Deep search         │ ──▶ │ JSON不够时查 │
  └─────────────────────┘     │ SQLite archive│
        │                       └──────────────┘
        ▼                            │
  ┌──────────────┐                   ▼
  │ Auto restore │ ◀── Restore found items to JSON
  └──────────────┘
        │
        ▼
  ┌─────────────────┐     ┌──────────────────────┐
  │ Periodic compact │ ──▶ │ Archive cold data     │
  └─────────────────┘     │ to SQLite            │
                          └──────────────────────┘
```

### Data Layers

| Layer | Storage | Description |
|-------|---------|-------------|
| **Hot** | memory.json | Long-term memory: user preferences, rules, project config |
| **Hot** | fragments.json | Fragment memory: experiences, habits, events (active data) |
| **Hot** | associations_map.json | Synonym mapping table |
| **Cold** | SQLite (fragment_archive.db) | Archived data: long-unaccessed fragment memories |

### Core Tools

#### Memory Management (`memory`)

| Tool | Action | Description |
|------|--------|-------------|
| `memory` | view | View all memory configurations |
| `memory` | add | Add memory (preferences/rules) |
| `memory` | update | Update memory |
| `memory` | delete | Delete memory |
| `memory` | search | Search memory |

#### Fragment Management (`memory_fragment_*`)

| Tool | Action | Description |
|------|--------|-------------|
| `memory_fragment_add` | - | Add fragment memory (keywords/category/layer) |
| `memory_fragment_view` | - | View fragment list (filter by category/layer) |
| `memory_fragment_search` | - | Normal search (JSON hot data only) |
| `memory_fragment_update` | - | Update fragment (content/weight/layer) |
| `memory_fragment_delete` | - | Delete fragment |
| `memory_fragment_stats` | - | View fragment statistics |
| `memory_fragment_compact` | gentle/auto/aggressive | Compact fragments, archive cold data to SQLite |
| `memory_fragment_restore` | list/id/query | Restore fragments from SQLite archive |
| `memory_fragment_deep_search` | - | Deep search (JSON + SQLite, auto restore) |
| `memory_fragment_archive_status` | - | View archive status and suggestions |
| `memory_fragment_diagnosis` | - | Diagnose memory status: config+stats+pie chart+AI suggestions |

#### Synonym Map (`synonym_map_*`)

| Tool | Action | Description |
|------|--------|-------------|
| `synonym_map_view` | - | View synonym mapping table |
| `synonym_map_add` | - | Add synonym mapping |
| `synonym_map_update` | - | Update synonym mapping (replace all) |
| `synonym_map_delete` | - | Delete synonym mapping |

#### SQLite Tool (`memory_sqlite`)

| Tool | Action | Description |
|------|--------|-------------|
| `memory_sqlite` | set/get/delete/list | SQLite key-value storage tool (for testing) |

#### Manual (`memory_manual`)

| Tool | Action | Description |
|------|--------|-------------|
| `memory_manual` | keyword | Query plugin manual (AI exclusive) |

### Cold Data Policy

- `cold_data_days`: Over 30 days unaccessed → considered cold data
- `cold_data_age_days`: Over 60 days since creation → considered cold data
- `json_max_count`: Max 200 fragments in JSON (auto archive when approaching limit)

---

## Terminal TUI (v2.2.1)

An in-terminal memory dashboard, no external browser needed:

- `/memory` (or `ctrl+shift+m`) opens a fullscreen management page with three views:
  - **overview** — readout-style key/value stats with activation bars `████░░░░`
  - **mesh** — callout-ruled cluster headings + synonym association browsing
  - **list** — `ps`-style aligned table, paged by recall heat
- `e` opens the management menu: view full text / delete / raise weight (atomic JSON writes)
- Resident status chips in the footer & sidebar (toggleable)
- `/memory-settings` for per-feature toggles (slots, hotkey, typewriter intro)
- Restrained motion: typewriter entrance, growing bars, three-tier fade on data change — the clock stops after the intro, zero idle overhead

### v2.2.1 diagnostics & recall history
- Log system redesign: `memory-plugin.log` unified diagnostics (levels + module recall/hook/tui/storage/tool + events + pre-write rotation 1MB→.1), `logRecallHook` unified dual-write entry
- `/memory` recall Tab split-pane: left recall settings + right recall history, arrow-key reading (↑↓ select / Enter toggle / → expand / ← collapse), one-line summary + scroll viewport (smooth paging, reusing list Tab pattern)
- Removed `session.panel` recall history panel (`/recall` command + RecallHistoryPanel, Esc/× close didn't work)

### v2.2.0 recall visibility
- Recall hint card in the `composer.top` slot: ⭐ N items injected + ▶ expand to view content + × dismiss, auto-hides after 8s without interaction
- Self-reference loop fix: synthetic recall messages no longer pollute context query extraction (skip synthetic + `isRecallBlock` detection + tier-6 relMin 0.60)
- Context zero-pollution injection: prompt synthetic is the reliable primary channel, context hook is diagnostic-only (`injected:false`), no duplicate recall blocks
- Dynamic pop animation documented as **known limitation**: property/structural animations don't respond in the `composer.top` slot boundary (renderer edge), card stays statically visible

### v2.1.1 dashboard polish
- Dashboard styling: panel borders, edge-aligned HUD rows, dynamic-ruled section headers, bracket activation bars `[████░░]` in three-tier semantic colors, ellipsis truncation `…`
- Collapsible dashboard sections (overview / mesh / list) per-session; `panel_border` border toggle added in `/memory-settings`
- Sidebar status chip redesigned to a compact one-liner: `⭐ memory` + `[███░] N/M` in semantic color, click to jump into `/memory`

---

## Installation

Copy and send this to AI for automatic installation:

```
Install StarMenory v2.2.1: https://github.com/owofile/opencode-starmemory-plugins/tree/main/v2.2.1
```

---

## Directory Structure

```
opencode-starmemory-plugins/
├── v2.2.1/                      # Recommended version (Latest)
│   ├── INSTALL.md
│   ├── memory.json              # Default configuration file
│   ├── plugins/opencode-memory/
│   │   ├── index.js
│   │   └── tui.tsx              # Terminal TUI dashboard (v2.2.1)
│   ├── plugins/opencode-memory/external/
│   ├── skills/
│   │   ├── memory-manager/
│   │   └── memory-fragment/
│   ├── associations_map.json
│   └── opencode.json
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