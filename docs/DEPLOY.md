# 部署手册（阿里云服务器）

与 minsheng-worklog-server 同机共存：服务绑 127.0.0.1，服务器 Nginx 统一反代并终止 TLS（ADR-001）。

## 0. 前置

- 服务器已装 Docker + Docker Compose 插件（`docker compose version` 验证）
- 阿里云 DNS：`pm.bitsouls.cn` A 记录 → 服务器 IP（或改用 `www.bitsouls.cn/pm` 前缀，则平台 .env 设 `APP_BASE_PATH=/pm`）
- GitHub fine-grained PAT 一枚：仅授权被管理的仓库，权限 Contents Read/Write（M3 git 自动化用）

## 1. 拉代码与配置

```bash
git clone https://github.com/wangzhi43/BitsoulAIManager.git /opt/bitsoul-pm
cd /opt/bitsoul-pm
cp .env.example .env
# 逐项填写：
#   JWT_SECRET /MASTER_KEY / INGEST_HMAC_SECRET：openssl rand -hex 32（三个各生成一次）
#   POSTGRES_PASSWORD：openssl rand -hex 16
#   GITHUB_BOT_PAT：上面申请的 PAT
```

## 2. 启动与初始化

```bash
docker compose up -d --build
# 建库表
docker compose exec app npx prisma migrate deploy
# 初始化管理员与三个项目（密码自定）
docker compose exec -e ADMIN_PASSWORD='<初始密码>' app npx tsx scripts/seed.ts
# 验证
curl -s http://127.0.0.1:3100/api/health   # {"ok":true,...}
```

## 3. Nginx 反代（服务器现有 Nginx 上追加）

```nginx
server {
    listen 443 ssl;
    server_name pm.bitsouls.cn;
    # ssl_certificate / ssl_certificate_key 按现有证书方案（certbot / 阿里云证书）

    client_max_body_size 60m;          # 附件上传上限 50MB + 余量
    location / {
        proxy_pass http://127.0.0.1:3100;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_read_timeout 120s;
    }
}
```

`nginx -t && systemctl reload nginx` 后访问 https://pm.bitsouls.cn 登录。

## 4. 平台内配置（登录后「设置」页）

1. 添加 LLM 供应商（Anthropic key 或 DeepSeek/Qwen 的 OpenAI 兼容端点），点「测试」验证连通
2. 为 PRODUCT / PM / TEST 三个专家角色各选定供应商与模型
3. 启用三个项目（确认各自 GitHub 仓库地址；仓库需已存在且 PAT 可访问）
4. 在「更多 → Agent」创建开发/测试 Agent 账号

## 5. 微信桥接（在跑 OpenClaw 微信机器人的机器上）

见 `bridge/openclaw-plugin-bitsoul-pm/README.md`。注意 ADR-002：当前通道仅支持单聊。

## 6. 终端 Agent 接入

把 `docs/api/AGENT_GUIDE.md` 中的提示词模板（替换平台地址与账号）投喂给各终端的 Claude Code / BitSoulClaw 即可开始自动认领。

## 7. 备份与升级

```bash
# 每日备份（建议加入 crontab）
docker compose exec postgres pg_dump -U bsam bsam | gzip > /opt/backups/bsam-$(date +%F).sql.gz
find /opt/backups -name 'bsam-*.gz' -mtime +14 -delete

# 升级
cd /opt/bitsoul-pm && git pull && docker compose up -d --build \
  && docker compose exec app npx prisma migrate deploy
```

## 8. 端到端验收（PRD §6）

1. 微信给机器人发需求（或用「采集箱」手动导入）→ 设置页启用会话 → 消息进采集箱
2. 等聚合窗口（默认 30 分钟，可在 .env 调小 `AGG_WINDOW_MINUTES=1` 快速验证）→「确认」页出现拆解结果
3. 手机上确认 → 任务池出现并已排序 → 终端 Agent 认领开发 → 提交
4. 平台自动合并 + 生成测试任务 → 测试 Agent 认领 → 提交报告 → 状态到「待验收」
5. 晚间「分支」页审查并合并 main；21:00 后「更多 → 报告」看日报
6. 仓库 docs/ 下 requirements-log.md、dev-log.md、test-reports/ 自动更新
