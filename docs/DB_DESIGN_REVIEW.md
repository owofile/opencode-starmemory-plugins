# StarMemory 数据库设计完善度评估

> 日期：2026-11-07 · 基于 fragments.json 数据 + index.js 实现 + schema-classification.md 设计文档对照 · 目的：评估设计-实现一致性，找出偏差并修复

---

## 一、评估结论：**设计成熟、落地七成（≈72/100）**

| 维度 | 分 | 说明 |
|---|---|---|
| 架构设计 | 90 | 分层存储（JSON 活跃 + SQLite 冷归档）、生产者/消费者分离（核心产字段，自动召回只读）、source vs source_type 语义区分 |
| 字段完备性 | 85 | 13 个核心分类字段分 4 组（来源/类型时效/巩固/温度），覆盖记忆完整生命周期 |
| 实现-设计一致性 | 65 | **stability bug 是主要扣分**（温度永不衰减） |
| 数据质量 | 70 | 佐证覆盖 48%（O1b 后提升），分类归一化 5 类，consolidation 健康 |
| 端到端验证 | 55 | 召回/检索/分类验证充分，但**归档层从未跑通** |

---

## 二、发现的问题（按严重度）

### 🔴 BUG-1：温度永不衰减（stability bug）
```
line 436: if (!f.stability) f.stability = 0.7;   // ❌ 判断有误
```
懒迁移 `backfillFragment` 给所有碎片补 `stability: 1.0`（truthy）→ `!f.stability` 恒 false → 巩固时**永远不降 stability**。
结果 `computeActivation` 里 `exp(-0.5×(1-1.0)×天)=1`，温度只升温不衰减，冷记忆闸门形同虚设。
数据证实：**29/29 碎片 stability=1.0 / decay_rate=0.5**（全默认，无分化）。

### 🟡 偏差-2：类型分化未落地
Schema 文档承诺梦想家按 `memory_type` 分化 stability/decay_rate，但实现只对 `expires_at` 做过期处理，无按类型分化衰减。且因 `ttl_policy` 全 none，过期分支也不触发。

### 🟡 偏差-3：归档层未端到端验证
`fragment_archive.db` 不存在（从未跑 compact）。29 碎片、13 条死记忆未到归档线合理，但 compactor/restorer/deep-search 的 SQLite 链路从未实际跑通。

> **✅ 修正（2026-11-07）**：`fragment_archive.db` 实际存在于 `plugins/opencode-memory/external/`（32KB，last_compact 2026-08-24），归档层**跑通过**（早前查错路径）。本次实测 auto compact（归档 1 条 spider2 背面漩涡 shader）+ deep-search "shader" 查回 + restore 恢复到 JSON（source="archive"）——**插入/查询/恢复链路完整工作**。原评估"55 分端到端验证"应修正为**归档层已验证，召回/检索/分类/归档四链路均通**。

### 🔴 偏差-4（新发现）：归档 DB 在插件安装目录
`fragment_archive.db` 路径 = `plugins/opencode-memory/external/`（4 个外部脚本统一）。这是**代码/安装目录**，不是用户 config 目录 → **更新/重装插件会丢归档数据**（fragments.json/memory.json 在 `.config/opencode/` 安全，归档 DB 不安全）。应移至 `config/opencode/fragment_archive.db`（与 fragments.json 同层）。

> **✅ 已修复（commit `ec8fcb3`）**：4 个外部脚本 DB_PATH 统一改 `config/opencode/fragment_archive.db`；本地数据已迁移（copy 验证 MD5 SAME + 删旧源）；新路径验证工作正常（archive_status + deep-search 无 error）。**归档数据现在与 fragments.json 同层，插件更新/重装不再丢归档**。

### 🟡 偏差-5（新发现）：deep-search 归档查询整句 LIKE 脆弱
`searchInArchive` 用 `content LIKE '%<整句query>%'`——query 含空格/停顿词时整句不匹配（实测 `spider2 背面漩涡 shader 架构` 0 命中，因 content 中"最终"插在中间）。单词查询（`shader`）正常命中。应改分词 LIKE（OR 多个词）。低优先级。

---

## 三、修复计划（按优先级）

1. **修 BUG-1 + 补类型分化**：加 `TYPE_DECAY` 分化表（semantic 慢衰减 → episodic 快衰减），巩固时用 `stability === undefined || === 1.0` 判断（默认伪造值视为未设置），按 memory_type 设 stability/decay_rate —— ✅ 已完成（commit `d1e28ab`）
2. **一次性迁移 `migrateDecayParams`**：现有碎片按类型补正确衰减参数，温度衰减立即生效 —— ✅ 已完成（热重载实测 29 条全部分化）
3. **实测 compact**：验证归档层 SQLite 链路端到端（fragment_archive.db 建表/列迁移/插入/恢复）—— ✅ 已完成（实测 auto 归档 1 条 + deep-search 查回 + restore 恢复，链路完整；**偏差-3 修正**：归档层本就验证过 8/24）

> **待处理**：~~偏差-4 归档 DB 移至 config 目录~~（✅ 已修复 commit `ec8fcb3`）；偏差-5 deep-search 整句 LIKE 改分词（低优先级）

---

## 四、TYPE_DECAY 分化设计（修复依据）

| memory_type | stability | decay_rate | 语义 |
|---|---|---|---|
| semantic | 0.8 | 0.3 | 长期保留、慢衰减 |
| preference | 0.7 | 0.4 | 偏好较稳定 |
| procedure | 0.6 | 0.5 | 流程易过时 |
| episodic | 0.5 | 0.6 | 事件最易衰减 |

> stability=1.0（永不衰减）不再作为巩固后的默认——改为按类型真实衰减。semantic 从 1.0→0.8 开始慢衰减是**设计意图**（长期保留而非永存），非 bug。
