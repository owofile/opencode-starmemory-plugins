# v1.1.0 安装指南

## 包含内容

### Plugin: opencode-memory
增强版记忆插件，包含：
- 原有 memory 工具（调用 memory-manager）
- 新增 memory_fragment_* 系列工具（**JSON 文件存储**）

### Skill: memory-fragment
碎片化长期记忆系统文档。

## 安装步骤

### 1. 安装 Plugin
```powershell
# 复制插件文件
$pluginDir = "$env:USERPROFILE\.config\opencode\plugins\opencode-memory"

# 复制 index.js（直接使用，无需编译）
Copy-Item -Path "plugins\opencode-memory\index.js" -Destination "$pluginDir\index.js" -Force

# 复制 package.json
Copy-Item -Path "plugins\opencode-memory\package.json" -Destination "$pluginDir\" -Force
```

### 2. 安装 Skill
```powershell
$skillDir = "$env:USERPROFILE\.agents\skills\memory-fragment"
New-Item -ItemType Directory -Path $skillDir -Force
Copy-Item -Path "skills\memory-fragment\SKILL.md" -Destination "$skillDir\"
```

### 3. 安装依赖
```powershell
Set-Location $pluginDir
npm install
```

### 4. 初始化数据文件（首次使用自动创建）
首次使用时会自动创建 `fragments.json`

## 工具列表

| 工具 | 说明 |
|------|------|
| `memory` | 原有 memory-manager 调用 |
| `memory_fragment_add` | 添加碎片 |
| `memory_fragment_search` | 搜索碎片 |
| `memory_fragment_stats` | 查看统计 |
| `memory_fragment_view` | 查看碎片列表 |
| `memory_fragment_delete` | 删除碎片 |

## 重要规则：禁止添加新的 ESM Import

⚠️ OpenCode 插件加载机制不支持添加新的 ESM import 语句。
- 只使用原有的 imports (fs, path, child_process)
- 使用 JSON 文件存储，避免 SQLite 依赖
- 如果需要新功能，使用外部脚本或 JSON 文件存储

## 卸载
```powershell
Remove-Item -Recurse -Force "$env:USERPROFILE\.config\opencode\plugins\opencode-memory"
Remove-Item -Recurse -Force "$env:USERPROFILE\.agents\skills\memory-fragment"
Remove-Item -Force "$env:USERPROFILE\.config\opencode\fragments.json"
Remove-Item -Force "$env:USERPROFILE\.config\opencode\fragments.db"
```
