# ADR-003：体验包构建约定与 2026-09 schema 扩展

日期：2026-09-08 ｜ 状态：已采纳（管理员批准 schema 变更）

## 背景

docs/UI_REDESIGN.md §2.2 列出四项因需改数据库 schema 而暂缓的功能：体验包构建（PRD #27）、每 Agent 独立 git 凭据（TECH_DESIGN §10）、LLM 成本精确入库、微信发送失败态。管理员于 2026-09-08 批准。

## 决策

1. **体验包构建（BuildRun 表 + worker `run-build` 任务）**
   - 构建在 worker 容器内、项目服务端 clone 上执行 `Project.buildCommand`，工作目录为仓库根，分支 reset 到 `origin/<branch>`。
   - **产物约定**：构建命令必须把产物写到环境变量 `$BUILD_OUT` 指向的目录（worker 创建 `/data/builds/<runId>/out`）。构建结束后 worker 把该目录打成 `<runId>.tar.gz` 存到 `BUILDS_DIR`（默认 `/data/builds`，app 与 worker 共享卷）。目录为空视为「构建成功但无产物」。
   - 日志只保留尾部 200 KB；超时 30 分钟强制失败。
   - **对外分发**：每个 BuildRun 生成随机 `downloadToken`，公开路由 `GET /api/public/builds/:id?token=` 校验后直接流式下载，无需登录；「发给客户」把下载链接写入 WechatOutbox 由机器人回发（受 ADR-002 context token 限制，尽力送达）。
   - 不做 CI：构建环境就是 worker 镜像（node 22 + git），Electron 等需要特殊环境的项目会在日志里失败，由管理员自行判断是否换环境。
2. **每 Agent 独立 git 凭据**：`AgentAccount.gitTokenEnc`（AES-256-GCM，与 LLM Key 同一主密钥）。认领响应优先下发本 Agent 凭据（`kind: "github_pat"`），未配置时回退全局 `GITHUB_BOT_PAT`（`kind: "shared_bot_pat"`），便于逐步收紧；界面在智能体页录入 / 清除。
3. **LLM 成本入库**：`LlmUsageLog.costEstimate Float?`（美元），`completeForRole` 写入时按系统参数 `llmPrices` 单价表计算；无单价为 null。统计优先累加已入库成本，历史无成本的行仍按当前单价估算。
4. **微信发送失败态**：`WechatOutbox` 增加 `attempts / lastError / failedAt`。插件发送失败时 ack 上报 `{id, ok:false, error}`；平台累加 attempts，达到 5 次置 `failedAt`（不再下发）。设置页「微信采集」显示待发 / 失败队列，可一键重试（清零）。

## 影响

- 一次 Prisma 迁移 `2_p1_extensions`（新表 BuildRun、BuildStatus 枚举、三张表加列，均可空或有默认值，无数据回填）。上线步骤：`docker compose up -d --build && docker compose exec app npx prisma migrate deploy`。
- docker-compose 增加 `builds` 卷挂到 app 与 worker 的 `/data/builds`。
- bridge 插件需随本次一并更新（ack 上报失败）。旧插件仍兼容（只报成功 id）。
