# OpenCode Memory Plugin v2.1.1 安装指南

## 版本说明

v2.1.1 在 v2.1.0 基础上打磨仪表板视觉与侧栏状态条。

### v2.1.1 新增内容
- ⭐ **仪表板打磨**：面板边框、HUD 行左右贴边、动态走线分区头、括号激活条 `[████░░]`（三档语义色）、省略号 `…` 截断
- ⭐ **分区折叠**：overview / mesh / list 可点击折叠（本页会话内记忆），`/memory-settings` 新增 `panel_border` 边框开关
- ⭐ **侧栏一行版**：`⭐ memory` + `[███░] N/M`（语义色），点击直接进入 `/memory`
- **无新增依赖**：仍只需 `@opencode/plugin`

v2.1.0 在 v2.0.0 基础上新增终端 TUI 记忆管理界面。

### v2.1.0 新增内容
- ⭐ **TUI 记忆管理页**：OpenCode 内输入 `/memory`（或快捷键 `ctrl+shift+m`）打开全屏管理页，全部在终端内完成，无需外部浏览器
  - **overview 概览**：readout 键值读数（total/layers/weights/last.compact/top 分类）+ `█░` 激活度条
  - **mesh 记忆网络**：callout 走线注记（`─── 分类名 ────────── ×N`）+ 同义词关联浏览
  - **list 列表**：ps 式对齐表头，按召回热度分页浏览
- ⭐ **管理操作**：`e` 打开管理菜单（查看全文 / 删除 / 提高权重，直接原子写 fragments.json）
- ⭐ **动效（可关闭）**：打字机入场、条形生长、数据变更时 HUD `rev/beat` 高亮渐退，入场结束即停时钟（无常驻开销）
- ⭐ **常驻状态插槽**：主界面底部 + 侧栏各一个状态 chip（碎片数 + 条形），可在设置中分别开关
- ⭐ **设置持久化**：`/memory-settings` 打开设置（footer/sidebar 插槽、快捷键、打字机动效开关）
- **声明依赖不变**：仍只需 `@opencode/plugin`，TUI 由 OpenCode v2 运行时注入 solid-js/JSX

### v2.0.0 内容（保留）
- ⭐ **V2 工具接口**：工具入参改用标准 JSON Schema 定义，返回值统一为 `{ content }` 结构，与 OpenCode 内建工具（read/edit/bash 等）行为一致
- ⭐ **插件目录自动发现**：插件放入 `~/.config/opencode/plugins/` 目录即可自动加载，无需再手动配置 `file://` 路径
- ⭐ **上下文注入升级**：改用 `ctx.session.hook("context"/"prompt")`，每次模型请求前自动注入长期记忆与碎片记忆状态，废弃旧的 `experimental.chat.system.transform`
- ⭐ **引用计数**：碎片被检索命中时自动更新 `updateRecall`，让冷热数据分层更准确
- ⭐ **安全规则强化**：支持 `strict.forbiddenCommands` / `strict.rules` 注入与拦截
- ⭐ **新增依赖** `@opencode/plugin`（v2.2.0），需要执行一次 `npm install`

### 保留功能
- 长期记忆管理（memory）
- 碎片记忆系统（memory_fragment_*，含热/冷数据循环、SQLite 归档）
- 深度搜索 / 归档恢复 / 碎片整理 / 诊断工具
- 同义词映射管理（synonym_map_*，自动提取中英文关键词）
- 说明书工具（memory_manual）

## 安装步骤

### 1. 复制插件文件

将 `plugins/opencode-memory/` 整个目录复制到：

```
~/.config/opencode/plugins/opencode-memory/
```

**注意**：如果目标目录已存在旧版本，请先删除旧文件再复制（保留 `fragment-config.json` 和 `external/fragment_archive.db` 可继承已有的整理状态和归档数据）。

### 2. 安装依赖

```bash
# 插件主体依赖（@opencode/plugin）
cd ~/.config/opencode/plugins/opencode-memory
npm install

# SQLite 归档依赖（sql.js，纯 JS 实现，无需编译）
cd external
npm install
```

### 3. 复制 Skill 文件（可选）

如需 AI 更智能地使用记忆系统，将 `skills/` 下的目录复制到：

```
~/.agents/skills/
```

### 4. 配置 opencode.json

**方式 A（推荐 v2.0.0）**：插件目录自动发现，无需额外路径配置。如需显式控制开关：

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["opencode-memory"]
}
```

在插件 ID 前加 `-` 可停用，例如 `"plugins": ["-opencode-memory", "-system-first"]`。

**方式 B（file:// 路径，兼容旧方式）**：

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["file:///C:/Users/<用户名>/.config/opencode/plugins/opencode-memory/index.js"]
}
```

