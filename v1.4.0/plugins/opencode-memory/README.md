# OpenCode Memory Plugin - 说明书

## 概述

这是一个分层记忆管理系统，融合了长期记忆（结构化）和碎片记忆（自由格式），并通过 SQLite 归档实现数据循环。

## 架构

```
┌──────────────────────────────────────────────────────────────┐
│                     OpenCode Memory 系统                      │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐   │
│  │  长期记忆    │     │  碎片记忆    │     │   SQLite    │   │
│  │ memory.json │     │ fragments.json│    │  归档存储   │   │
│  └─────────────┘     └─────────────┘     └─────────────┘   │
│         │                   │                   │           │
│         └───────────────────┼───────────────────┘           │
│                             │                               │
│              ┌──────────────┴──────────────┐                │
│              │      memory 工具集合         │                │
│              │   (查看/添加/更新/删除/搜索) │                │
│              └─────────────────────────────┘                │
│                                                              │
│  碎片整理循环：                                               │
│  碎片记忆 → compact(整理) → SQLite归档                        │
│      ↑                                    ↓                   │
│      └──── deep_search(深度查询) ←──────┘                   │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

## 文件结构

```
opencode-memory/                    # 插件根目录
├── index.js                        # 主插件（含所有工具定义）
├── manual.json                     # 说明书（JSON格式）
├── README.md                       # 说明书备份（Markdown格式）
├── fragment-config.json             # 碎片整理配置文件
└── external/                       # 外部脚本目录
    ├── fragment_archive.db          # SQLite 归档数据库
    ├── sqlite-manager.js           # SQLite key-value 存储工具
    ├── fragment-compactor.js       # 碎片整理脚本
    ├── fragment-restorer.js        # 归档恢复脚本
    ├── fragment-deep-search.js     # 深度搜索脚本
    └── package.json                # npm 依赖配置

数据存储位置：
├── .config/opencode/
│   ├── memory.json                 # 长期记忆
│   ├── fragments.json              # 碎片记忆（热数据）
│   └── associations_map.json       # 同义词映射表
└── .config/opencode/plugins/opencode-memory/
    ├── fragment-config.json         # 碎片整理配置
    └── external/fragment_archive.db # SQLite 归档（冷数据）
