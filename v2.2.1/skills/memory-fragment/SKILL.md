---
name: memory-fragment
description: 管理 fragments.json 用户碎片记忆。当需要添加、搜索、管理碎片记忆时使用此技能。
---

# Memory Fragment Skill

管理 fragments.json 用户碎片记忆，模拟人类记忆特性：随机性、模糊检索、遗忘与整合。

## 存储位置

- 碎片数据：`C:\Users\Lain\.config\opencode\fragments.json`
- 同义词映射：`C:\Users\Lain\.config\opencode\associations_map.json`

## 核心概念

| 概念 | 说明 |
|------|------|
| **碎片 (Fragment)** | 一条独立的记忆内容，不超过50字的一句话总结 |
| **Layer** | 层级：deep（深层重要）/ surface（表层次要） |
| **Weight** | 权重：记忆强度，0.0-1.0 |
| **associations** | 关联关键词数组，用于搜索匹配和同义词扩展 |

## 工具列表

### memory_fragment_add

添加记忆碎片。associations 将自动从 content 提取，同时自动调用 synonym_map_add 将中英文关键词添加到同义词映射表。

```
# 参数
content: string                    # 记忆内容（一句话总结）
associations?: string[]             # 关联词数组（可选，自动提取）
category?: string                  # 分类（默认 general）
layer?: surface | deep             # 层级（默认 surface）
source?: explicit | inferred      # 来源（默认 explicit）
```

**associations 规则**：
- 必须包含：原词、中英文变体、同义词、缩写
- 例如：VSCode → ["VSCode", "编辑器", "IDE", "编程"]
- 刀剑神域 → ["刀剑神域", "SAO", "动漫", "动画"]

❌ **错误示例**：
```
memory_fragment_add content="VSCode是编程工具"
```

✅ **正确示例**：
```
memory_fragment_add content="VSCode是编程工具" associations=["VSCode", "编辑器", "IDE", "编程", "开发"]
memory_fragment_add content="刀剑神域SAO是经典日漫" associations=["刀剑神域", "SAO", "动漫", "日漫", "经典"]
```

### memory_fragment_search

搜索记忆碎片（带温度随机性和同义词扩展）。

```
# 参数
query: string              # 查询内容
temperature?: number       # 温度 0.0-1.0（默认 0.5）
limit?: number            # 返回数量（默认 5）
layer?:                   # 层级过滤：surface / deep
weight_threshold?: number  # 最低权重过滤（默认 0.2）
```

**匹配逻辑**：
- content 匹配：权重 1.0
- associations 匹配：权重 0.8
- 支持同义词扩展查询

**温度说明**：
- 低温度（0.0-0.3）：确定性高，只返回高权重碎片
- 中温度（0.4-0.6）：平衡模式
- 高温度（0.7-1.0）：随机性高，可能返回低权重碎片

**使用示例**：
```
memory_fragment_search query="Lain"
memory_fragment_search query="VSCode" temperature=0.9 limit=3
```

### memory_fragment_stats

查看碎片统计信息。

```
# 参数
无
```

**返回**：
- total: 碎片总数
- by_layer: 各层级数量
- by_category: 各分类数量
- avg_weight: 平均权重
- avg_recall_frequency: 平均召回频率
- unused_over_30days: 超过30天未使用的碎片数

**使用示例**：
```
memory_fragment_stats
```

### memory_fragment_view

查看碎片列表。

```
# 参数
category?: string  # 分类过滤
layer?: string     # 层级过滤
```

**使用示例**：
```
memory_fragment_view
memory_fragment_view layer="deep"
```

### memory_fragment_delete

删除碎片。

```
# 参数
id: string  # 碎片ID
```

**使用示例**：
```
memory_fragment_delete id="frag_xxx"
```

### memory_fragment_update

更新碎片内容或属性。

```
# 参数
id: string                          # 碎片ID（必需）
content?: string                    # 新记忆内容
category?: string                   # 新分类
layer?: "surface" | "deep"          # 新层级
weight?: number                     # 新权重 (0.0-1.0)
source?: "explicit" | "inferred"    # 新来源
```

