# TODO.md

## 当前任务
MVP 代码全部完成（M1-M6），等待：服务器部署（docs/DEPLOY.md）+ 端到端验收 + 微信群限制的产品决策（ADR-002）。

## 步骤
- [ ] 管理员：登录 https://pm.bitsouls.cn 修改初始密码、配置 LLM 供应商与三个专家角色模型
- [ ] 管理员：生成 GitHub fine-grained PAT（三个业务仓库 Contents 读写）→ 填入服务器 /opt/bitsoul-pm/.env 的 GITHUB_BOT_PAT 并 docker compose restart
- [ ] 三个被管理项目 push 到 GitHub（wangzhi43 下，建议私有）并在平台设置页启用
- [ ] 微信桥接部署到跑 OpenClaw 的机器 + 扫码绑定（bridge/README）
- [ ] 端到端 MVP 验收（DEPLOY.md §8 / PRD §6）
- [ ] 管理员决策：微信群采集方案（企微 / wechaty / 维持单聊+手动导入，见 ADR-002）
- [ ] P1 功能排期（微信日报推送、体验包、cherry-pick、完整统计、SSE）

## 已完成
- [x] 2026-08-04 生产部署上线 https://pm.bitsouls.cn：阿里云 ECS（47.103.29.184，云助手通道）、Docker 化四容器、pm 子域 DNS + Let's Encrypt HTTPS（acme.sh 自动续期）、migrate + seed、健康检查与管理员登录 API 全部通过；部署中修复三坑（全局 gitignore 吞 scripts/、Debian 官方源过慢改参数化阿里镜像、空 public 目录未入库）
- [x] M3 任务池与 Git 自动化：Git 服务（daily/feature/合并/冲突检测）、项管排序 Agent、Agent API 全套、账号管理、AGENT_GUIDE
- [x] M4 测试闭环：测试专家出题、报告提交+入仓、自动审核（全过→待验收/失败→回池提优先级/部分→人工裁决）
- [x] M5 看板与收尾：日报生成+报告页、docs 自动写入、分支审查+一键合并、任务池页+优先级锁、Agent 看板、导航+自动刷新
- [x] M6 微信打通：OpenClaw 插件桥（转发/补发/outbox 回发/心跳）、绑定自动登记+管理 UI、DEPLOY.md、ADR-002
- [x] M2 需求流入与拆解：微信 Ingest API（HMAC 签名/幂等/白名单）、消息聚合窗口 cron、产品专家 Agent（多模态拆解 + 驳回重拆）、手动导入（文本+附件）、LLM 供应商与角色模型配置（API+设置页）、确认流（确认/编辑/驳回/合并，手机优先卡片式）、采集箱页、管理端底部导航壳
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
