# OpenCode Memory Plugin v1.4.0 安装指南

## 版本说明

v1.4.0 是重大更新版本，包含：

### 新增功能
- ✅ **SQLite 归档系统**：冷数据自动归档到 SQLite，支持大量数据存储
- ✅ **深度搜索 (deep_search)**：同时查 JSON + SQLite，自动恢复归档碎片
- ✅ **说明书工具 (memory_manual)**：AI 可主动查询插件使用说明
- ✅ **碎片整理循环**：热数据 ↔ 冷数据 自动循环
- ✅ **归档状态查看**：随时了解碎片数量和整理建议

### 核心功能
- ✅ 长期记忆管理（memory）
- ✅ 碎片记忆系统（memory_fragment_*）
- ✅ 同义词映射管理（synonym_map_*）
- ✅ 自动提取关联词
- ✅ 查询时同义词扩展
- ✅ 添加碎片时自动分析并添加中英文同义词映射

## 安装步骤

### 1. 复制插件文件

将 `plugins/opencode-memory/` 整个目录复制到：
```
C:\Users\<用户名>\.config\opencode\plugins\opencode-memory\
```

**注意**：如果目标目录已存在旧版本，请先删除旧文件再复制。

### 2. 安装外部依赖

进入 external 目录并安装依赖：
```bash
cd C:\Users\<用户名>\.config\opencode\plugins\opencode-memory\external
npm install
```

这会安装 sql.js（纯 JavaScript SQLite 实现，无需编译）。

### 3. 复制 Skill 文件（可选）

如需 AI 更智能地使用记忆系统，将 `skills/` 目录复制到：
```
C:\Users\<用户名>\.agents\skills\
```

### 4. 配置 opencode.json

**不要直接复制覆盖 opencode.json 文件！**

如果你的 `~/.config/opencode/opencode.json` 中已有其他插件配置，只需添加一行：

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    "file:///你的其他插件路径",
    "file:///C:/Users/<用户名>/.config/opencode/plugins/opencode-memory/index.js"
  ]
}
```

如果还没有 opencode.json，手动创建：

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["file:///C:/Users/<用户名>/.config/opencode/plugins/opencode-memory/index.js"]
}
```

**重要**：将 `<用户名>` 替换为你电脑的实际用户名！

### 5. 重启 OpenCode

重启后自动加载插件。

## 数据文件

### 自动创建的文件

| 文件 | 路径 | 说明 |
|------|------|------|
| memory.json | `~/.config/opencode/` | 长期记忆 |
| fragments.json | `~/.config/opencode/` | 碎片记忆（热数据） |
| associations_map.json | `~/.config/opencode/` | 同义词映射 |
| fragment-config.json | `~/.config/opencode/plugins/opencode-memory/` | 碎片整理配置 |

### 插件目录文件

| 文件 | 说明 |
|------|------|
| index.js | 主插件 |
| manual.json | 说明书（JSON格式） |
| README.md | 说明书（Markdown格式） |
| fragment-config.json | 碎片整理配置 |

### 外部脚本目录 (external/)

| 文件 | 说明 |
|------|------|
| fragment_archive.db | SQLite 归档数据库 |
| sqlite-manager.js | SQLite key-value 工具 |
| fragment-compactor.js | 碎片整理脚本 |
| fragment-restorer.js | 归档恢复脚本 |
| fragment-deep-search.js | 深度搜索脚本 |

## 工具列表

### 长期记忆（memory）
- `memory action=view` - 查看记忆
- `memory action=add` - 添加记忆
- `memory action=update` - 更新记忆
- `memory action=delete` - 删除记忆
- `memory action=search` - 搜索记忆

### 碎片记忆（memory_fragment_*）
- `memory_fragment_add` - 添加碎片
- `memory_fragment_search` - 普通搜索（只查热数据）
- `memory_fragment_deep_search` - 深度搜索（JSON + SQLite）
- `memory_fragment_view` - 查看列表
- `memory_fragment_update` - 更新碎片
- `memory_fragment_delete` - 删除碎片
- `memory_fragment_stats` - 统计
- `memory_fragment_compact` - 整理（归档冷数据）
- `memory_fragment_restore` - 从归档恢复
- `memory_fragment_archive_status` - 查看归档状态

### 说明书（memory_manual）
- `memory_manual` - 查询插件使用说明

### 同义词映射（synonym_map_*）
- `synonym_map_view` - 查看映射
- `synonym_map_add` - 添加映射
- `synonym_map_update` - 更新映射
- `synonym_map_delete` - 删除映射

## 记忆循环机制

```
用户添加 → fragments.json（热数据）
    ↓
普通查询 → memory_fragment_search
    ↓ 找不到
深度查询 → memory_fragment_deep_search → 自动恢复
    ↓
定期整理 → memory_fragment_compact → SQLite归档（冷数据）
    ↓
需要时 → 深度查询 → 自动恢复 → 重新进入循环
```

## 配置文件

fragment-config.json 默认配置：

```json
{
  "json_max_count": 200,
  "cold_data_days": 30,
  "cold_data_age_days": 60,
  "last_compact": null
}
```

- `json_max_count`: 热数据最大条数
- `cold_data_days`: 超过N天未访问视为冷数据
- `cold_data_age_days`: 超过N天前创建视为冷数据

## Changelog

### v1.4.0
- 新增 SQLite 归档系统
- 新增深度搜索 (deep_search) 支持
- 新增 memory_manual 说明书工具
- 新增碎片整理循环机制
- 优化碎片管理逻辑

### v1.3.1
- 修复 `memory` 工具的中文编码问题
- 新增默认 memory.json 配置文件

### v1.3.0
- 添加碎片时自动分析中英文关键词并添加到同义词映射表
- 修复 expandQuery 拆分查询词

### v1.2.0
- 初始功能完善版本
- 支持碎片记忆系统和同义词映射

## 卸载

删除以下文件和目录：
- `~/.config/opencode/plugins/opencode-memory/`（整个目录）
- `~/.agents/skills/memory-manager/`
- `~/.agents/skills/memory-fragment/`
- `~/.config/opencode/fragments.json`
- `~/.config/opencode/associations_map.json`

**注意**：`memory.json` 是用户数据，如需保留请勿删除。