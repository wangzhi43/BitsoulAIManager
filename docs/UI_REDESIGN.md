# 2026-09 界面商务风重设计 + 功能补齐方案

| 项 | 内容 |
|---|---|
| 日期 | 2026-09-07 |
| 触发 | 管理员：界面向商务风格调整、交互精简、信息重点突出；整理并完成未完成功能；自测交付 |
| 设计稿 | Claude Design 画布：https://claude.ai/code/artifact/faa2972d-0369-473b-b4f8-fd4f3527d2f3 （页 1 主流程 8 张画板，页 2 设计系统 + 两个备选方向） |
| 上游 | docs/PRD.md §4 功能清单、docs/TECH_DESIGN.md |

---

## 1. 设计决策（方向 A，已采用）

**风格**：企业中后台。藏青侧栏（#131c2b）+ 白底内容，单一主色 #1f4fa8，系统字体（PingFang / 微软雅黑），6/8px 圆角，1px 边框，无阴影、无渐变、无 emoji 图标（全部换成线性 SVG）。语义色只用于状态：成功 #1a7f4b、提醒 #b7791f、告警 #c0392b。

**信息优先级**：
- 工作台第一行只放「需要人处理」的四个数字：待确认 / 待裁决 / 待验收 / 合并冲突，每个直达处理页
- 项目状态用表格而不是健康分卡片（原健康分/资源/质量无数据来源，属编造）
- 数字一律 tabular-nums；状态用文字标签 + 语义色
- 真实模式下无数据显示诚实空态 + 下一步指引；**删除所有真实模式的 MOCK 填充**。展示模式（cookie 开关）保留，用于演示

**交互精简**：
- 侧栏由 10 项压缩为 3 组 8 项：工作台 · 需求（待确认 / 需求列表 / 采集箱）· 交付（执行看板 / 分支审查）· 运营（智能体 / 日报）· 设置。「更多」只在手机端出现
- 待确认改为主从布局：左列队列（可多选合并），右侧直接确认 / 编辑 / 拆分 / 驳回 / 发澄清，不必进详情页
- 需求详情顶部加状态进度条；右栏「当前动作」只保留该状态下能做的事
- 分支审查：左侧真实 diff 表 + 提交记录，右侧合并条件检查清单（不满足则按钮禁用）+ 待验收 + 冲突处理
- 设置改为左侧页签
- 手机端底部 5 个入口；审批操作固定底栏，触控高度 44px

未采用的备选：方向 B 浅色侧栏、方向 C 顶部导航（画布页 2 保留低保真稿）。

---

## 2. 待完成功能清单（PRD §4 逐条对照，2026-09-07 盘点）

盘点口径：按钮弹「功能待接入」、数据来自 MOCK 常量、后端无写入路径，一律不算已实现。

### 2.1 本次落地（不改数据库 schema）

