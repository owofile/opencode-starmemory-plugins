---
name: memory-fragment
description: 碎片化长期记忆系统。当需要添加、搜索、管理记忆碎片时使用此技能。
---

# Memory Fragment Skill

碎片化长期记忆系统，模拟人类记忆特性：随机性、模糊检索、遗忘与整合。

## 核心概念

| 概念 | 说明 |
|------|------|
| **碎片 (Fragment)** | 一条独立的记忆内容，不超过50字的一句话总结 |
| **Layer** | 层 级：deep（深层重要）/ surface（表层次要） |
| **Weight** | 权重：记忆强度，0.0-1.0 |

## 工具列表

### memory_fragment_add

⚠️ **【强制要求】添加碎片时必须分析语义并传入完整的 associations 数组！**

不传 associations 将导致关联词丢失，影响搜索功能。

```
# 参数
content: string                    # 记忆内容（一句话总结）
associations: string[]             # ⚠️ 必须：关联词数组
category?: string                  # 分类（可选）
layer?: surface | deep             # 层级（可选）
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

**自动行为（v2.0.0 新增）**：
- 添加碎片时自动分析 associations 中的中英文关键词
- 自动调用 synonym_map_add 将英文词和中文词配对添加到同义词映射表

### memory_fragment_search

搜索记忆碎片（带温度随机性）。

```
# 参数
query: string              # 查询内容
temperature?: number       # 温度 0.0-1.0（默认 0.5）
limit?: number            # 返回数量（默认 5）
layer?:                   # 层级过滤：surface / deep
weight_threshold?: number  # 最低权重过滤（默认 0.2）
```

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
- **gentle**：只清理低权重且长期未使用的碎片
- **auto**：标准整理
- **aggressive**：深度清理，删除更多

**使用示例**：
```
memory_fragment_compact mode="gentle"
memory_fragment_compact mode="aggressive" unused_days=60
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

## 与 memory Skill 的区别

| 特性 | memory (原有) | memory-fragment (新) |
|------|-------------|---------------------|
| 存储格式 | JSON 结构化 | SQLite 碎片化 |
| 注入方式 | 每次强制注入 | 按需 AI 调用 |
| 检索方式 | 简单字符串匹配 | 温度随机 + 关联传播 |
| 记忆特性 | 确定性 | 模拟人类遗忘/模糊 |

## 重要提示

- associations 必须完整传入，否则影响搜索功能
- 温度高时召回结果可能更多样化，也可能有更多"噪音"
- 长期不使用的碎片会被整理删除
- layer=deep 用于重要信息，layer=surface 用于一般信息