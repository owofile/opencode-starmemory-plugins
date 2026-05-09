---
name: memory-manager
description: 管理和查询长期记忆系统。当用户想要查看、添加、更新、删除记忆内容，或搜索记忆时使用此技能。
---

# Memory Manager Skill

管理和查询长期记忆系统。

## 记忆结构

```
memory.json
├── user                    # 用户信息
│   └── preferences        # 用户偏好设置
├── strict                 # 严谨事项
│   ├── forbiddenCommands  # 禁区命令
│   └── rules             # 严格规则
└── projects               # 项目特定记忆
```

## 工具使用

### memory 工具

**参数：**
- `action`: `view` | `add` | `update` | `delete` | `search`
- `category`: 记忆分类 (可选)
- `key`: 键名 (可选)
- `value`: 值 (可选)
- `extra`: 额外参数 (可选)

**示例：**
```
# 查看全部记忆
memory action=view

# 查看特定分类
memory action=view category=user
memory action=view category=strict

# 添加用户偏好
memory action=add category=user.preferences key=editor value=VSCode

# 添加严格规则
memory action=add category=strict.rules value="新规则内容"

# 添加禁区命令
memory action=add category=strict.forbidden key="描述" value="描述" extra="正则模式"

# 更新偏好
memory action=update category=user.preferences key=name value=newname

# 删除规则
memory action=delete category=strict.rules key=要删除的规则内容

# 搜索记忆
memory action=search query=下载
```

## 自动记忆

当消息包含以下关键词时，系统会自动提示保存记忆：
- `记住`、`remember`、`save this`
- `别忘`、`不要忘`
- `一直用`、`总是用`
- `偏好`、`以后都`

AI 会自动总结并保存，无需手动调用工具。

## 长期记忆内容

[LONG-TERM MEMORY] 部分会每次自动注入到 AI 上下文中，包括：
- 用户偏好 (name, language, timezone 等)
- 禁区命令 (禁止执行的危险命令)
- 严格规则 (必须遵守的规则)