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
| **v1.1.0** | Enhanced, SQLite fragmentation | Random retrieval, long-term memory management |

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
│   ├── plugins/opencode-memory/ # Plugin (with src and dist)
│   └── skills/memory-fragment/  # Skill
│
├── memory.json                   # Memory template
├── StarMenoryLOGO.png           # LOGO
└── README.md
```

---

## Features by Version

### v1.0.0 (StarMenory)

| Feature | Description |
|---------|-------------|
| Plugin + Skill | Complete solution with both Plugin and Skill |
| Independent Storage | Own memory.json, not dependent on OpenCode DB |
| Auto Injection | Automatically inject memory into AI context via system.transform |
| Keyword Detection | Detect "remember", "别忘" etc. and auto-prompt AI |
| Full CRUD | View, Add, Update, Delete, Search memory |

### v1.1.0 (opencode-memory)

| Feature | Description |
|---------|-------------|
| SQLite Storage | Fragment-based storage with temperature-controlled retrieval |
| Memory Fragment Tools | 6 dedicated fragment tools |
| Auto Association | Associations auto-extracted from content |
| Weight & Layer | Fragment importance tracking |
| Auto Compact | Automatic cleanup of unused fragments |

---

## Quick Start

### Using v1.0.0

```bash
# Clone the repo
git clone https://github.com/owofile/opencode-starmemory-plugins
cd opencode-starmemory-plugins

# Install Skill
mkdir -p ~/.agents/skills/memory-manager
cp -r v1.0.0/skills/memory-manager/* ~/.agents/skills/memory-manager/

# Install Plugin
mkdir -p ~/.config/opencode/plugins/StarMenory
cp -r v1.0.0/plugins/StarMenory/* ~/.config/opencode/plugins/StarMenory/

# Initialize memory.json
cp memory.json ~/.config/opencode/memory.json
```

### Using v1.1.0

```bash
# Clone the repo
git clone https://github.com/owofile/opencode-starmemory-plugins
cd opencode-starmemory-plugins

# Install Plugin
pluginDir=~/.config/opencode/plugins/opencode-memory
mkdir -p $pluginDir/src $pluginDir/dist
cp -r v1.1.0/plugins/opencode-memory/* $pluginDir/

# Install Skill
mkdir -p ~/.agents/skills/memory-fragment
cp -r v1.1.0/skills/memory-fragment/* ~/.agents/skills/memory-fragment/

# Install dependencies
cd $pluginDir && npm install
```

---

## v1.1.0 Tool List

| Tool | Description |
|------|-------------|
| `memory` | Original memory-manager call |
| `memory_fragment_add` | Add fragment |
| `memory_fragment_search` | Search fragments (with temperature randomness) |
| `memory_fragment_stats` | View statistics |
| `memory_fragment_view` | View fragment list |
| `memory_fragment_delete` | Delete fragment |
| `memory_fragment_compact` | Compact database |

### Temperature Guide

| Range | Behavior |
|-------|----------|
| 0.0-0.3 | High determinism, only high-weight fragments |
| 0.4-0.6 | Balanced mode |
| 0.7-1.0 | High randomness, may return low-weight fragments |

---

## License

MIT
