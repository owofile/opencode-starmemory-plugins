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
| **Layer** | 层级：deep（深层重要）/ surface（表层次要） |
| **Weight** | 权重：记忆强度，0.0-1.0 |
| **热数据** | 存储在 fragments.json 中的活跃碎片 |
| **冷数据** | 归档到 SQLite 的历史碎片 |

## 核心机制

### 记忆循环

```
用户添加 → fragments.json → 普通查询/深度查询 → 定期整理 → SQLite归档
                                              ↑                          ↓
                                              └─── 需要时恢复 ←────────┘
```

### 冷热判定

| 模式 | 条件 |
|------|------|
| gentle | 60天前创建 且 访问<2次 |
| auto | 30天未访问 或 60天前创建 |
| aggressive | 15天未访问 或 45天前创建 或 访问<3次 |

## 工具列表

### memory_fragment_add

⚠️ **【强制要求】添加碎片时必须分析语义并传入完整的 associations 数组！**

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

### memory_fragment_search

搜索记忆碎片（只查热数据 JSON）。

```
# 参数
query: string              # 查询内容
limit?: number            # 返回数量（默认 5）
```

**使用示例**：
```
memory_fragment_search query="Lain"
memory_fragment_search query="VSCode" limit=3
```

### memory_fragment_deep_search

深度搜索，同时查 JSON 热数据和 SQLite 归档，找到后自动恢复。

```
# 参数
query: string              # 查询内容
limit?: number            # 返回数量（默认 5）
```

**适用场景**：
- 普通搜索找不到时
- 需要找回很久以前的记忆时

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

### memory_fragment_stats

查看碎片统计信息。

**返回**：
- total: 碎片总数
- by_layer: 各层级数量
- by_category: 各分类数量
- avg_weight: 平均权重
- unused_over_30days: 超过30天未使用的碎片数

### memory_fragment_update

更新碎片内容或属性。

```
# 参数
id: string                          # 碎片ID（必需）
content?: string                    # 新记忆内容
category?: string                   # 新分类
layer?: "surface" | "deep"          # 新层级
weight?: number                    # 新权重 (0.0-1.0)
```

### memory_fragment_delete

删除碎片。

```
# 参数
id: string  # 碎片ID
```

### memory_fragment_compact

整理碎片数据库，将冷数据归档到 SQLite。

```
# 参数
mode?: "gentle" | "auto" | "aggressive"  # 整理模式
```

### memory_fragment_archive_status

查看归档状态和建议。

```
无参数
```

返回：当前碎片数量、最大容量、冷热数据阈值、上次整理时间、建议

### memory_fragment_diagnosis

诊断记忆状态，输出配置文件、碎片统计、饼图和AI建议。

```
无参数
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

### memory_fragment_restore

从 SQLite 归档恢复碎片。

```
# 参数
action: "list" | "id" | "query"  # 操作类型
param?: string                   # ID 或关键词
limit?: number                   # 返回数量
```

### memory_manual

【说明书工具】查询记忆插件的使用说明、工具用法、架构逻辑。

```
# 参数
keyword?: string  # 查询关键词
```

当用户询问插件结构、工具使用时，AI 应主动使用此工具。

## 使用场景

### 场景1：用户明确要求添加碎片

```
你: 添加碎片: 我喜欢古典音乐
AI: 调用 memory_fragment_add content="用户喜欢古典音乐" associations=["古典音乐","音乐","爱好"]
```

### 场景2：普通搜索找不到

```
你: 我之前提到过什么爱好？
AI: 调用 memory_fragment_search query="爱好"
      ↓ 找不到
     调用 memory_fragment_deep_search query="爱好"
```

### 场景3：用户询问如何使用

```
你: 这个记忆插件怎么用？
AI: 调用 memory_manual keyword="工具列表"
```

### 场景4：需要整理碎片

```
你: 帮我整理记忆碎片
AI: 调用 memory_fragment_compact mode="auto"
```

### 场景5：诊断记忆状态

```
你: 查看记忆状态
AI: 调用 memory_fragment_diagnosis
```

### 场景6：需要了解碎片情况

```
你: 我的碎片记忆现在有多少条？
AI: 调用 memory_fragment_diagnosis
       ↓
AI: [输出完整诊断报告，包含碎片数量、饼图、建议]
```

## 与 memory Skill 的区别

| 特性 | memory (长期记忆) | memory-fragment (碎片记忆) |
|------|------------------|--------------------------|
| 存储格式 | JSON 结构化 | JSON 热数据 + SQLite 冷数据 |
| 注入方式 | 每次强制注入 | AI 按需调用 |
| 检索方式 | 简单字符串匹配 | 温度随机 + 关联扩展 |
| 记忆特性 | 确定性 | 模拟人类遗忘/模糊 |

## 重要提示

- associations 必须完整传入，否则影响搜索功能
- 长期不使用的碎片会被整理归档到 SQLite
- 被归档的碎片可以用 deep_search 恢复
- layer=deep 用于重要信息，layer=surface 用于一般信息