**重要**：将 `<用户名>` 替换为你电脑的实际用户名。

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
| index.js | 主插件（V2 接口） |
| tui.tsx | TUI 记忆管理界面（v2.1.1 打磨，自动加载） |
| package.json | 声明 `@opencode/plugin` 依赖（exports 含 `./tui`） |
| manual.json | 说明书（JSON 格式，memory_manual 数据源） |
| README.md | 说明书（Markdown 格式） |
| fragment-config.json | 碎片整理配置 |

### 外部脚本目录 (external/)

| 文件 | 说明 |
|------|------|
| fragment_archive.db | SQLite 归档数据库（运行时生成） |
| sqlite-manager.js | SQLite key-value 工具 |
| fragment-compactor.js | 碎片整理脚本 |
| fragment-restorer.js | 归档恢复脚本 |
| fragment-deep-search.js | 深度搜索脚本 |

## 记忆循环机制

```
用户添加 ──▶ fragments.json（热数据）
    │
    ├─ 普通查询 ──▶ memory_fragment_search ──▶ 命中自动 updateRecall
    │
    ├─ 找不到 ──▶ 深度查询 ──▶ memory_fragment_deep_search ──▶ 自动恢复
    │
    └─ 定期整理 ──▶ memory_fragment_compact ──▶ SQLite 归档（冷数据）
                        │
                        └─ 需要时 ──▶ 深度查询 ──▶ 自动恢复 ──▶ 重新进入循环
```

## 配置文件

fragment-config.json 默认配置：

```json
{
  "json_max_count": 200,
  "cold_data_days": 30,
  "cold_data_age_days": 60,
  "last_compact": null,
  "tui": {
    "footer_slot": true,
    "sidebar_slot": true,
    "hotkey": true,
    "typing": true
  }
}
```

- `json_max_count`: 热数据最大条数
- `cold_data_days`: 超过 N 天未访问视为冷数据
- `cold_data_age_days`: 超过 N 天前创建视为冷数据
- `tui.footer_slot` / `tui.sidebar_slot`: 常驻状态插槽开关（也可用 `/memory-settings` 调整）
- `tui.hotkey`: `ctrl+shift+m` 快捷键开关
- `tui.typing`: 打字机入场动效开关

## Changelog

### v2.1.1
- 仪表板样式打磨：面板边框、HUD 行贴边、动态走线分区头、括号激活条三档语义色、省略号截断
- overview / mesh / list 分区可折叠（本页会话内记忆）；`/memory-settings` 新增 `panel_border` 开关
- 侧栏状态 chip 改一行版：`⭐ memory` + `[███░] N/M`（语义色），点击进 `/memory`
- 无新增依赖

### v2.1.0
- 新增 TUI 记忆管理界面（tui.tsx）：`/memory` 全屏管理页（overview / mesh / list 三视图）
- 新增常驻状态插槽（home.footer.status + sidebar.footer），可开关
- 新增 `/memory-settings` 设置对话框，设置持久化保存
- 新增管理操作：查看全文 / 删除 / 提高权重（直接原子写 fragments.json）
- 动效克制设计：打字机入场、条形生长、数据变更三档高亮渐退；入场结束即停时钟
- 插件 package.json 增加 `"./tui"` 导出；无新增依赖

### v2.0.0
- 全面迁移到 V2 工具接口（JSON Schema 入参 + `{ content }` 结果）
- 改用插件目录自动发现机制，新增 `@opencode/plugin` 依赖
- 上下文注入迁移为 `ctx.session.hook("context"/"prompt")`
- 新增碎片引用计数（updateRecall）
- 安全规则（strict.forbiddenCommands / rules）注入与拦截
- 更新 manual.json / 插件 README / 两个 SKILL.md 文档

### v1.4.0
- 新增 SQLite 归档系统、深度搜索 (deep_search)
- 新增 memory_manual 说明书工具与碎片整理循环机制

### v1.3.x
- 见 `-v1.3.1/INSTALL.md`

## 卸载

删除以下文件和目录：
- `~/.config/opencode/plugins/opencode-memory/`（整个目录）
- `~/.agents/skills/memory-manager/`
- `~/.agents/skills/memory-fragment/`
- `~/.config/opencode/fragments.json`
- `~/.config/opencode/associations_map.json`

**注意**：`memory.json` 是用户数据，如需保留请勿删除。
