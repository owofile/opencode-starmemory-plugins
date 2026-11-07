<p align="center">
  <img src="png/image.png" alt="StarMemory" width="100%" />
</p>

# StarMemory

**StarMemory** — a persistent, layered long-term memory plugin & skill system for OpenCode. It keeps what your AI learns about you — preferences, rules, project context — in a system that never forgets, and surfaces the right memory when it matters.

<p>
  <a href="https://github.com/owofile/opencode-starmemory-plugins/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License" /></a>
  <img src="https://img.shields.io/github/stars/owofile/opencode-starmemory-plugins?style=social" alt="Stars" />
  <img src="https://img.shields.io/github/last-commit/owofile/opencode-starmemory-plugins" alt="Last Commit" />
</p>

> **Memory should be earned, not assumed.** StarMemory doesn't just store facts — it tracks how much each one is worth. Repeatedly used memories gain trust automatically; unused ones cool off and archive, but never vanish. Deep search brings them back.

---

## Installation

Copy and send this to AI for automatic installation:

```
Install StarMemory v2.2.1: https://github.com/owofile/opencode-starmemory-plugins/tree/main/v2.2.1
```

---

## Features

**Never forgets, never pollutes.**

- **Layered hot/cold circulation** — active memories live in `fragments.json`; long-unused ones archive to SQLite and auto-restore on deep search. Nothing silently disappears.
- **Trust that compounds** — every memory carries `source_type` / `confidence` / `memory_type`. Repeated recall auto-promotes it to *corroborated* (evidence accumulation); you can mark any memory *confirmed* in the TUI.
- **Recall you control** — an effort slider (0–6) tunes how aggressively relevant memories are injected into context, ranked by a source-weighted score with content dedup. Low = minimal interference, high = maximum coverage.
- **Fully observable** — a terminal TUI dashboard (`/memory`) shows stats, lists, recall history and rules; unified diagnostics in `memory-plugin.log`; every recall decision is logged.
- **Safe by design** — export/import backup, category normalization, hard expiry policies, and a clear producer/consumer split (core system owns fields, recall only reads).

---

## Memory Architecture

Hot data circulates; cold data archives. Nothing is dropped — deep search brings archived memories back.

| Layer | Storage | Description |
|-------|---------|-------------|
| **Hot** | `memory.json` | Long-term: user preferences, rules, project config |
| **Hot** | `fragments.json` | Fragment memory: experiences, habits, events (active) |
| **Hot** | `associations_map.json` | Synonym mapping table |
| **Cold** | `fragment_archive.db` | Archived: long-unaccessed fragments (SQLite) |

**Cold policy** — 30 days unaccessed → cold · 60 days since creation → cold · max 200 fragments in JSON (auto-archive near limit).

---

## Tools

**Memory** (`memory`) — `view` · `add` · `update` · `delete` · `search`

**Fragment** (`memory_fragment_*`) — `add` · `view` · `search` · `update` · `delete` · `stats` · `compact` (gentle/auto/aggressive) · `restore` · `deep_search` · `archive_status` · `diagnosis` · `dream`

**Recall** (`memory_recall_*`) — `set` (effort 0–6) · `enable` · `status` · `preview`

**Synonym** (`synonym_map_*`) — `view` · `add` · `update` · `delete`

**Backup & misc** — `export` · `import` · `sqlite` (test) · `manual`

---

## Terminal TUI

- `/memory` (or `ctrl+shift+m`) — fullscreen dashboard: **overview** (stats + activation bars), **list** (paged table + category filter), **recall** (settings + history), **AGENTS** (rules)
- `e` — management menu: view full text / delete / raise weight / **mark confirmed**
- Recall hint card in `composer.top`: N injected · expand to view · dismiss, auto-hides
- `/memory-settings` — per-feature toggles (slots, hotkey)
- v2.2.x diagnostics — unified `memory-plugin.log`, recall history split-pane

---

## Installation

Copy and send this to AI for automatic installation:

```
Install StarMemory v2.2.1: https://github.com/owofile/opencode-starmemory-plugins/tree/main/v2.2.1
```

---

## Project Structure

```
opencode-starmemory-plugins/
├── v2.2.1/                      # Latest
│   ├── plugins/opencode-memory/
│   │   ├── index.js             # Core: tools + recall engine
│   │   ├── tui.tsx              # Terminal TUI dashboard
│   │   └── external/            # compactor / restorer / deep-search / sqlite
│   ├── skills/                  # memory-manager / memory-fragment
│   └── opencode.json
├── docs/                        # Design docs + media
├── png/image.png                # Banner
└── README.md
```

---

## License

MIT
