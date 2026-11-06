---
name: memory-manager
description: 管理 memory.json 系统配置（用户偏好、安全规则、项目）。当用户想要查看、添加、更新、删除系统配置时使用此技能。
---

# System Config Manager Skill

管理 memory.json 系统配置（用户偏好、安全规则、项目）。

## 记忆结构

```
memory.json
├── user                    # 用户信息
│   └── preferences        # 用户偏好设置（支持嵌套键）
├── strict                 # 严谨事项
│   ├── forbiddenCommands  # 禁区命令
│   └── rules             # 严格规则
└── projects               # 项目特定记忆
```

## 工具使用

### memory 工具

**参数：**
- `action`: `view` | `add` | `update` | `delete` | `search`
- `category`: 记忆分类
- `key`: 键名
- `value`: 值
- `extra`: 额外参数（用于 forbidden 命令的正则模式）

**示例：**

```
# 查看全部记忆
memory action=view

# 查看特定分类
memory action=view category=user
memory action=view category=strict
memory action=view category=projects

# 查看嵌套偏好（如 user.preferences.theme）
memory action=view category=user.preferences.theme

# 查看特定项目
memory action=view category=projects.myproject

# 添加用户偏好（简单键）
memory action=add category=user.preferences key=editor value=VSCode

# 添加嵌套偏好
memory action=add category=user.preferences.theme key=dark value=true
# 实际存储为: user.preferences.theme = "true"

# 添加项目记忆
memory action=add category=projects key=myproject value="项目描述"

# 添加严格规则
memory action=add category=strict.rules value="新规则内容"

# 添加禁区命令
memory action=add category=strict.forbidden key="描述" value="描述" extra="正则模式"

# 更新用户偏好
memory action=update category=user.preferences key=name value=newname

# 更新嵌套偏好
memory action=update category=user.preferences.theme value=light

# 更新项目记忆
memory action=update category=projects key=myproject value="更新后的描述"

# 删除规则
memory action=delete category=strict.rules key=要删除的规则内容

# 删除偏好
memory action=delete category=user.preferences key=editor

# 删除项目
memory action=delete category=projects key=myproject

# 搜索记忆（搜索所有分类）
memory action=search query=VSCode
```

## 支持的 category

| category | 说明 | 支持的操作 |
|----------|------|-----------|
| `user.preferences` | 用户偏好（简单键值对） | view, add, update, delete |
| `user.preferences.<key>` | 嵌套偏好（如 theme, editor） | view, add, update, delete |
| `strict.rules` | 严格规则数组 | view, add, delete |
| `strict.forbidden` | 禁区命令列表 | view, add, delete |
| `projects` | 项目记忆（键值对） | view, add, update, delete |
| `projects.<key>` | 特定项目 | view, add, update, delete |

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