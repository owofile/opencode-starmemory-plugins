# v1.1.0 安装指南

## 包含内容

### Plugin: opencode-memory
增强版记忆插件，包含：
- 原有 memory 工具（调用 memory-manager）
- 新增 memory_fragment_* 系列工具（SQLite 碎片化存储）

### Skill: memory-fragment
碎片化长期记忆系统文档。

## 安装步骤

### 1. 安装 Plugin
```powershell
# 复制插件文件
$pluginDir = "$env:USERPROFILE\.config\opencode\plugins\opencode-memory"
New-Item -ItemType Directory -Path "$pluginDir\src" -Force
New-Item -ItemType Directory -Path "$pluginDir\dist" -Force

Copy-Item -Path "plugins\opencode-memory\src\index.ts" -Destination "$pluginDir\src\"
Copy-Item -Path "plugins\opencode-memory\dist\index.js" -Destination "$pluginDir\dist\"
Copy-Item -Path "plugins\opencode-memory\package.json" -Destination "$pluginDir\"
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

### 4. 初始化数据库（可选）
首次使用时会自动创建 `fragments.db`

## 工具列表

| 工具 | 说明 |
|------|------|
| `memory` | 原有 memory-manager 调用 |
| `memory_fragment_add` | 添加碎片 |
| `memory_fragment_search` | 搜索碎片（带温度随机性）|
| `memory_fragment_stats` | 查看统计 |
| `memory_fragment_view` | 查看碎片列表 |
| `memory_fragment_delete` | 删除碎片 |
| `memory_fragment_compact` | 整理数据库 |

## 卸载
```powershell
Remove-Item -Recurse -Force "$env:USERPROFILE\.config\opencode\plugins\opencode-memory"
Remove-Item -Recurse -Force "$env:USERPROFILE\.agents\skills\memory-fragment"
Remove-Item -Force "$env:USERPROFILE\.config\opencode\fragments.db"
```
