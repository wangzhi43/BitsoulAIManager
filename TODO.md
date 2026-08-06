# TODO.md

## 当前任务
进入线上正式测试阶段。0806 迭代已上线(b434289,健康检查通过)。管理员按配置清单完成线上配置后,开始端到端测试(DEPLOY.md §8)。

## 步骤
- [x] 0806 新参考图迭代 + pools 看板满宽修复,本地目检通过,commit b434289 push + 云助手部署 + 健康检查通过(2026-08-06)
- [x] DeepSeek 一键接入上线(3585531):设置页快速预填(api.deepseek.com,v4-flash/v4-pro)、建供应商自动配齐三专家角色、OpenAI 兼容通道结构化输出附带 JSON Schema(适配 DeepSeek json_object 要求)
- [x] DeepSeek API Key 已由管理员配置
- [x] GITHUB_BOT_PAT 配置完成(2026-08-06):PAT 三仓库读写实测通过(临时 ref 建删),写入服务器 .env(有备份)并 up -d 重建容器(注意:compose restart 不重读 .env,必须 up -d),容器内 printenv 确认生效
- [ ] 管理员拍板:第三个受管项目是 BitsoulAIManager(平台自身,PAT 已授权)还是 minsheng-worklog-mp(GitHub 无仓库);定了我更新项目配置
- [ ] 管理员线上配置(剩余):创建 Agent 账号(更多页)+ 按 AGENT_GUIDE 接终端;改 admin 弱密码;微信桥(可后置,先用手动导入测)
- [ ] 端到端正式测试:采集→拆解→确认→任务池→Agent 开发→测试→验收→合并→日报
- [x] 本地开发环境(方案一,管理员批准):OrbStack 安装、本地 .env(随机密钥,gitignore)、compose 起 postgres/redis(docker-compose.override.yml 本地暴露 5432/6379,已 gitignore)、migrate + seed(admin/admin123)、npm run dev(localhost:3100)
- [x] Playwright 截图目检:真实空库模式 + 展示模式全页截图,dashboard/inbox/详情/branches/pools 均与参考图逐区块一致
- [x] 目检发现并修复:branches 空库只剩空态、pools 空库看板无卡片 → 增加 MOCK 空库回退(58a5973),写操作在 mock 数据上降级提示
- [x] 二次部署上线并健康检查通过(2026-08-05)

## 已完成
- [x] 2026-08-05 UI 全站重构上线 https://pm.bitsouls.cn(commit c9e1153):严格按 docs/ui_design/ 5 张参考图逐区块复现,缺数据用集中 MOCK 常量填充;深色侧边栏+浅色主题;typecheck/build 通过;云助手部署(GitHub 拉取首次失败重试成功),健康检查通过;已通知管理员验收
- [x] 2026-08-04 P1 批次上线 + 生产部署上线 + M1-M6 全部里程碑(细节见 git log)

## 备注
- 部署方式:服务器 /opt/bitsoul-pm,`git pull && docker compose up -d --build`,走 aliyun 云助手(实例 i-uf69vvyc9bfpd510ccdw,cn-shanghai);服务器拉 GitHub 不稳,脚本内置 5 次重试
- 部署提速待决:CI 构建镜像推 ACR、服务器只 pull(管理员尚未拍板;已解释 Docker vs 原生取舍)
- MOCK 数据约定:各页面顶部集中 `MOCK` 常量,注释「真实链路未接入时的界面填充,后续替换」;真实数据优先,为空回退 mock;无后端按钮点击提示「功能待接入」
- npm run lint 因 Next 16 移除 next lint 已失效(既有问题);验证用 `npx tsc --noEmit` + `npm run build`
- 等管理员的三项外部资源(LLM Key、GITHUB_BOT_PAT、微信桥)未变
