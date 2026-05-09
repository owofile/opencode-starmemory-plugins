# OpenCode Memory Plugin v1.3.1 安装指南

## 版本说明

v1.3.1 修复了重要 bug，包含：
- ✅ 长期记忆管理（memory）- **已修复中文编码问题**
- ✅ 碎片记忆系统（memory_fragment_*）
- ✅ 同义词映射管理（synonym_map_*）
- ✅ 自动提取关联词
- ✅ 查询时同义词扩展
- ✅ 添加碎片时自动分析并添加中英文同义词映射
- ✅ **修复**：`memory` 工具现在使用 fs 直接读写 memory.json，完美支持中文
- ✅ **新增**：默认包含 memory.json 配置文件（用户偏好、安全规则等）

## 安装步骤

### 1. 复制插件文件

将 `plugins/opencode-memory/index.js` 复制到：
```
C:\Users\<用户名>\.config\opencode\plugins\opencode-memory\index.js
```

### 2. 复制 Skill 文件

将 `skills/memory-manager/` 复制到：
```
C:\Users\<用户名>\.agents\skills\memory-manager\
```

将 `skills/memory-fragment/` 复制到：
```
C:\Users\<用户名>\.agents\skills\memory-fragment\
```

### 3. 复制默认配置（可选）

将 `memory.json` 复制到：
```
C:\Users\<用户名>\.config\opencode\memory.json
```

此文件包含默认的用户偏好和安全规则，可按需修改。

### 4. 配置 opencode.json

在 `C:\Users\<用户名>\.config\opencode\opencode.json` 中添加：

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["file:///C:/Users/<用户名>/.config/opencode/plugins/opencode-memory/index.js"]
}
```

### 5. 重启 OpenCode

重启后自动加载插件。

## 数据文件

插件会创建以下数据文件：

| 文件 | 路径 | 说明 |
|------|------|------|
| memory.json | `~/.config/opencode/` | 长期记忆（可预置默认配置） |
| fragments.json | `~/.config/opencode/` | 碎片记忆 |
| associations_map.json | `~/.config/opencode/` | 同义词映射 |

## 工具列表

### 长期记忆（memory）
- `memory action=view` - 查看记忆
- `memory action=add` - 添加记忆
- `memory action=update` - 更新记忆
- `memory action=delete` - 删除记忆
- `memory action=search` - 搜索记忆

### 碎片记忆（memory_fragment_*）
- `memory_fragment_add` - 添加碎片（自动添加同义词映射）
- `memory_fragment_search` - 搜索碎片
- `memory_fragment_view` - 查看列表
- `memory_fragment_update` - 更新碎片
- `memory_fragment_delete` - 删除碎片
- `memory_fragment_stats` - 统计
- `memory_fragment_compact` - 整理

### 同义词映射（synonym_map_*）
- `synonym_map_view` - 查看映射
- `synonym_map_add` - 添加映射
- `synonym_map_update` - 更新映射
- `synonym_map_delete` - 删除映射

## Changelog

### v1.3.1
- 修复 `memory` 工具的中文编码问题（改用 fs 直接读写 memory.json）
- 新增默认 memory.json 配置文件
- 不再依赖外部 memory-manager.js 脚本

### v1.3.0
- 添加碎片时自动分析中英文关键词并添加到同义词映射表
- 修复 expandQuery 拆分查询词，支持多词搜索

### v1.2.0
- 初始功能完善版本
- 支持碎片记忆系统和同义词映射

## 卸载

删除以下文件和目录：
- `~/.config/opencode/plugins/opencode-memory/`
- `~/.agents/skills/memory-manager/`
- `~/.agents/skills/memory-fragment/`
- `~/.config/opencode/memory.json`
- `~/.config/opencode/fragments.json`
- `~/.config/opencode/associations_map.json`