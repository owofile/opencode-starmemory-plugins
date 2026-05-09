# v1.0.0 安装指南

## 包含内容

### Plugin: StarMenory
原始记忆插件，集成 memory-manager 技能调用。

### Skill: memory-manager
JSON 格式的长期记忆管理系统。

## 安装步骤

### 1. 安装 Plugin
```powershell
# 复制插件文件到 OpenCode 插件目录
Copy-Item -Path "plugins\StarMenory\index.js" -Destination "$env:USERPROFILE\.config\opencode\plugins\StarMenory\"
```

### 2. 安装 Skill
```powershell
# 复制技能文件到 OpenCode 技能目录
Copy-Item -Path "skills\memory-manager\memory-manager.js" -Destination "$env:USERPROFILE\.agents\skills\memory-manager\"
Copy-Item -Path "skills\memory-manager\SKILL.md" -Destination "$env:USERPROFILE\.agents\skills\memory-manager\"
```

### 3. 创建 memory.json
```powershell
$memoryPath = "$env:USERPROFILE\.config\opencode\memory.json"
if (!(Test-Path $memoryPath)) {
    @{
        version = 1
        user = @{ preferences = @{} }
        strict = @{ forbiddenCommands = @(); rules = @() }
        projects = @{}
    } | ConvertTo-Json -Depth 10 | Set-Content $memoryPath -Encoding UTF8
}
```

## 卸载
删除对应目录和文件即可。
