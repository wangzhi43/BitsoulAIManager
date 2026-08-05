# TODO.md

## 当前任务
搭建本地开发环境(管理员已批准方案一):OrbStack + 本地 postgres/redis 容器 + .env + npm run dev,实现改代码秒级预览;搭好后用 Playwright 登录截图逐页目检新 UI。

## 步骤
- [x] 确认本机无容器运行时/postgres/redis,管理员选定 OrbStack
- [ ] brew install orbstack(进行中,后台下载)
- [x] 创建本地 .env(随机密钥,DATABASE_URL/REDIS_URL 指向 127.0.0.1,已确认 gitignore)
- [ ] docker compose up -d postgres redis
- [ ] prisma migrate deploy + seed(本地管理员账号)
- [ ] npm run dev(3100 端口)
- [ ] Playwright 登录截图:dashboard/inbox/confirm/requirements 详情/branches/pools,对照 5 张参考图目检
- [ ] 告知管理员本地预览用法

## 已完成
- [x] 2026-08-05 UI 全站重构上线 https://pm.bitsouls.cn(commit c9e1153):严格按 docs/ui_design/ 5 张参考图逐区块复现,缺数据用集中 MOCK 常量填充;深色侧边栏+浅色主题;typecheck/build 通过;云助手部署(GitHub 拉取首次失败重试成功),健康检查通过;已通知管理员验收
- [x] 2026-08-04 P1 批次上线 + 生产部署上线 + M1-M6 全部里程碑(细节见 git log)

## 备注
- 部署方式:服务器 /opt/bitsoul-pm,`git pull && docker compose up -d --build`,走 aliyun 云助手(实例 i-uf69vvyc9bfpd510ccdw,cn-shanghai);服务器拉 GitHub 不稳,脚本内置 5 次重试
- 部署提速待决:CI 构建镜像推 ACR、服务器只 pull(管理员尚未拍板;已解释 Docker vs 原生取舍)
- MOCK 数据约定:各页面顶部集中 `MOCK` 常量,注释「真实链路未接入时的界面填充,后续替换」;真实数据优先,为空回退 mock;无后端按钮点击提示「功能待接入」
- npm run lint 因 Next 16 移除 next lint 已失效(既有问题);验证用 `npx tsc --noEmit` + `npm run build`
- 等管理员的三项外部资源(LLM Key、GITHUB_BOT_PAT、微信桥)未变
