# StarMenory

[English](./README_EN.md) | 中文

<p align="center">
  <img src="docs/StarMenoryLOGO.png" alt="StarMenory" width="200" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="MIT">
  <img src="https://img.shields.io/github/stars/owofile/opencode-starmemory-plugins?style=social" alt="Stars">
  <img src="https://img.shields.io/github/forks/owofile/opencode-starmemory-plugins?style=social" alt="Forks">
  <img src="https://img.shields.io/github/last-commit/owofile/opencode-starmemory-plugins" alt="Last Commit">
</p>

**StarMenory** = Star + Memory — 持久化星之记忆

OpenCode 长期记忆插件与技能系统，让 AI 记住你的偏好、规则和项目上下文。

---

## 功能演示

| 自动记录相关记忆 | 手动查询记忆 |
|----------------|-------------|
| <img src="docs/自动记录相关记忆.gif" width="350"/> | <img src="docs/手动查询记忆演示.gif" width="350"/> |

---

## 一键安装

```
请帮我安装 v1.3.0 版本的 opencode-memory：https://github.com/owofile/opencode-starmemory-plugins/tree/main/v1.3.0
```

---

## v1.3.0 更新亮点

| 特性 | 说明 |
|------|------|
| 🔥 自动同义词映射 | 添加碎片时自动分析关键词并扩展同义词表 |
| 🔍 多词搜索支持 | 修复搜索算法，支持 "动漫 爱好 喜欢" 多词查询 |
| 🧠 智能关联提取 | 自动从内容中提取关联词存入 associations |
| 📊 完整工具链 | memory / memory_fragment / synonym_map 三大工具 |

---

## 版本说明

本仓库采用版本化文件夹结构，每个版本独立完整。

| 版本 | 说明 | 推荐场景 |
|------|------|----------|
| **v1.3.0** | 优化版，自动添加映射+修复搜索 | ⭐ **推荐最新版本** |
| **v1.2.0** | JSON碎片+同义词映射 | 完整功能 |
| **v1.1.0** | 增强版，SQLite 碎片化 | 随机检索 |
| **v1.0.0** | 原始版本，JSON 存储 | 稳定优先 |

各版本安装命令：
```
# v1.3.0 (推荐)
请帮我安装 v1.3.0 版本的 opencode-memory：https://github.com/owofile/opencode-starmemory-plugins/tree/main/v1.3.0

# v1.2.0
请帮我安装 v1.2.0 版本的 opencode-memory：https://github.com/owofile/opencode-starmemory-plugins/tree/main/v1.2.0

# v1.1.0
请帮我安装 v1.1.0 版本的 opencode-memory：https://github.com/owofile/opencode-starmemory-plugins/tree/main/v1.1.0

# v1.0.0
请帮我安装 v1.0.0 版本的 StarMenory：https://github.com/owofile/opencode-starmemory-plugins/tree/main/v1.0.0
```

---

## 目录结构

```
opencode-starmemory-plugins/
├── v1.3.0/                      # v1.3.0 优化版本（推荐）
│   ├── INSTALL.md               # 安装指南
│   ├── plugins/opencode-memory/ # 插件
│   ├── skills/
│   │   ├── memory-manager/      # 长期记忆技能
│   │   └── memory-fragment/     # 碎片记忆技能
│   ├── associations_map.json    # 同义词映射（空模板）
│   └── opencode.json            # 配置示例
│
├── v1.2.0/                      # v1.2.0 版本
├── v1.1.0/                      # v1.1.0 增强版本
├── v1.0.0/                      # v1.0.0 原始版本
│
├── docs/                        # 演示文件和Logo
│   ├── StarMenoryLOGO.png
│   ├── 自动记录相关记忆.gif
│   └── 手动查询记忆演示.gif
│
├── memory.json                  # 记忆模板
└── README.md
```

---

## License

MIT