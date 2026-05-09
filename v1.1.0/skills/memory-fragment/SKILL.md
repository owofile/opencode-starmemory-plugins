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
| **Temperature** | 温度：控制召回随机性，0.0-1.0 |
| **Weight** | 权重：记忆强度，0.0-1.0 |

## 工具列表

### memory_fragment_add

添加记忆碎片。

```
# 参数
content: string      # 记忆内容（一句话总结，不超过50字）
associations?:      # 关联词（可选，系统会自动从content提取）
category?:           # 分类（可选，默认 general）
layer?:             # 层级：surface（默认）/ deep
source?:            # 来源：inferred（默认）/ explicit
```

**使用示例**：
```
memory_fragment_add content="用户叫Lain"
memory_fragment_add content="我喜欢用VSCode" layer="deep"
```

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

### 场景1：AI检测到需要记忆

当用户提到重要信息时，AI主动调用 `memory_fragment_add`：

```
你: 我最近在做一个React项目
AI: 调用 memory_fragment_add content="用户正在做React项目"
```

### 场景2：需要查询上下文

当AI需要回忆相关信息时：

```
你: 我之前在做什么项目？
AI: 调用 memory_fragment_search query="项目"
```

### 场景3：数据库膨胀

当碎片过多时整理：

```
你: 我的记忆碎片太多了，帮我整理一下
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

- 碎片内容应在50字以内
- associations 会自动从 content 提取（直接使用 content 本身）
- 温度高时召回结果可能更多样化，也可能有更多"噪音"
- 长期不使用的碎片会被整理删除