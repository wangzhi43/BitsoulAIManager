# TODO.md

## 当前任务
平台已上线运行（https://pm.bitsouls.cn）。MVP + P1 批次全部完成。等待管理员提供三项外部资源以激活自动化链路，之后进行端到端验收。

## 步骤（全部依赖管理员资源）
- [ ] 管理员：设置页配置 LLM 供应商 Key + 三个专家角色选模型（激活需求拆解）
- [ ] 管理员：GitHub fine-grained PAT → 服务器 /opt/bitsoul-pm/.env 的 GITHUB_BOT_PAT + docker compose restart（激活分支自动化）；三个业务项目 push 到 GitHub 并在设置页启用
- [ ] 微信桥装到跑 OpenClaw 的机器 + 扫码绑定（bridge/README；激活微信采集）
- [ ] 端到端 MVP 验收（DEPLOY.md §8 / PRD §6）
- [ ] 管理员决策：微信群采集方案（ADR-002）；admin 弱密码尽快在「更多」改掉
- [ ] 剩余 P1/P2 排期：体验包构建、cherry-pick、SSE 推送、客户回复自动关联澄清、实时语音模块

## 已完成
- [x] 2026-08-04 P1 批次上线（迁移 1_audit_and_report_push）：需求关闭/挂起/恢复、项目共享上下文编辑入仓、澄清文案一键回发微信、日报微信推送开关、操作审计日志、系统参数页、LLM 日消耗告警、交付质量统计
- [x] 2026-08-04 UI 三轮迭代上线：展示模式（mock 数据验收）、BI 高密度图表看板（自研 SVG 图表）、全站满屏布局与模块页重排、桌面侧边栏、需求列表/详情页、改密码
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
