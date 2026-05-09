# StarMenory

[English](./README_EN.md) | [中文](./README.md)

<p align="center">
  <img src="StarMenoryLOGO.png" alt="StarMenory" width="200" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="MIT">
  <img src="https://img.shields.io/github/stars/owofile/opencode-starmemory-plugins?style=social" alt="Stars">
  <img src="https://img.shields.io/github/forks/owofile/opencode-starmemory-plugins?style=social" alt="Forks">
  <img src="https://img.shields.io/github/last-commit/owofile/opencode-starmemory-plugins" alt="Last Commit">
</p>

**StarMenory** = Star + Memory — Persistent Stellar Memory

OpenCode Long-term Memory Plugin & Skill System. Let AI remember your preferences, rules, and project context.

---

## Versions

This repo uses versioned folder structure. Each version is self-contained.

| Version | Description | Recommended For |
|---------|-------------|-----------------|
| **v1.0.0** | Original version, JSON storage | Stability, simple needs |
| **v1.1.0** | Enhanced, SQLite fragmentation | Random retrieval, long-term memory |
| **v1.2.0** | JSON+Synonym Map | Full features, ready to use |
| **v1.3.0** | Optimized, auto-map+fix search | **Recommended latest** |

---

## AI Auto-Install

### Install v1.0.0
```
Please install v1.0.0 of StarMenory: https://github.com/owofile/opencode-starmemory-plugins/tree/main/v1.0.0
```

### Install v1.1.0
```
Please install v1.1.0 of opencode-memory: https://github.com/owofile/opencode-starmemory-plugins/tree/main/v1.1.0
```

### Install v1.2.0
```
Please install v1.2.0 of opencode-memory: https://github.com/owofile/opencode-starmemory-plugins/tree/main/v1.2.0
```

### Install v1.3.0
```
Please install v1.3.0 of opencode-memory: https://github.com/owofile/opencode-starmemory-plugins/tree/main/v1.3.0
```

---

## Directory Structure

```
opencode-starmemory-plugins/
├── v1.0.0/                      # v1.0.0 Original version
│   ├── INSTALL.md               # Installation guide
│   ├── plugins/StarMenory/      # Plugin
│   └── skills/memory-manager/   # Skill
│
├── v1.1.0/                      # v1.1.0 Enhanced version
│   ├── INSTALL.md               # Installation guide
│   ├── plugins/opencode-memory/ # Plugin
│   └── skills/memory-fragment/  # Skill
│
├── v1.2.0/                      # v1.2.0 version
│   ├── INSTALL.md               # Installation guide
│   ├── plugins/opencode-memory/ # Plugin
│   ├── skills/
│   │   ├── memory-manager/      # Long-term memory skill
│   │   └── memory-fragment/    # Fragment memory skill
│   └── associations_map.json    # Synonym map example
│
├── v1.3.0/                      # v1.3.0 Optimized version (Recommended)
│   ├── INSTALL.md               # Installation guide
│   ├── plugins/opencode-memory/ # Plugin
│   ├── skills/
│   │   ├── memory-manager/      # Long-term memory skill
│   │   └── memory-fragment/    # Fragment memory skill
│   ├── associations_map.json    # Synonym map (empty template)
│   └── opencode.json           # Config example
│
├── memory.json                   # Memory template
├── StarMenoryLOGO.png           # LOGO
└── README.md
```

---

## v1.3.0 Core Features

### Auto Synonym Mapping (New)

Automatically analyze and add Chinese-English keyword pairs to synonym map when adding fragments.

### Fixed Query Word Splitting

Fixed expandQuery function to support multi-word search (e.g. "anime hobby like").

### Synonym Mapping System

```json
{
  "SAO": ["刀剑神域", "Sword Art Online"],
  "刀剑神域": ["SAO", "动漫", "动画"],
  "动漫": ["动画", "番剧", "二次元"]
}
```

- **On Add**: Auto-extend synonyms to associations
- **On Search**: Auto-extend query to match more fragments

### Smart Association Extraction

```javascript
// Add "我喜欢SAO动漫" (I like SAO anime)
// Auto extract → associations: ["喜欢", "SAO", "刀剑神域", "动漫", ...]
```

### Complete Tool Chain

| Category | Tools |
|----------|-------|
| Long-term Memory | `memory` (view/add/update/delete/search) |
| Fragment Memory | `memory_fragment_add` `search` `view` `update` `delete` `stats` `compact` |
| Synonym Map | `synonym_map_view` `add` `update` `delete` |

---

## v1.2.0 Quick Install

```bash
# Clone the repo
git clone https://github.com/owofile/opencode-starmemory-plugins
cd opencode-starmemory-plugins

# Copy Plugin
pluginDir=~/.config/opencode/plugins/opencode-memory
mkdir -p $pluginDir
cp -r v1.2.0/plugins/opencode-memory/* $pluginDir/

# Copy Skills
cp -r v1.2.0/skills/* ~/.agents/skills/

# Configure opencode.json
echo '{"$schema":"https://opencode.ai/config.json","plugin":["file:///C:/Users/<username>/.config/opencode/plugins/opencode-memory/index.js"]}' > ~/.config/opencode/opencode.json
```

---

## Feature Comparison

| Feature | v1.0.0 | v1.1.0 | v1.2.0 | v1.3.0 |
|---------|--------|--------|--------|--------|
| Long-term Memory | ✅ | ✅ | ✅ | ✅ |
| Fragment Memory | ❌ | ✅ | ✅ | ✅ |
| Synonym Mapping | ❌ | ✅ | ✅ | ✅ |
| Auto Association | ❌ | ✅ | ✅ | ✅ |
| Temperature Retrieval | ❌ | ✅ | ✅ | ✅ |
| Weight/Layer Tracking | ❌ | ✅ | ✅ | ✅ |
| Auto Compact | ❌ | ✅ | ✅ | ✅ |
| Delete Preferences | ❌ | ❌ | ✅ | ✅ |
| Auto Add Synonym Map | ❌ | ❌ | ❌ | ✅ |
| Multi-word Search | ❌ | ❌ | ❌ | ✅ |

---

## License

MIT