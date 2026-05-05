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

## AI Auto-Install

Give this repository URL to any AI and it will auto-install:

```
Please install this OpenCode plugin and Skill: https://github.com/owofile/opencode-starmemory-plugins
```

The AI will automatically:
1. Clone the repo to temp directory
2. Copy Skill to `~/.agents/skills/memory-manager/`
3. Copy Plugin to `~/.config/opencode/plugins/StarMenory/`
4. Configure `opencode.json`
5. Initialize `memory.json` to `~/.config/opencode/`
6. Verify installation

## Features

| Feature | Description |
|---------|-------------|
| Plugin + Skill | Complete solution with both Plugin and Skill |
| Independent Storage | Own memory.json, not dependent on OpenCode DB |
| Auto Injection | Automatically inject memory into AI context via system.transform |
| Keyword Detection | Detect "remember", "别忘" etc. and auto-prompt AI |
| Full CRUD | View, Add, Update, Delete, Search memory |

## Architecture

```
opencode-starmemory-plugins/
├── plugins/StarMenory/
│   └── index.js              # Plugin Entry
├── skills/memory-manager/
│   ├── SKILL.md              # Skill Definition
│   └── memory-manager.js     # CLI Script
├── memory.json               # Memory Template
├── StarMenoryLOGO.png        # LOGO
└── README_EN.md              # English README
```

## Manual Install

```bash
# 1. Clone the repo
git clone https://github.com/owofile/opencode-starmemory-plugins
cd opencode-starmemory-plugins

# 2. Install Skill
mkdir -p ~/.agents/skills/memory-manager
cp -r skills/memory-manager/* ~/.agents/skills/memory-manager/

# 3. Install Plugin
mkdir -p ~/.config/opencode/plugins/StarMenory
cp -r plugins/StarMenory/* ~/.config/opencode/plugins/StarMenory/

# 4. Configure opencode.json
echo '{"plugin":["~/.config/opencode/plugins/StarMenory/index.js"]}' >> ~/.config/opencode/opencode.json

# 5. Initialize memory.json
cp memory.json ~/.config/opencode/memory.json
```

## Usage

### Auto Memory

When your message contains these keywords, the system will auto-prompt AI to save memory:

| English | Chinese |
|---------|---------|
| remember, save this | 记住、别忘 |
| always use | 一直用、总是用 |
| preference | 偏好 |

### Manual memory Tool

```bash
# View all memory
memory action=view

# View user preferences
memory action=view category=user

# Add user preference
memory action=add category=user.preferences key=editor value=VSCode

# Add strict rule
memory action=add category=strict.rules value="Confirm before execution"

# Search memory
memory action=search query=download
```

## Memory Structure

```json
{
  "version": 2,
  "user": {
    "preferences": {
      "name": "Username",
      "language": "English"
    }
  },
  "strict": {
    "forbiddenCommands": [
      {
        "id": "no-rf-root",
        "pattern": "rm\\s+-rf\\s+/",
        "description": "Prohibit recursive deletion of root directory",
        "severity": "critical"
      }
    ],
    "rules": [
      "Confirm path before executing delete operations"
    ]
  },
  "projects": {}
}
```

## Comparison

| Feature | StarMenory | opencode-memory (carson2222) |
|---------|------------|------------------------------|
| Type | Plugin + Skill | Skill Only |
| Write | ✅ Full CRUD | ❌ Read-only |
| Storage | ✅ memory.json | ❌ OpenCode DB |
| Auto Injection | ✅ system.transform | ❌ None |
| Keyword Detection | ✅ chat.message | ❌ None |

## License

MIT