| # | PRD 功能 | 盘点结果 | 本次做法 |
|---|---|---|---|
| 1 | 项目 CRUD | 无删除；描述/构建命令/docsDir 无界面 | 设置页项目编辑表单（描述 / 主分支 / docsDir / 构建命令）；无需求的项目可删除 |
| 4 | Agent 账号管理 | 只能启停 | 智能体页支持改角色 / 项目范围 / 重置密码 |
| 9 | 采集触发模式 | MENTION 判定是裸 `@` | 改为匹配 `@机器人名`（SystemConfig `wechatBotName`）或 `@所有人` |
| 10 | Web 表单入口 | 未实现 | 新增公开页 `/submit?token=`（SystemConfig `webFormToken`），入 WEB_FORM 线索并送拆解 |
| 14 | 确认流「拆开」 | 无后端 | 新增 `POST /api/admin/requirements/[id]/split`，待确认页与详情页接入 |
| 17 | 客户回复自动关联补全 | 未实现 | 微信会话有未答澄清问题且 48h 内发过澄清文案时，新消息走 `apply-clarification` LLM 任务回填答案；判定为新需求则回落到常规拆解 |
| 18 | 任务池筛选 | 「更多筛选 / 仅看我负责 / 视图设置」为桩 | 删除桩按钮；保留项目 / 优先级 / Agent / 关键词筛选；`?project=` 支持从工作台直达 |
| 19 | AI 重排 | 按钮为桩 | `POST /api/admin/pools/rank` 入队 rank-pool |
| 21 | 认领互斥可配置 | 不可配 | SystemConfig `devTestExclusive`（默认开） |
| 24 | 合并冲突告警 | 只写事件 | 工作台冲突计数直达；分支审查页「重试合并 / 剔除」；微信告警走 outbox（负责人会话） |
| 25 | 分支审查 diff 摘要 | 全是伪造数 | worker `refresh-branch-summary` 用真实 `git diff --stat` / `git log` 写 `DailyBranch.reviewSummary`，合并 feature 后自动刷新，页面有「刷新 diff」 |
| 26 | 逐需求 cherry-pick / 剔除 | 未实现 | git 任务 `exclude-from-daily`（revert 合并提交，需求回待开发）与 `cherry-pick-to-main`（单需求提前进 main） |
| 32 | 终端接入脚本 | `agent-cli.sh` 缺失 | 新增 `docs/api/agent-cli.sh` |
| 33 | agent-context 读写分支不一致 | 写 daily 读 main | `readRepoFile` 先读最新 daily，无则读 main |
| 34 | 项目看板 | `/projects/[id]/board` 缺失 | 执行看板按项目筛选即项目看板；`/projects/[id]/board` 重定向到 `/pools?project=` |
| 37 | 完整统计指标 | 算了不展示；无成本 | 前置时间 / 开发时长 / 返工率展示到工作台与日报页；LLM 成本按 SystemConfig `llmPrices`（每百万 token 单价）估算 |
| 39 | 系统参数生效 | 聚合窗口 / 超时只读 env | `getRuntimeConfig()` 读 SystemConfig，env 兜底；定时任务时间可配（`cronDailyBranch` / `cronRankPools` / `cronDailyReport`），worker 每 5 分钟重载 |
| — | SSE `/api/events` | 未实现（30 秒盲轮询） | 新增 SSE：服务端 5 秒检测 ReqEvent / DevTask / TestTask / AuditLog 变更即推送，前端收到才刷新；断线回退轮询 |
| — | 每 5 分钟仓库 fetch / Bot 心跳检查 | cron 缺失 | 补两个 cron；心跳超 5 分钟写 `wechatBotAlert`，工作台系统状态标红 |
| — | 分支审查「无报告=通过」bug | 误判可合并 | 合并条件要求每个已合入需求都有 PASS 报告 |
| — | 待验收「退回」 | 不支持 | accept 接口允许 PENDING_ACCEPT → READY（附原因） |
| — | 详情页缺优先级调整 / 纯驳回 | 缺 | 补齐 |
| — | 日报手动生成 / 推送状态 | 缺 | `POST /api/admin/reports/generate`；日报页显示是否已推送 |
| — | 管理员强制释放认领 | 缺 | `POST /api/admin/tasks/[id]/release` |
| — | 本地验证数据 | 无 | `scripts/seed-dev.ts`（仅非生产环境）生成各状态样例，供截图与冒烟 |

### 2.2 需要数据库 schema 变更，待管理员批准后再做（红线：schema 变更必须先问）

| # | 功能 | 需要的变更 |
|---|---|---|
| 27 | 构建打包 + 体验包发客户 | 新表 `BuildRun`（项目、分支、命令、日志、产物路径、状态） |
| — | 每 Agent 独立 git 凭据（TECH_DESIGN §10） | `AgentAccount.gitTokenEnc`；当前认领响应下发全局 bot PAT |
| — | LLM 成本精确入库 | `LlmUsageLog.costEstimate`（本次先用单价表在展示层估算） |
| — | 微信发送失败态 | `WechatOutbox.failedAt / error` |

### 2.3 后置（P2，PRD 已标）

| # | 功能 |
|---|---|
| 5 | 细粒度权限（项目成员 / 只读 / 客户账号） |
| 11 | 语音 ASR 转写 |
| 12 | 实时语音需求沟通模块 |
| 13 补充 | 文档（docx/pdf）正文解析进拆解提示词；OpenAI 兼容通道视觉输入 |

---

## 3. 页面 ↔ 数据来源（真实模式）

| 页面 | 数据 | 空态 |
|---|---|---|
| 工作台 | `getDashboardStats()` 扩展：昨日对比、质量指标、队列深度、Bot 心跳、最近日报 | 无项目时引导去设置页 |
| 待确认 | `Requirement[status=PENDING_CONFIRM]` + source + 同线索候选 | 「暂无待确认」+ 手动导入入口 |
| 需求列表 | 状态筛选 + 关键词 + 项目筛选 | — |
| 需求详情 | 全字段 + events + devTask + testTasks/report + defects/parent | 澄清 / 原始消息为空则不渲染区块 |
| 采集箱 | 待聚合会话消息 + 最近线索及其需求单 | 引导手动导入 |
| 执行看板 | READY→PENDING_ACCEPT 需求 + devTask/testTask/report | 「池内没有需求」 |
| 分支审查 | `DailyBranch` + `reviewSummary`（真实 diff / 提交） | 「今日尚未创建分支」+ 手动创建 |
| 智能体 | `AgentAccount` + 任务计数 + 近 7 天用量 | 引导创建账号 |
| 日报 | `DailyReport`（含 pushed） | 「尚无日报」+ 立即生成 |
| 设置 | 项目 / 供应商 / 角色模型 / 微信绑定 / 系统参数 / 审计 | — |

---

## 4. 验证

- `npx tsc --noEmit` + `npm run build`
- `npm run seed:dev` 后 Playwright 全页截图（真实模式 + 展示模式，1440 与 390 宽）
- `scripts/smoke.ts`：登录 → 导入 → 拆分 / 确认 / 优先级 / 释放 / 生成日报 / SSE 连通 等接口冒烟
