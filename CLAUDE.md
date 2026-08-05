# CLAUDE.md

BitSoul AI Manager — 基于大模型的多 Agent 自动化项目管理平台。

## 项目状态

当前处于 **方案设计阶段**，尚未开始编码。所有开发必须在 PRD 与技术方案（见 docs/）经管理员审核通过后按优先级进行。

## 目录约定

```
/
├── CLAUDE.md                 # 本文件：项目规范，改规范先改这里
├── TODO.md                   # 任务进度跟踪（全局 CLAUDE.md 规定的格式）
├── docs/
│   ├── PRD.md                # 产品需求文档（唯一产品事实来源）
│   ├── TECH_DESIGN.md        # 技术方案设计（唯一技术事实来源）
│   ├── decisions/            # 重要决策记录（ADR），一事一文件：NNN-标题.md
│   └── api/                  # API 契约文档（开发启动后生成）
├── src/                      # Next.js 应用源码（开发启动后创建）
├── prisma/                   # 数据库 schema 与迁移
└── scripts/                  # 运维/部署脚本
```

- 需求变更：先改 `docs/PRD.md`，再改代码
- 架构变更：先在 `docs/decisions/` 落 ADR，再改 `docs/TECH_DESIGN.md`，最后动代码
- 原始需求文档 `BitSoulAIManager需求说明书.docx` 只读存档，不再更新

## 技术栈（已确认）

- **前端/后端**：Next.js（App Router）+ TypeScript，单仓全栈
- **数据库**：PostgreSQL + Prisma ORM；**队列/缓存**：Redis + BullMQ
- **部署**：阿里云服务器（Docker Compose，绑 127.0.0.1 端口 + 现有 Nginx 反代），域名 https://www.bitsouls.cn（平台走 pm. 子域或 /pm 前缀），与 minsheng-worklog-server 同机共存
- **Git 中心仓库**：GitHub（平台仓库 `wangzhi43/BitsoulAIManager`，公开；决策见 docs/decisions/001）
- **大模型**：多供应商可配置（Anthropic 官方 SDK 为一等公民，DeepSeek/Qwen 等走 OpenAI 兼容适配层），API Key 加密存库、管理界面配置
- **微信接入**：OpenClaw 微信机器人（复用 BitSoulClaw 生态）+ 管理后台手动导入兜底

## 工程纪律（项目级）

- 语言：界面与文档中文，代码/命令/变量/commit message 英文
- 分支模型：`main` ← `daily/YYYYMMDD` ← `feature/REQ-<id>`（详见 TECH_DESIGN）
- 验证命令（开发启动后生效）：
  - `npm run lint && npm run typecheck` — 每次改动后必跑
  - `npm test` — 涉及业务逻辑必跑
- 密钥一律走环境变量或平台加密配置表，禁止入库明文、入 commit、入日志
- 大模型调用一律经过 `src/lib/llm/` 的 provider 抽象层，禁止在业务代码中直连 SDK

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