```

## 数据文件

| 文件 | 位置 | 说明 |
|------|------|------|
| `memory.json` | `.config/opencode/` | 长期记忆（用户偏好、规则、项目等） |
| `fragments.json` | `.config/opencode/` | 碎片记忆（热数据，JSON格式） |
| `fragment-config.json` | `plugins/opencode-memory/` | 碎片整理配置 |
| `fragment_archive.db` | `plugins/opencode-memory/external/` | SQLite数据库（冷数据归档） |
| `associations_map.json` | `.config/opencode/` | 同义词映射表 |

## 工具列表

### 长期记忆工具 (memory)

#### memory view
查看长期记忆内容。

```
memory action=view
memory action=view category=user
memory action=view category=user.preferences
memory action=view category=strict
```

#### memory add
添加长期记忆。

```
memory action=add category=user.preferences key=响应风格 value=简洁直接
memory action=add category=strict.rules value=禁止删除系统目录
memory action=add category=strict.forbidden key=危险操作 value=禁止格式化盘符 extra=format\s+[A-Za-z]:
```

#### memory update
更新长期记忆。

```
memory action=update category=user.preferences key=响应风格 value=详细解释
```

#### memory delete
删除长期记忆。

```
memory action=delete category=user.preferences key=响应风格
```

#### memory search
搜索长期记忆。

```
memory action=search key=响应风格
```

---

### 碎片记忆工具 (memory_fragment_*)

#### memory_fragment_add
添加碎片记忆。

```
memory_fragment_add content="这是一条测试记忆" associations=["测试","记忆"] category=test layer=surface
```

**参数说明：**
- `content` (必填): 记忆内容
- `associations` (可选): 关键词数组，用于搜索匹配
- `category` (可选): 分类，默认 "general"
- `layer` (可选): 层，"surface" 或 "deep"
- `source` (可选): 来源，"explicit" 或 "inferred"

#### memory_fragment_view
查看碎片列表。

```
memory_fragment_view
memory_fragment_view category=test
memory_fragment_view layer=deep
```

#### memory_fragment_search
普通搜索（只查JSON热数据）。

```
memory_fragment_search query=动漫
memory_fragment_search query=编程 limit=10
```

#### memory_fragment_update
更新碎片。

```
memory_fragment_update id=frag_xxx content=新内容
memory_fragment_update id=frag_xxx weight=0.8 layer=deep
```

#### memory_fragment_delete
删除碎片。

```
memory_fragment_delete id=frag_xxx
```

#### memory_fragment_stats
查看碎片统计。

```
memory_fragment_stats
```

---

### 碎片整理工具 (memory_fragment_compact / restore)

#### memory_fragment_archive_status
查看归档状态和建议。

```
memory_fragment_archive_status
```

**返回信息：**
- `current_count`: 当前JSON中碎片数量
- `json_max_count`: JSON最大容量（超过会建议整理）
- `cold_data_days`: 冷数据天数阈值（超过N天未访问视为冷）
- `cold_data_age_days`: 老化天数阈值（创建超过N天视为冷）
- `last_compact`: 上次整理时间
- `days_since_compact`: 距离上次整理的天数
- `suggestion`: 整理建议

#### memory_fragment_compact
整理碎片，将冷数据归档到SQLite。

```
memory_fragment_compact
memory_fragment_compact mode=gentle
memory_fragment_compact mode=auto
memory_fragment_compact mode=aggressive
```

**模式说明：**
- `gentle`: 只归档60天前创建且访问<2次的记忆
- `auto`: (默认) 30天未访问 或 60天前创建
- `aggressive`: 15天未访问 或 45天前创建 或 访问<3次

#### memory_fragment_restore
从归档恢复碎片。

```
memory_fragment_restore action=list limit=10
memory_fragment_restore action=id param=frag_xxx
memory_fragment_restore action=query param=旧记忆
```

**操作说明：**
- `list`: 列出所有归档碎片
- `id`: 通过ID恢复单个碎片
- `query`: 通过关键词搜索并恢复

#### memory_fragment_deep_search
深度搜索（同时查JSON+归档，自动恢复）。

```
memory_fragment_deep_search query=旧记忆 limit=5
```

**工作流程：**
1. 先查JSON热数据
2. 如果结果不足，查SQLite归档
3. 归档中找到的碎片自动恢复到JSON
4. 返回合并结果

**适用场景：**
- 普通搜索找不到时
- 需要找回很久以前的记忆时
- AI判断需要使用深度查询时

---

### 同义词映射工具 (synonym_map_*)

#### synonym_map_view
查看同义词映射表。

```
synonym_map_view
```

#### synonym_map_add
添加同义词。

```
synonym_map_add key=plugin synonyms=["插件","扩展"]
```

#### synonym_map_update
更新同义词（完全替换）。

```
synonym_map_update key=plugin synonyms=["插件","addon"]
```

#### synonym_map_delete
删除同义词。

```
synonym_map_delete key=plugin
```

---

## 配置文件

### fragment-config.json

位置：`plugins/opencode-memory/fragment-config.json`

```json
{
  "json_max_count": 200,
  "cold_data_days": 30,
  "cold_data_age_days": 60,
  "last_compact": null
}
```

**字段说明：**
- `json_max_count`: JSON最大碎片数量，超过时建议整理
- `cold_data_days`: 超过N天未访问视为冷数据
- `cold_data_age_days`: 超过N天前创建视为冷数据
- `last_compact`: 上次整理时间（自动更新）

---

## 数据结构

### 碎片 (Fragment)

```json
{
  "id": "frag_mp0xg363_nx2r2",
  "content": "记忆内容",
  "category": "general",
  "layer": "surface",
  "weight": 0.5,
  "source": "explicit",
  "associations": ["关键词1", "关键词2"],
  "created_at": "2026-05-11T08:15:46.443Z",
  "access_count": 0,
  "last_recalled": null,
  "recall_frequency": 0
}
```

**字段说明：**
- `id`: 唯一标识
- `content`: 记忆内容文本
- `category`: 分类（general/test/system等）
- `layer`: 层（surface浅层/deep深层）
- `weight`: 权重（0-1，影响搜索排名）
- `source`: 来源（explicit显式/inferred推断）
- `associations`: 关键词数组，用于搜索匹配
- `created_at`: 创建时间
- `access_count`: 累计访问次数
- `last_recalled`: 最后访问时间
- `recall_frequency`: 访问频率

### 长期记忆 (Memory)

```json
{
  "version": 2,
  "user": {
    "preferences": {
      "响应风格": "简洁直接",
      "语言": "中文"
    }
  },
  "strict": {
    "forbiddenCommands": [
      {
        "id": "forbid_xxx",
        "description": "危险操作",
        "pattern": "format\\s+[A-Za-z]:",
        "severity": "critical"
      }
    ],
    "rules": [
      "禁止删除系统目录"
    ]
  },
  "projects": {
    "my-project": "项目描述"
  }
}
```

---

## 记忆循环流程

```
                    ┌─────────────────┐
                    │  用户添加记忆    │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │ fragments.json  │
                    │   (热数据)       │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
        普通查询        深度查询      定期整理
        (search)    (deep_search)   (compact)
              │              │              │
              │              │              ▼
              │              │     ┌─────────────────┐
              │              │     │     SQLite      │
              │              │     │  (冷数据归档)    │
              │              │     └────────┬────────┘
              │              │              │
              │              ▼              │
              │     ┌─────────────────┐      │
              └────→│  自动恢复到     │←─────┘
                    │ fragments.json │
                    └─────────────────┘
