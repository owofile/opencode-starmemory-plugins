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
| **v1.2.0** | 最终版，JSON碎片+同义词映射 | 完整功能，开箱即用 |

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

### v1.2.0 安装
```
请帮我安装 v1.2.0 版本的 opencode-memory：https://github.com/owofile/opencode-starmemory-plugins/tree/main/v1.2.0
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
│   ├── plugins/opencode-memory/ # 插件
│   └── skills/memory-fragment/  # 技能
│
├── v1.2.0/                      # v1.2.0 最终版本
│   ├── INSTALL.md               # 安装指南
│   ├── plugins/opencode-memory/ # 插件
│   ├── skills/
│   │   ├── memory-manager/      # 长期记忆技能
│   │   └── memory-fragment/    # 碎片记忆技能
│   └── associations_map.json    # 同义词映射示例
│
├── memory.json                   # 记忆模板
├── StarMenoryLOGO.png           # LOGO
└── README.md
```

---

## v1.2.0 核心特性

### 同义词映射系统

```json
{
  "SAO": ["刀剑神域", "Sword Art Online"],
  "刀剑神域": ["SAO", "动漫", "动画"],
  "动漫": ["动画", "番剧", "二次元"]
}
```

- **添加时**：自动扩展同义词到 associations
- **查询时**：自动扩展查询词匹配更多碎片

### 智能关联词提取

```javascript
// 添加 "我喜欢SAO动漫"
// 自动提取 → associations: ["喜欢", "SAO", "刀剑神域", "动漫", ...]
```

### 完整工具链

| 分类 | 工具 |
|------|------|
| 长期记忆 | `memory` (view/add/update/delete/search) |
| 碎片记忆 | `memory_fragment_add` `search` `view` `update` `delete` `stats` `compact` |
| 同义词 | `synonym_map_view` `add` `update` `delete` |

---

## v1.2.0 快速安装

```powershell
# 克隆仓库
git clone https://github.com/owofile/opencode-starmemory-plugins
cd opencode-starmemory-plugins

# 复制插件
$pluginDir = "$env:USERPROFILE\.config\opencode\plugins\opencode-memory"
New-Item -ItemType Directory -Path $pluginDir -Force
Copy-Item -Path "v1.2.0\plugins\opencode-memory\*" -Destination $pluginDir -Recurse

# 复制 Skill
Copy-Item -Path "v1.2.0\skills\*" -Destination "$env:USERPROFILE\.agents\skills\" -Recurse

# 配置 opencode.json
@'
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["file:///C:/Users/<用户名>/.config/opencode/plugins/opencode-memory/index.js"]
}
'@ | Out-File -FilePath "$env:USERPROFILE\.config\opencode\opencode.json" -Encoding utf8
```

---

## 各版本功能对比

| 功能 | v1.0.0 | v1.1.0 | v1.2.0 |
|------|--------|--------|--------|
| 长期记忆管理 | ✅ | ✅ | ✅ |
| 碎片记忆 | ❌ | ✅ | ✅ |
| 同义词映射 | ❌ | ✅ | ✅ |
| 自动提取关联词 | ❌ | ✅ | ✅ |
| 温度随机检索 | ❌ | ✅ | ✅ |
| 权重/层级追踪 | ❌ | ✅ | ✅ |
| 自动整理碎片 | ❌ | ✅ | ✅ |
| 长期记忆删除支持 | ❌ | ❌ | ✅ |

---

## License

MIT