# StarMemory P5 分析：问题 / 优化 / 新功能候选

> 日期：2026-11-07 · 基于 P0–P4 完成后全貌审视 · 目的：找值得优化的部分与新功能，按优先级推进

---

## 一、现状总览（P0–P4 已完成）

| 阶段 | 内容 | 状态 |
|---|---|---|
| P0 | 召回触发修复（浅检索 no-candidates）/ 热重载可靠 / 配额保留外部风险 | ✅ |
| P1 | log 重设计（memory-plugin.log 统一诊断 + logRecallHook 双写） | ✅ |
| P2-7 | /memory 召回历史 Tab 分栏（键盘阅读 + 滚动视口） | ✅ |
| P2-9 | 触发可靠性兜底（写 try/catch + 卡片轮询 existsSync） | ✅ |
| P2-10 | AI 召回路径切 context 钩子（内容/显示分离） | ❌ 关闭（API 不可行） |
| P3 | 召回内容质量（佐证加权排序 + 内容近似去重） | ✅ |
| P4 | 碎片质量诊断 + 分类归一化（15→5 分类） | ✅ |

**当前能力**：23 个工具（memory / memory_fragment_* / memory_recall_* / synonym_map_* / memory_manual / memory_sqlite）+ 5 个 TUI Tab（overview / list / recall / agents，recall 按 auto_recall 门控）+ composer.top 召回卡片 + sidebar 状态 chip。

**数据现状**（fragments.json 29 碎片）：inferred 25 / confirmed 4；consolidated 13 / transient 16；分类已归一化 5 类（project 15 / preference 2 / godot 2 / technical 5 / environment 5）。

---

## 二、已知限制（不可行项，不再尝试）

1. **synthetic 刷屏**：opencode V2 当前 API 下，prompt `ctx.session.synthetic` 和 context `event.messages.push` 都会进消息流 → "内容/显示完全分离"不可行（P2-10 实测定稿）。
2. **消息流 markdown 不渲染**（安全设计）→ 消息流内可折叠卡片不可能。
3. **slot 属性动画不响应**（渲染器边界）→ 卡片稳定全显。
4. **配额隐性依赖**：GLM-5.2 tpm/rpm 低，召回依赖请求成功。
5. **热重载 ≠ 干净重启**：验证前须完全退出重开。

---

## 三、问题诊断（数据侧）

| 问题 | 证据 | 性质 |
|---|---|---|
| **inferred 占比高** | 25/29 是 inferred（仅 4 confirmed）| 记忆可信度低 → P3 佐证加权后优先级低 |
| **采集分类碎片化** | P4 发现 15 个近似分类（已归一 5）| AI 加记忆时随意打分类，未来会再碎 |
| **死记忆** | 13/29 从未被使用（access_count=0）| 自然（一次性记录不再触发），靠 compact 归档处理 |
| **transient 多** | 16/29 未巩固 | 自然（<7 天或未使用），巩固机制正常，非 bug |

---

## 四、优化候选（按价值/风险排序）

| # | 候选 | 价值 | 风险 | 说明 |
|---|---|---|---|---|
| **O1** | **记忆可信度提升**：TUI list Tab 加"标记确认"操作（inferred→user_confirmed）+ 采集时分类规范化 | 高（直接受益 P3 佐证加权） | 低（数据元数据 + TUI 操作） | 用户主动确认记忆更可信；防未来分类再碎片化 |
| O2 | 召回卡片增强：显示佐证标记/来源分类 | 中 | 低 | 用户感知召回可信度 |
| O3 | 记忆导出/导入（备份） | 中 | 低 | 安全备份，防止误删/损坏 |
| O4 | 死记忆识别：list Tab 标记未使用/冷记忆 | 低 | 低 | 辅助用户清理 |
| O5 | P2-8 toast（召回即时提示） | 低（已暂缓） | 低 | 与卡片同 2s 轮询，价值低 |

---

## 五、新功能候选

| # | 功能 | 价值 | 说明 |
|---|---|---|---|
| N1 | TUI list Tab 搜索/过滤（关键词 + 分类） | 中 | 碎片多时快速定位 |
| N2 | 召回测试（恢复 /recall-test 或 /memory 内测试按钮） | 中 | 验证召回链路（P0 曾停用） |
| N3 | 记忆统计仪表板增强（趋势/分类占比图） | 低 | overview 已有 readout |
| N4 | 同义词可视化（mesh Tab 关联浏览增强） | 低 | 已有部分 |

---

## 六、推荐实施顺序

1. **O1 记忆可信度提升**（高价值、低风险、直接受益 P3）——✅ 已完成（2026-11-07，commit `055fe13` 已发布）：TUI `e` 菜单"标记确认"（inferred→user_confirmed）+ 采集分类规范化（CATEGORY_ALIAS）
2. O2 召回卡片增强（中价值、低风险）——✅ 已完成（2026-11-07，commit `3496b85` 已发布）：卡片可信度汇总（可信 M/N）+ 展开项置信度/分类显示
3. O3 记忆导出/导入（备份安全）——✅ 已完成（2026-11-07，commit `d02b4d6` 已发布）：`memory_export` 备份 + `memory_import`（merge 去重 / replace 显式，长期记忆不自动覆盖）
4. N1 TUI 搜索/过滤（体验）——✅ 已完成（2026-11-07，commit `d8f6fdb` 已发布）：list Tab 分类过滤 chips（点击过滤/再点清除，selectIndex 自动 clamp）；关键词搜索复用 `/memory <关键词>`

> 原则：先做"记忆侧质量"（O1），因为 P3 刚做了"召回侧质量"，记忆侧是数据源，可信度直接影响召回质量。O2–O3 是锦上添花，N1 是体验。
