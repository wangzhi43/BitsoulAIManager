# TODO.md

## 当前任务
BitSoul AI Manager 方案设计与评审：PRD + 技术方案已产出，等待管理员审核；审核通过后按里程碑 M1-M6 开发。

## 步骤
- [ ] M1 收尾：推送 GitHub（待管理员同意）、服务器部署冒烟（compose up + migrate + seed）、三项目 GitHub 仓库确认
- [ ] M2 需求流入与拆解：Ingest API / 聚合窗口 / 产品专家 Agent / 手动导入 / 确认流（手机端）
- [ ] M3 任务池与 Git 自动化：优先级 Agent / Agent API / daily+feature 分支自动化
- [ ] M4 测试闭环：测试专家 Agent / 测试池 / 报告入仓 / 自动审核
- [ ] M5 看板与收尾：三层看板 / 日报 / docs 自动写入 / 分支审查页 / LLM 配置页
- [ ] M6 微信打通：OpenClaw 插件 / 双向通道 / 端到端 MVP 验收（PRD §6）

## 已完成
- [x] 阅读需求说明书，调研三个待管理项目（BitSoulClaw / bitsoulofficial / minsheng-worklog-mp）
- [x] 与管理员确认四项关键决策：OpenClaw 微信接入、Next.js 全栈、云服务器+本地 Agent、多供应商模型
- [x] 建立项目规范 CLAUDE.md 与目录约定
- [x] 产出 docs/PRD.md v0.1、docs/TECH_DESIGN.md v0.1
- [x] 确认 Git（GitHub wangzhi43/BitsoulAIManager）与域名（bitsouls.cn），落 ADR-001，文档定稿
- [x] M1 基础设施：Next.js 16 脚手架 / Prisma schema 全量 19 表 + 初始迁移 / 管理员 JWT + Agent token 鉴权 / LLM 多供应商抽象层 / BullMQ worker 骨架 + 5 个定时任务 / Docker Compose + Dockerfile / seed 脚本 / 登录页 + 全局看板骨架；typecheck、build、无库冒烟全部通过

## 备注
- 微信机器人基于个人微信，有封号风险，已在方案中设手动导入兜底
- M2-M5 期间用手动导入跑通全流程，微信通道在 M6 收尾接入
- 开发前必须先解决 TECH_DESIGN §12 的待确认项 ①（Gitea vs GitHub）与 ②（域名/HTTPS），其余可开发中并行确认
