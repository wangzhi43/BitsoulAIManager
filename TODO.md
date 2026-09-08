# TODO.md

## 当前任务
2026-09-07 全站 UI 商务风重设计 + 交互精简 + 补齐未完成功能 + 自测交付 —— 已完成本地开发与自测，待管理员：审阅设计画布与本地效果 → 批准 push / 部署 → 决定 schema 变更项。

## 步骤
- [x] 摸底：读 PRD/TECH_DESIGN/代码/现有截图
- [x] 功能盘点 → docs/UI_REDESIGN.md §2（PRD #1-#40 逐条：已实现 17 / 部分 16 / 未实现 7）
- [x] Claude Design 设计画布（方向 A 采用 + B/C 备选）：https://claude.ai/code/artifact/faa2972d-0369-473b-b4f8-fd4f3527d2f3
- [x] 设计系统落地：globals.css token + components/{ui,ui-client,icons,status,charts,Sidebar,BottomNav,AutoRefresh(SSE)}
- [x] 逐页重构：dashboard / inbox / confirm(主从) / requirements(+详情) / pools / branches / agents / reports / settings(页签) / more / login / submit
- [x] 真实模式全部 MOCK 移除；展示模式保留（demo.ts 补齐新字段）
- [x] 后端补齐：split / retry-merge / exclude / cherry-pick / branches(+refresh, merge 门槛) / pools/rank / tasks/release / reports(+generate) / system-config(运行参数+cron+单价表+Web 表单令牌) / public submit / SSE events / runtime-config / clarify 回填 / cron(fetch-repos, bot-heartbeat-check, reload-cron) / readRepoFile 读 daily / agent-cli.sh
- [x] 自测：tsc 0 错误、next build 通过、seed:dev + smoke 17/17 通过、worker 本地引导正常、Playwright 全页截图（桌面/手机，真实/展示）目检通过
- [x] 文档：CLAUDE.md 状态与验证命令、TECH_DESIGN §4.4/§4.5/§8、DEPLOY §4、AGENT_GUIDE
- [ ] 管理员：审阅后批准 git push + 云助手部署（`git pull && docker compose up -d --build`）
- [ ] 管理员：docs/UI_REDESIGN.md §2.2 四项 schema 变更是否批准（体验包 BuildRun、每 Agent 独立 git 凭据、LLM 成本字段、微信发送失败态）
- [ ] 上线后：设置页配置 LLM 单价表（成本估算）、按需开放 Web 表单入口、复核 cron 时间

## 已完成（历史）
### 2026-08 线上测试阶段遗留步骤（原样保留）
- [x] 0806 新参考图迭代 + pools 看板满宽修复,本地目检通过,commit b434289 push + 云助手部署 + 健康检查通过(2026-08-06)
- [x] DeepSeek 一键接入上线(3585531):设置页快速预填(api.deepseek.com,v4-flash/v4-pro)、建供应商自动配齐三专家角色、OpenAI 兼容通道结构化输出附带 JSON Schema(适配 DeepSeek json_object 要求)
- [x] DeepSeek API Key 已由管理员配置
- [x] GITHUB_BOT_PAT 配置完成(2026-08-06):PAT 三仓库读写实测通过(临时 ref 建删),写入服务器 .env(有备份)并 up -d 重建容器(注意:compose restart 不重读 .env,必须 up -d),容器内 printenv 确认生效
- [x] 管理员选定方案 A:第三个受管项目改为 BitsoulAIManager(自举);线上 DB 已更新,三个项目全部启用(f4516b8 部署)
- [x] 新增项目支持:POST /api/admin/projects + 设置页新增表单;总览页适配任意项目数(健康卡全量渲染,对比图/趋势图取前 6 个循环配色)
- [x] 2026-08-06 冒烟测试全链路跑通(Claude Code 亲自打样双 Agent):手动导入 REQ-1「/api/health 结构化访问日志」→ DeepSeek 10 秒拆解(5 条验收标准+项目自动归属)→ smoke-admin 确认入池 → 项管自动排序 → claude-dev-01 API 认领/心跳/开发/push/提交 → 平台自动 merge feature→daily + dev-log 回写 → DeepSeek 测试专家出 5 用例(含边界) → claude-test-01 本地起 daily 分支实测全过(含停库故障注入)→ 报告提交 → 自动审核 → PENDING_ACCEPT 等管理员验收
- [x] 冒烟中发现并修复:服务器克隆 GitHub 反复超时导致分支任务死亡 → 用宿主机 /opt/bitsoul-pm 现有克隆种子到 worker 卷 /data/repos(ensureRepo 只增量 fetch),任务重入队后秒级完成
- [ ] 遗留:BitSoulClaw / bitsoulofficial 首次 git 任务会遇到同样克隆问题,需同法种子或落地长期方案(partial clone / 镜像代理)
- [ ] 管理员:验收 REQ-1(需求管理→详情→验收);改 admin 弱密码;微信桥(可后置)
- [ ] 端到端正式测试(真实业务需求,微信链路可后补)
- [x] 本地开发环境(方案一,管理员批准):OrbStack 安装、本地 .env(随机密钥,gitignore)、compose 起 postgres/redis(docker-compose.override.yml 本地暴露 5432/6379,已 gitignore)、migrate + seed(admin/admin123)、npm run dev(localhost:3100)
- [x] Playwright 截图目检:真实空库模式 + 展示模式全页截图,dashboard/inbox/详情/branches/pools 均与参考图逐区块一致
- [x] 目检发现并修复:branches 空库只剩空态、pools 空库看板无卡片 → 增加 MOCK 空库回退(58a5973),写操作在 mock 数据上降级提示
- [x] 二次部署上线并健康检查通过(2026-08-05)

- [x] 2026-08-06 沉淀同机部署经验为通用指引 docs/SHARED_SERVER_DEPLOY_GUIDE.md,供其他项目部署到同一台阿里云服务器时复用(来源:DEPLOY.md/compose/Dockerfile/ADR-001/踩坑备注)
- [x] 2026-08-05 UI 全站重构上线 https://pm.bitsouls.cn(commit c9e1153):严格按 docs/ui_design/ 5 张参考图逐区块复现,缺数据用集中 MOCK 常量填充;深色侧边栏+浅色主题;typecheck/build 通过;云助手部署(GitHub 拉取首次失败重试成功),健康检查通过;已通知管理员验收
- [x] 2026-08-04 P1 批次上线 + 生产部署上线 + M1-M6 全部里程碑(细节见 git log)

## 备注
- 部署方式:服务器 /opt/bitsoul-pm,`git pull && docker compose up -d --build`,走 aliyun 云助手(实例 i-uf69vvyc9bfpd510ccdw,cn-shanghai);服务器拉 GitHub 不稳,脚本内置 5 次重试
- 部署提速待决:CI 构建镜像推 ACR、服务器只 pull(管理员尚未拍板;已解释 Docker vs 原生取舍)
- MOCK 数据约定:各页面顶部集中 `MOCK` 常量,注释「真实链路未接入时的界面填充,后续替换」;真实数据优先,为空回退 mock;无后端按钮点击提示「功能待接入」
- npm run lint 因 Next 16 移除 next lint 已失效(既有问题);验证用 `npx tsc --noEmit` + `npm run build`
- 等管理员的三项外部资源(LLM Key、GITHUB_BOT_PAT、微信桥)未变
- 2026-09 本地脚本(seed/seed:dev/smoke/worker)需先 `set -a && source .env && set +a`；Playwright 截图脚本在会话 scratchpad，用 Chrome channel 而非内置 chromium(版本不匹配)
