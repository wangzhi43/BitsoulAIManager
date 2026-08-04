# ADR-001：Git 托管与域名部署方案

日期：2026-08-03 ｜ 状态：已采纳（管理员确认）

## 决策

1. **Git 中心库用 GitHub**，不自建 Gitea。平台自身仓库：`git@github.com:wangzhi43/BitsoulAIManager.git`（公开仓库，所有人可拉取）。被管理的三个项目同样以 GitHub（wangzhi43 账号下）作为中心 remote。
2. **域名 `https://www.bitsouls.cn`**，已备案，阿里云部署，与 minsheng-worklog-server 同一台服务器。平台走子域 `pm.bitsouls.cn`（需在阿里云 DNS 加一条 A 记录指向服务器；若不便加子域则退化为 `www.bitsouls.cn/pm` path 前缀，Next.js `basePath` 支持）。

## 影响与调整

- 删除原方案中的 Gitea 容器；docker-compose 只剩 app / worker / postgres / redis
- 平台 git 自动化改为：服务端 clone（bot PAT，fine-grained、仅授权相关仓库）上做分支操作后 push GitHub
- 外部 Agent 拉代码：公开仓库直接 clone；push 需要凭据——MVP 阶段由平台在认领响应中下发 bot PAT（HTTPS 传输、仅认领后可获取），P1 再考虑按 Agent 独立 PAT
- 分支保护（main、daily/*）在 GitHub 仓库设置中配置
- **安全注意**：仓库公开意味着代码与 docs 日志全网可见——严禁任何密钥入库；被管理的三个业务项目建议设为 GitHub 私有库（不影响本方案，Agent 用 PAT 访问），由管理员在建库时定夺

## 参考部署形态（minsheng-worklog-server 同机共存）

服务绑定 127.0.0.1 端口，服务器 Nginx 统一反代并终止 TLS；本平台 app 用 3100 端口，遵循同样模式。
