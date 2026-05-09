# StarMenory

<p align="center">
  <img src="docs/StarMenoryLOGO.png" alt="StarMenory" width="120" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="MIT">
  <img src="https://img.shields.io/github/stars/owofile/opencode-starmemory-plugins?style=social" alt="Stars">
  <img src="https://img.shields.io/github/last-commit/owofile/opencode-starmemory-plugins" alt="Last Commit">
</p>

<p align="center"><strong>StarMenory = Star + Memory — 持久化星之记忆</strong></p>

<p align="center">OpenCode 长期记忆插件与技能系统，让 AI 记住你的偏好、规则和项目上下文。</p>

---

<p align="center">
  <img src="docs/自动记录相关记忆.gif" alt="自动记录演示" width="800"/>
  <img src="docs/手动查询记忆演示.gif" alt="手动查询演示" width="800"/>
</p>

---

## 安装

```
请帮我安装 v1.3.0 版本的 opencode-memory：https://github.com/owofile/opencode-starmemory-plugins/tree/main/v1.3.0
```

---

## v1.3.0 更新亮点

- **自动同义词映射**：添加碎片时自动分析关键词并扩展同义词表
- **多词搜索支持**：支持 "动漫 爱好 喜欢" 多词组合查询
- **智能关联提取**：自动从内容中提取关联词存入 associations
- **完整工具链**：memory / memory_fragment / synonym_map 三大工具

---

## 版本说明

| 版本 | 说明 |
|------|------|
| v1.3.0 | 优化版，自动添加映射+修复搜索（推荐） |
| v1.2.0 | JSON碎片+同义词映射 |
| v1.1.0 | 增强版，SQLite 碎片化 |
| v1.0.0 | 原始版本，JSON 存储 |

---

## 目录结构

```
opencode-starmemory-plugins/
├── v1.3.0/                      # 推荐版本
│   ├── INSTALL.md
│   ├── plugins/opencode-memory/
│   ├── skills/
│   │   ├── memory-manager/
│   │   └── memory-fragment/
│   ├── associations_map.json
│   └── opencode.json
├── v1.2.0/
├── v1.1.0/
├── v1.0.0/
├── docs/
│   ├── StarMenoryLOGO.png
│   ├── 自动记录相关记忆.gif
│   └── 手动查询记忆演示.gif
└── README.md
```

---

## License

MIT