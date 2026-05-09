# StarMenory

[English](./README_EN.md) | 中文

<p align="center">
  <img src="StarMenoryLOGO.png" alt="StarMenory" width="200" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="MIT">
  <img src="https://img.shields.io/github/stars/owofile/opencode-starmemory-plugins?style=social" alt="Stars">
  <img src="https://img.shields.io/github/forks/owofile/opencode-starmemory-plugins?style=social" alt="Forks">
  <img src="https://img.shields.io/github/last-commit/owofile/opencode-starmemory-plugins" alt="Last Commit">
</p>

**StarMenory** = Star + Memory — 持久化星之记忆

OpenCode 长期记忆插件与技能系统，让 AI 记住你的偏好、规则和项目上下文。

---

## 版本说明

本仓库采用版本化文件夹结构，每个版本独立完整。

| 版本 | 说明 | 推荐场景 |
|------|------|----------|
| **v1.0.0** | 原始版本，JSON 存储 | 稳定优先，简单需求 |
| **v1.1.0** | 增强版，SQLite 碎片化 | 需要随机检索，长期记忆管理 |

---

## AI 自动安装 | AI Auto-Install

### v1.0.0 安装
```
请帮我安装 v1.0.0 版本的 StarMenory：https://github.com/owofile/opencode-starmemory-plugins/tree/main/v1.0.0
```

### v1.1.0 安装
```
请帮我安装 v1.1.0 版本的 opencode-memory：https://github.com/owofile/opencode-starmemory-plugins/tree/main/v1.1.0
```

---

## 目录结构

```
opencode-starmemory-plugins/
├── v1.0.0/                      # v1.0.0 原始版本
│   ├── INSTALL.md               # 安装指南
│   ├── plugins/StarMenory/      # 插件
│   └── skills/memory-manager/   # 技能
│
├── v1.1.0/                      # v1.1.0 增强版本
│   ├── INSTALL.md               # 安装指南
│   ├── plugins/opencode-memory/ # 插件（含 src 和 dist）
│   └── skills/memory-fragment/  # 技能
│
├── memory.json                   # 记忆模板
├── StarMenoryLOGO.png           # LOGO
└── README.md
```

---

## 各版本功能

### v1.0.0 (StarMenory)

| Feature | Description | 功能 |
|---------|-------------|------|
| Plugin + Skill | Complete solution with both Plugin and Skill | 同时提供 Plugin 和 Skill，完整解决方案 |
| Independent Storage | Own memory.json, not dependent on OpenCode DB | 独立存储，不依赖 OpenCode 内置数据库 |
| Auto Injection | Automatically inject memory into AI context via system.transform | 通过 `system.transform` 自动将记忆注入到 AI 上下文 |
| Keyword Detection | Detect "remember", "别忘" etc. and auto-prompt AI | 检测关键词自动提醒 AI 保存记忆 |
| Full CRUD | View, Add, Update, Delete, Search memory | 完整的增删改查功能 |

### v1.1.0 (opencode-memory)

| Feature | Description | 功能 |
|---------|-------------|------|
| SQLite Storage | Fragment-based storage with temperature-controlled retrieval | SQLite 碎片化存储，温度控制随机检索 |
| Memory Fragment Tools | 6 dedicated fragment tools | 6 个专用碎片工具 |
| Auto Association | Associations auto-extracted from content | 关联自动从内容提取 |
| Weight & Layer | Fragment importance tracking | 碎片权重和层级追踪 |
| Auto Compact | Automatic cleanup of unused fragments | 自动整理长期未用碎片 |

---

## 快速开始

### 使用 v1.0.0

```powershell
# 克隆仓库
git clone https://github.com/owofile/opencode-starmemory-plugins
cd opencode-starmemory-plugins

# 安装 Skill
New-Item -ItemType Directory -Path "$env:USERPROFILE\.agents\skills\memory-manager" -Force
Copy-Item -Path "v1.0.0\skills\memory-manager\*" -Destination "$env:USERPROFILE\.agents\skills\memory-manager\"

# 安装 Plugin
New-Item -ItemType Directory -Path "$env:USERPROFILE\.config\opencode\plugins\StarMenory" -Force
Copy-Item -Path "v1.0.0\plugins\StarMenory\*" -Destination "$env:USERPROFILE\.config\opencode\plugins\StarMenory\"

# 初始化 memory.json
Copy-Item -Path "memory.json" -Destination "$env:USERPROFILE\.config\opencode\memory.json"
```

### 使用 v1.1.0

```powershell
# 克隆仓库
git clone https://github.com/owofile/opencode-starmemory-plugins
cd opencode-starmemory-plugins

# 安装 Plugin
$pluginDir = "$env:USERPROFILE\.config\opencode\plugins\opencode-memory"
New-Item -ItemType Directory -Path "$pluginDir\src","$pluginDir\dist" -Force
Copy-Item -Path "v1.1.0\plugins\opencode-memory\*" -Destination "$pluginDir\"

# 安装 Skill
New-Item -ItemType Directory -Path "$env:USERPROFILE\.agents\skills\memory-fragment" -Force
Copy-Item -Path "v1.1.0\skills\memory-fragment\*" -Destination "$env:USERPROFILE\.agents\skills\memory-fragment\"

# 安装依赖
Set-Location $pluginDir; npm install
```

---

## v1.1.0 工具列表

| 工具 | 说明 |
|------|------|
| `memory` | 原有 memory-manager 调用 |
| `memory_fragment_add` | 添加碎片 |
| `memory_fragment_search` | 搜索碎片（带温度随机性）|
| `memory_fragment_stats` | 查看统计 |
| `memory_fragment_view` | 查看碎片列表 |
| `memory_fragment_delete` | 删除碎片 |
| `memory_fragment_compact` | 整理数据库 |

### 温度说明 (Temperature)

| 范围 | 行为 |
|------|------|
| 0.0-0.3 | 确定性高，只返回高权重碎片 |
| 0.4-0.6 | 平衡模式 |
| 0.7-1.0 | 随机性高，可能返回低权重碎片 |

---

## License

MIT
