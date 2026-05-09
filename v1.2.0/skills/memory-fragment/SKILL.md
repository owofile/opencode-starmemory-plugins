---
name: memory-fragment
description: 碎片化长期记忆系统。当需要添加、搜索、管理记忆碎片时使用此技能。
---

# Memory Fragment Skill

碎片化长期记忆系统，模拟人类记忆特性：随机性、模糊检索、遗忘与整合。

## 核心概念

| 概念 | 说明 |
|------|------|
| **碎片 (Fragment)** | 一条独立的记忆内容，一句话总结 |
| **Layer** | 层级：deep（深层重要）/ surface（表层次要） |
| **Weight** | 权重：记忆强度，0.0-1.0 |
| **associations** | 关联词，自动从content提取 + 同义词扩展 |

## 工具列表

### memory_fragment_add

添加记忆碎片。associations会自动从content提取（中文字词组、英文、同义词扩展）。

```
# 参数
content: string                    # 记忆内容
associations?: string[]             # 关联词（可选，不传则自动提取）
category?: string                  # 分类
layer?: "surface" | "deep"         # 层级
```

**associations 自动提取规则**：
- 中文词组（≥2字）
- 英文单词
- associations_map.json 中的同义词扩展

### memory_fragment_search

搜索记忆碎片（带温度随机性和同义词扩展）。

```
# 参数
query: string              # 查询内容
temperature?: number       # 温度 0.0-1.0（默认 0.5）
limit?: number            # 返回数量（默认 5）
layer?: "surface" | "deep" # 层级过滤
weight_threshold?: number  # 最低权重（默认 0.2）
```

**温度说明**：
- 低温度（0.0-0.3）：确定性高
- 中温度（0.4-0.6）：平衡模式
- 高温度（0.7-1.0）：随机性高

### memory_fragment_view

查看碎片列表。

```
# 参数
category?: string  # 分类过滤
layer?: string     # 层级过滤
```

### memory_fragment_update

更新碎片内容或属性。

```
# 参数
id: string                          # 碎片ID
content?: string                    # 新内容
category?: string                   # 新分类
layer?: "surface" | "deep"          # 新层级
weight?: number                     # 新权重
source?: "explicit" | "inferred"    # 来源
```

### memory_fragment_delete

删除碎片。

```
# 参数
id: string  # 碎片ID
```

### memory_fragment_stats

查看碎片统计。

```
返回：total, by_layer, by_category, avg_weight, avg_recall_frequency, unused_over_30days
```

### memory_fragment_compact

整理碎片数据库。

```
# 参数
mode?: "gentle" | "auto" | "aggressive"  # 模式
unused_days?: number                       # 超过多少天未使用
```

- **gentle**：只清理低权重+长期未使用
- **auto**：标准整理
- **aggressive**：深度清理

## 同义词映射管理

### synonym_map_view

查看同义词映射表。

### synonym_map_add

添加同义词映射。

```
# 参数
key: string              # 关键词
synonyms: string[]       # 同义词列表
```

### synonym_map_update

更新同义词映射（完全替换）。

```
# 参数
key: string              # 关键词
synonyms: string[]       # 新同义词列表
```

### synonym_map_delete

删除同义词映射。

```
# 参数
key: string  # 要删除的关键词
```

## 使用示例

```
# 添加碎片
memory_fragment_add content="我喜欢刀剑神域" layer="deep"

# 搜索碎片
memory_fragment_search query="刀剑神域"

# 查看列表
memory_fragment_view layer="deep"

# 更新碎片
memory_fragment_update id="frag_xxx" weight=0.8

# 添加同义词
synonym_map_add key="SAO" synonyms=["刀剑神域", "Sword Art Online"]

# 整理碎片
memory_fragment_compact mode="auto"
```

## 重要提示

- associations会自动提取，无需手动传入
- 温度高时召回结果更随机
- 长期不使用的碎片会被整理删除
- associations_map.json支持查询时同义词扩展