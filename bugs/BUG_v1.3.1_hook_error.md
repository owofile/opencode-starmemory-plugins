# BUG Report - v1.3.1 Hook 注入报错

## 问题描述

部分设备安装 v1.3.1 后，对话时直接报错：
```
invalid chat setting (2013)
```

## 复现条件

- 设备 A（本机）：✅ 正常
- 设备 B（报错）：❌ 报错
- 版本相同：都是 opencode-ai@1.14.43

## 定位信息

1. **触发时机**：对话后（不是启动时）
2. **问题 hook**：`experimental.chat.system.transform`
3. **验证方法**：注释掉 `output.system.push(ctx)` 后正常
4. **复现失败**：无法在本地稳定复现，仅部分设备出现

## 可能原因（未确认）

1. **文件传输编码问题**
   - 跨设备复制 index.js 时可能引入行尾符或编码问题

2. **memory.json 内容问题**
   - 可能包含特殊字符导致注入失败

3. **OpenCode 配置差异**
   - opencode.json 可能有细微差异

## 临时解决方案

注释掉 `experimental.chat.system.transform` 中的注入逻辑：

```javascript
"experimental.chat.system.transform": async (chatInput, output) => {
    // const mem = loadMemory();
    // const ctx = formatMemoryForPrompt(mem);
    // if (ctx) output.system.push(ctx);
},
```

影响：自动注入记忆失效，用户需手动查询记忆

## 待解决

- [ ] 找出根本原因
- [ ] 添加 hook 错误处理，失败时 graceful fallback
- [ ] 简化 NUDGE_MESSAGE 中的特殊字符
- [ ] 增加调试日志输出

## 补充信息

如需进一步调试，需要用户提供：
1. 报错设备的完整 memory.json 内容
2. index.js 文件大小和 MD5
3. 完整的 OpenCode 版本号

---

创建时间：2026-05-10
版本：v1.3.1