**使用示例**：
```
memory_fragment_update id="frag_xxx" content="更新后的内容"
memory_fragment_update id="frag_xxx" layer="deep" weight=0.8
```

### memory_fragment_compact

整理碎片数据库。

```
# 参数
mode?: "gentle" | "auto" | "aggressive"  # 整理模式
unused_days?: number                       # 超过多少天未使用（默认30）
```

**整理模式**：
- **gentle**：只清理 weight < 0.1 且长期未使用的碎片
- **auto**：gentle + 清理创建超过 60 天且从未召回的碎片
- **aggressive**：同 auto

**使用示例**：
```
memory_fragment_compact mode="gentle"
memory_fragment_compact mode="aggressive" unused_days=60
```

### memory_fragment_diagnosis

诊断记忆状态，输出配置文件、碎片统计、饼图和AI建议。

```
# 参数
无
```

**返回**：
- 配置文件信息（last_compact, cold_data_days等）
- 当前碎片总数和状态
- 按 category 分类的 ASCII 饼图
- AI 清理建议

**使用场景**：
- 用户询问"记忆状态"、"记忆诊断"时
- 需要了解当前碎片数量和整理时机时

**使用示例**：
```
memory_fragment_diagnosis
```

### synonym_map_view

查看同义词映射表。

```
# 参数
无
```

**使用示例**：
```
synonym_map_view
```

### synonym_map_add

添加同义词映射。

```
# 参数
key: string            # 关键词
synonyms: string[]     # 同义词数组
```

**使用示例**：
```
synonym_map_add key="VSCode" synonyms=["编辑器", "IDE", "编程工具"]
```

### synonym_map_delete

删除同义词映射。

```
# 参数
key: string  # 要删除的关键词
```

**使用示例**：
```
synonym_map_delete key="VSCode"
```

### synonym_map_update

更新同义词映射（完全替换）。

```
# 参数
key: string            # 关键词
synonyms: string[]     # 新的同义词数组（完全替换）
```

**使用示例**：
```
synonym_map_update key="VSCode" synonyms=["编辑器", "IDE", "开发工具", "代码编辑器"]
```

## 使用场景

### 场景1：用户明确要求添加碎片

```
你: 添加碎片: 我喜欢古典音乐
AI: 调用 memory_fragment_add content="用户喜欢古典音乐" associations=["古典音乐","音乐","爱好"]
```

### 场景2：需要查询碎片

```
你: 我之前提到过什么爱好？
AI: 调用 memory_fragment_search query="爱好"
```

### 场景3：需要整理碎片

```
你: 帮我整理记忆碎片
AI: 调用 memory_fragment_compact mode="auto"
```

### 场景4：管理同义词

```
你: 添加同义词映射
AI: 调用 synonym_map_add key="..." synonyms=[...]
```

### 场景5：诊断记忆状态

```
你: 查看记忆状态
AI: 调用 memory_fragment_diagnosis
       ↓
AI: [输出完整诊断报告，包含碎片数量、饼图、建议]
```

## 与 memory Manager 的区别

| 特性 | memory-manager | memory-fragment |
|------|---------------|-----------------|
| 存储文件 | memory.json | fragments.json + associations_map.json |
| 数据类型 | 结构化配置（偏好、规则） | 碎片化记忆（用户兴趣、习惯等） |
| 注入方式 | 每次强制注入 system prompt | 按需 AI 调用 |
| 检索方式 | 简单字符串匹配 | 温度随机 + 同义词扩展 |
| 记忆特性 | 确定性 | 模拟人类遗忘/模糊 |

## 重要提示

- associations 必须完整传入，否则影响搜索功能
- 添加碎片时会自动分析并创建中英文同义词映射
- 温度高时召回结果可能更多样化，也可能有更多"噪音"
- 长期不使用的碎片会被整理删除
- layer=deep 用于重要信息，layer=surface 用于一般信息