```

---

## AI 使用指南

### 系统注入信息

每次对话时，`system.transform` hook 会自动注入：

1. **长期记忆内容** - 用户偏好、规则、禁止命令
2. **碎片整理状态** - 当前数量、上次整理时间、建议

### 建议的 AI 行为

1. **当碎片数量接近上限时**：
   - 考虑调用 `memory_fragment_compact` 整理

2. **当普通搜索找不到记忆时**：
   - 建议使用 `memory_fragment_deep_search` 深度查询

3. **当需要恢复特定旧记忆时**：
   - 使用 `memory_fragment_restore action=query param="关键词"`

4. **当用户询问如何使用记忆系统时**：
   - 使用 `memory_manual` 工具查询本说明书
   - 根据用户问题，解释相关工具的用法

---

## 外部脚本

位于 `plugins/opencode-memory/external/` 目录：

| 脚本 | 用途 |
|------|------|
| `sqlite-manager.js` | SQLite key-value 存储工具 |
| `fragment-compactor.js` | 碎片整理脚本 |
| `fragment-restorer.js` | 归档恢复脚本 |
| `fragment-deep-search.js` | 深度搜索脚本 |

这些脚本通过 `execSync` 由插件调用，用于处理 SQLite 相关操作。

---

## 常见问题

### Q: 碎片记忆太多查询变慢怎么办？
A: 使用 `memory_fragment_compact` 整理冷数据到 SQLite。

### Q: 一条旧记忆被归档了，还能找回来吗？
A: 可以，用 `memory_fragment_deep_search` 或 `memory_fragment_restore`。

### Q: 怎么调整冷数据的判定标准？
A: 编辑 `fragment-config.json` 中的 `cold_data_days` 和 `cold_data_age_days`。

### Q: 为什么有两条一样的记忆？
A: 可能是 deep_search 恢复后又手动恢复了同一ID的记录，可以用 `memory_fragment_delete` 删除重复。
