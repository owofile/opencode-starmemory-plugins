# StarMenory

星之记忆 - OpenCode 长期记忆插件系统

> **StarMenory** = Star（星）+ Memory（记忆）—— 持久化星之记忆

## AI 自动安装 | AI Auto-Install

将仓库地址交给任意 AI 即可自动安装：

```
请帮我安装这个OpenCode插件和Skill：https://github.com/YOUR_USERNAME/opencode-starmemory-plugins
```

AI 会自动执行：
1. 克隆仓库
2. 复制 Skill 到 `~/.agents/skills/memory-manager/`
3. 复制 Plugin 到 `~/.config/opencode/plugins/StarMenory/`
4. 配置 `opencode.json`
5. 初始化 `memory.json`
6. 验证安装

## 功能特点 | Features

- **Plugin + Skill 组合** - 同时提供 Plugin 和 Skill，完整解决方案
- **独立存储** - 不依赖 OpenCode 内置数据库，有自己的 memory.json 存储
- **自动注入** - 通过 `system.transform` 自动将记忆注入到 AI 上下文
- **关键词检测** - 检测到"记住"、"别忘"等词时自动提醒 AI 保存
- **完整 CRUD** - 支持查看、添加、更新、删除、搜索记忆

## 架构 | Architecture

```
opencode-starmemory-plugins/
├── plugins/StarMenory/
│   └── index.js          # Plugin 入口
├── skills/memory-manager/
│   ├── SKILL.md          # Skill 定义
│   └── memory-manager.js # CLI 执行脚本
└── memory.json           # 记忆存储模板
```

## 手动安装 | Manual Install

```bash
# 1. 克隆仓库
git clone https://github.com/YOUR_USERNAME/opencode-starmemory-plugins
cd opencode-starmemory-plugins

# 2. 安装 Skill
mkdir -p ~/.agents/skills/memory-manager
cp -r skills/memory-manager/* ~/.agents/skills/memory-manager/

# 3. 安装 Plugin
mkdir -p ~/.config/opencode/plugins/StarMenory
cp -r plugins/StarMenory/* ~/.config/opencode/plugins/StarMenory/

# 4. 配置 opencode.json
echo '{"plugin":["~/.config/opencode/plugins/StarMenory/index.js"]}' >> ~/.config/opencode/opencode.json

# 5. 初始化 memory.json
cp memory.json ~/.config/opencode/memory.json
```

## 使用方法 | Usage

### 自动记忆

当消息包含以下关键词时，系统会自动提醒 AI 保存记忆：
- `记住`、`remember`、`save this`
- `别忘`、`不要忘`
- `一直用`、`总是用`
- `偏好`、`以后都`

### 手动调用 memory 工具

```
memory action=view                    # 查看全部记忆
memory action=view category=user      # 查看用户偏好
memory action=add category=user.preferences key=editor value=VSCode  # 添加偏好
memory action=add category=strict.rules value="新规则"              # 添加规则
memory action=search query=下载        # 搜索记忆
```

## 记忆结构 | Memory Structure

```json
{
  "version": 2,
  "user": { "preferences": {} },
  "strict": {
    "forbiddenCommands": [],
    "rules": []
  },
  "projects": {}
}
```

## License

MIT