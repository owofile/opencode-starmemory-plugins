# StarMenory

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

## AI 自动安装 | AI Auto-Install

将仓库地址交给任意 AI 即可自动安装：

```
请帮我安装这个OpenCode插件和Skill：https://github.com/owofile/opencode-starmemory-plugins
```

AI 会自动执行：
1. 克隆仓库到临时目录
2. 复制 Skill 到 `~/.agents/skills/memory-manager/`
3. 复制 Plugin 到 `~/.config/opencode/plugins/StarMenory/`
4. 配置 `opencode.json` 添加插件路径
5. 初始化 `memory.json` 到 `~/.config/opencode/`
6. 验证安装成功

## 功能特点 | Features

| Feature | Description | 功能 |
|---------|-------------|------|
| Plugin + Skill | Complete solution with both Plugin and Skill | 同时提供 Plugin 和 Skill，完整解决方案 |
| Independent Storage | Own memory.json, not dependent on OpenCode DB | 独立存储，不依赖 OpenCode 内置数据库 |
| Auto Injection | Automatically inject memory into AI context via system.transform | 通过 `system.transform` 自动将记忆注入到 AI 上下文 |
| Keyword Detection | Detect "remember", "别忘" etc. and auto-prompt AI | 检测关键词自动提醒 AI 保存记忆 |
| Full CRUD | View, Add, Update, Delete, Search memory | 完整的增删改查功能 |

## 架构 | Architecture

```
opencode-starmemory-plugins/
├── plugins/StarMenory/
│   └── index.js              # Plugin 入口 | Plugin Entry
├── skills/memory-manager/
│   ├── SKILL.md              # Skill 定义 | Skill Definition
│   └── memory-manager.js     # CLI 执行脚本 | CLI Script
├── memory.json               # 记忆存储模板 | Memory Template
├── StarMenoryLOGO.png        # LOGO
└── README.md
```

## 手动安装 | Manual Install

```bash
# 1. Clone the repo | 克隆仓库
git clone https://github.com/owofile/opencode-starmemory-plugins
cd opencode-starmemory-plugins

# 2. Install Skill | 安装 Skill
mkdir -p ~/.agents/skills/memory-manager
cp -r skills/memory-manager/* ~/.agents/skills/memory-manager/

# 3. Install Plugin | 安装 Plugin
mkdir -p ~/.config/opencode/plugins/StarMenory
cp -r plugins/StarMenory/* ~/.config/opencode/plugins/StarMenory/

# 4. Configure opencode.json | 配置 opencode.json
echo '{"plugin":["~/.config/opencode/plugins/StarMenory/index.js"]}' >> ~/.config/opencode/opencode.json

# 5. Initialize memory.json | 初始化 memory.json
cp memory.json ~/.config/opencode/memory.json
```

## 使用方法 | Usage

### 自动记忆 | Auto Memory

当消息包含以下关键词时，系统会自动提醒 AI 保存记忆：

| 中文 | English |
|------|---------|
| 记住、别忘 | remember, save this |
| 一直用、总是用 | always use |
| 偏好 | preference |

### 手动调用 memory 工具 | Manual memory Tool

```bash
# View all memory | 查看全部记忆
memory action=view

# View user preferences | 查看用户偏好
memory action=view category=user

# Add user preference | 添加用户偏好
memory action=add category=user.preferences key=editor value=VSCode

# Add strict rule | 添加严格规则
memory action=add category=strict.rules value="执行前必须确认"

# Search memory | 搜索记忆
memory action=search query=下载
```

## 记忆结构 | Memory Structure

```json
{
  "version": 2,
  "user": {
    "preferences": {
      "name": "用户名",
      "language": "中文"
    }
  },
  "strict": {
    "forbiddenCommands": [
      {
        "id": "no-rf-root",
        "pattern": "rm\\s+-rf\\s+/",
        "description": "禁止递归删除根目录",
        "severity": "critical"
      }
    ],
    "rules": [
      "执行删除操作前必须确认路径"
    ]
  },
  "projects": {}
}
```

## 与其他方案对比 | Comparison

| Feature | StarMenory | opencode-memory (carson2222) |
|---------|------------|------------------------------|
| Type | Plugin + Skill | Skill Only |
| Write | ✅ Full CRUD | ❌ Read-only |
| Storage | ✅ memory.json | ❌ OpenCode DB |
| Auto Injection | ✅ system.transform | ❌ None |
| Keyword Detection | ✅ chat.message | ❌ None |

## License

MIT