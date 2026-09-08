# 新项目同机部署指引（阿里云共存模式）

> 本文档面向要部署到 **bitsouls.cn 所在阿里云服务器** 的新项目，沉淀自 BitSoul AI Manager（pm.bitsouls.cn）的实际部署经验。可直接复制到新项目仓库（建议放 `docs/DEPLOY.md`），把文中占位符替换为你的项目信息后照做。
>
> 占位符约定：`<project>`＝项目英文短名（如 `myapp`）；`<PORT>`＝分配给你的本机端口（如 `3200`）；`<sub>.bitsouls.cn`＝你的子域（如 `myapp.bitsouls.cn`）。

## 0. 部署模式总览（必读）

这台服务器上已有多个服务共存（minsheng-worklog-server、BitSoul PM 等），统一遵循以下形态，**新项目必须沿用，不得例外**：

```
互联网
  │ 443/80
  ▼
服务器 Nginx（全机唯一入口，终止 TLS，按 server_name 分流）
  ├─ pm.bitsouls.cn      → 127.0.0.1:3100   (bitsoul-pm，已占用)
  ├─ <sub>.bitsouls.cn   → 127.0.0.1:<PORT> (你的项目)
  └─ ...                 → 127.0.0.1:xxxx   (其他既有服务)
```

四条铁律：

1. **应用只绑 127.0.0.1 端口**，绝不监听 `0.0.0.0`，绝不直接占用 80/443。TLS 与对外暴露统一由服务器现有 Nginx 负责。
2. **应用自身用 Docker Compose 自包含管理**（app + 自己的 postgres/redis 等），不与其他项目共享数据库实例，互不干扰、可独立重建。
3. **数据全部落 named volume**（数据库数据、上传文件等），保证容器可随时销毁重建而不丢数据。
4. **不碰别人的东西**：不修改其他项目的 Nginx 配置块、不占用别人的端口、不动别人的目录（`/opt/bitsoul-pm` 等）。

## 1. 部署前检查清单

在服务器上逐项确认（SSH 或阿里云云助手执行）：

```bash
# 1) Docker 与 Compose 插件可用
docker compose version

# 2) 查看已占用的本机端口，为自己选一个未用的（bitsoul-pm 占 3100；建议新项目从 3200、3300 依次取）
ss -tlnp | grep 127.0.0.1

# 3) 磁盘余量（镜像构建 + 数据库，建议至少留 10G）
df -h /

# 4) 看一眼现有 Nginx 配置结构，确认 conf 目录（通常 /etc/nginx/conf.d/ 或 sites-enabled/）
nginx -T 2>/dev/null | grep -E "server_name|listen 443" | head -20
```

域名与 DNS：

- `bitsouls.cn` 已完成 ICP 备案，**新加子域无需重新备案**。在阿里云控制台 → 云解析 DNS，给 `<sub>` 加一条 A 记录指向服务器公网 IP，生效通常在几分钟内。
- 若要用全新顶级域名，必须先走 ICP 备案（周期数周），不推荐；优先用 bitsouls.cn 子域。
- 若一时不便加子域，可退化为 path 前缀（`www.bitsouls.cn/<project>`），但应用框架需支持 base path（如 Next.js 的 `basePath`），Nginx 与应用两侧都要配置，坑更多，**首选子域**。

## 2. 项目仓库里需要准备的东西

新项目仓库内应具备以下四件套（可参考 BitsoulAIManager 仓库根目录的同名文件）：

### 2.1 Dockerfile（多阶段构建）

要点（Node/Next.js 项目模板，其他栈同理调整）：

```dockerfile
FROM node:22-slim AS base
# 国内服务器构建：apt 换源（构建时传 --build-arg DEBIAN_MIRROR=mirrors.aliyun.com）
ARG DEBIAN_MIRROR=""
RUN if [ -n "$DEBIAN_MIRROR" ]; then sed -i "s/deb.debian.org/$DEBIAN_MIRROR/g" /etc/apt/sources.list.d/debian.sources; fi \
    && apt-get update && apt-get install -y --no-install-recommends git openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS deps
# 国内服务器构建：npm 换源（--build-arg NPM_REGISTRY=https://registry.npmmirror.com）
ARG NPM_REGISTRY=https://registry.npmjs.org
COPY package.json package-lock.json ./
RUN npm config set registry $NPM_REGISTRY && npm ci

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
ENV PORT=<PORT>
COPY --from=build /app/... ./...   # 按框架产物调整
EXPOSE <PORT>
CMD ["node", "server.js"]          # 按框架启动方式调整
```

关键经验：

- **镜像源一律做成 `ARG` 而不是写死**：本地/海外构建用官方源，服务器上构建时传国内镜像参数。
- 用 Prisma 的项目还需 `ARG PRISMA_MIRROR` + `ENV PRISMA_ENGINES_MIRROR=$PRISMA_MIRROR`，否则国内下载 Prisma 引擎会超时。
- 如果有独立后台进程（队列 worker、定时任务），**用同一个镜像**，在 compose 里用 `command` 覆盖启动命令区分 app 和 worker，避免维护两份 Dockerfile。

### 2.2 docker-compose.yml

模板（按需删减服务）：

```yaml
services:
  app:
    build:
      context: .
      args:
        NPM_REGISTRY: ${NPM_REGISTRY:-https://registry.npmjs.org}
        DEBIAN_MIRROR: ${DEBIAN_MIRROR:-}
    restart: unless-stopped
    ports:
      - "127.0.0.1:<PORT>:<PORT>"      # 只绑本机，铁律 1
    env_file: .env
    environment:
      # 容器内连库地址与本地开发不同，在这里覆盖 .env 里的本地值
      DATABASE_URL: postgresql://<project>:${POSTGRES_PASSWORD}@postgres:5432/<project>
      REDIS_URL: redis://redis:6379
    volumes:
      - uploads:/data/uploads
    depends_on:
      postgres:
        condition: service_healthy      # 必须等库就绪，否则 app 启动即连库失败
      redis:
        condition: service_started

  # 有后台 worker 才需要；同镜像不同 command
  # worker:
  #   build: { context: . }
  #   restart: unless-stopped
  #   command: ["npx", "tsx", "scripts/worker.ts"]
  #   env_file: .env
  #   environment: { ...同 app... }
  #   depends_on: { postgres: { condition: service_healthy } }

  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: <project>
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: <project>
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U <project>"]
      interval: 5s
      timeout: 3s
      retries: 10

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    command: ["redis-server", "--appendonly", "yes"]
    volumes:
      - redisdata:/data

volumes:
  pgdata:
  redisdata:
  uploads:
```

关键经验：

- 所有服务 `restart: unless-stopped`，服务器重启后自动拉起。
- **postgres/redis 不写 `ports`**——只在 compose 内网可达，绝不暴露到宿主机公网。本地开发需要直连时，另建 `docker-compose.override.yml`（写入 `.gitignore`，勿提交）把端口映射到 `127.0.0.1`。
- postgres 必须配 `healthcheck`，app/worker 用 `condition: service_healthy` 等待，否则首次启动竞态失败。

### 2.3 .env.example

```bash
# 复制为 .env 并填写。所有密钥不进 git（确认 .gitignore 已排除 .env）。
# 本地开发直连地址；docker compose 内会被 environment 覆盖为容器地址
DATABASE_URL=postgresql://<project>:<project>@127.0.0.1:5432/<project>
REDIS_URL=redis://127.0.0.1:6379
# openssl rand -hex 32
JWT_SECRET=
# openssl rand -hex 16
POSTGRES_PASSWORD=
```

- 每个密钥旁**注释生成方式**，部署的人不用猜。
- `.gitignore` 必须包含 `.env` 和 `docker-compose.override.yml`。公开仓库尤其注意：任何密钥入过 commit 就视为泄露，必须轮换。

### 2.4 健康检查端点

应用必须提供一个无鉴权的 `GET /api/health`（或 `/healthz`），返回 `{"ok":true}` 之类的 JSON。部署验证、升级验证、监控全靠它。

## 3. 首次部署步骤

```bash
# 1) 拉代码到 /opt 下的项目目录（与既有项目并列，如 /opt/bitsoul-pm）
git clone https://github.com/<org>/<repo>.git /opt/<project>
cd /opt/<project>

# 2) 生成配置
cp .env.example .env
# 用 openssl rand 逐项生成密钥后填入：
openssl rand -hex 32   # JWT_SECRET 等，每个密钥单独生成一次
openssl rand -hex 16   # POSTGRES_PASSWORD

# 3) 构建并启动（国内服务器带镜像参数；也可把这两个变量写进 .env 一劳永逸）
NPM_REGISTRY=https://registry.npmmirror.com DEBIAN_MIRROR=mirrors.aliyun.com \
  docker compose up -d --build

# 4) 初始化数据库（按项目实际命令，Prisma 项目示例）
docker compose exec app npx prisma migrate deploy
# 有 seed 脚本则执行（初始密码用环境变量传入，不写死在脚本里）
docker compose exec -e ADMIN_PASSWORD='<初始密码>' app npx tsx scripts/seed.ts

# 5) 本机验证（先别配 Nginx，确认应用本身活着）
curl -s http://127.0.0.1:<PORT>/api/health   # 期望 {"ok":true,...}
docker compose ps                            # 各服务 State 均为 running/healthy
```

## 4. Nginx 反代（在服务器现有 Nginx 上追加）

新建 `/etc/nginx/conf.d/<project>.conf`（目录按第 1 步确认的实际结构）：

```nginx
server {
    listen 80;
    server_name <sub>.bitsouls.cn;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name <sub>.bitsouls.cn;
    # 证书两条路二选一（见下方说明）：
    # ssl_certificate     /etc/letsencrypt/live/<sub>.bitsouls.cn/fullchain.pem;
    # ssl_certificate_key /etc/letsencrypt/live/<sub>.bitsouls.cn/privkey.pem;

    client_max_body_size 60m;            # Nginx 默认 1m，有文件上传必调，否则 413
    location / {
        proxy_pass http://127.0.0.1:<PORT>;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_read_timeout 120s;         # 有长请求（LLM 调用、导出等）必调，默认 60s
        # 如有 WebSocket / SSE，再加：
        # proxy_http_version 1.1;
        # proxy_set_header Upgrade $http_upgrade;
        # proxy_set_header Connection "upgrade";
        # proxy_buffering off;           # SSE 流式输出需要
    }
}
```

证书获取（二选一，与服务器既有证书方案保持一致，先看其他站点用的哪种）:

- **certbot**：`certbot --nginx -d <sub>.bitsouls.cn`，自动改配置并续期。
- **阿里云免费证书**：控制台申请子域证书，下载 Nginx 格式，放 `/etc/nginx/certs/` 后在上面配置里指向。注意免费证书一年一换，到期要手动重新申请部署。

生效与验证：

```bash
nginx -t && systemctl reload nginx     # nginx -t 不通过绝不 reload
curl -sI https://<sub>.bitsouls.cn/api/health
```

**注意**：只新增自己的 conf 文件，不修改任何既有 server 块；`reload` 而非 `restart`，避免影响同机其他站点。

## 5. 日常运维

### 升级发布

```bash
cd /opt/<project> && git pull && docker compose up -d --build
# 有数据库变更时追加：
docker compose exec app npx prisma migrate deploy
# 每次发布后必验：
curl -s http://127.0.0.1:<PORT>/api/health
```

### 备份（部署完成当天就配，不要拖）

```bash
mkdir -p /opt/backups
crontab -e   # 加入（每天凌晨 3 点备份，保留 14 天）：
# 0 3 * * * cd /opt/<project> && docker compose exec -T postgres pg_dump -U <project> <project> | gzip > /opt/backups/<project>-$(date +\%F).sql.gz && find /opt/backups -name '<project>-*.gz' -mtime +14 -delete
```

恢复演练（至少做一次，确认备份可用）：

```bash
gunzip -c /opt/backups/<project>-<日期>.sql.gz | docker compose exec -T postgres psql -U <project> <project>
```

### 查日志与排障

```bash
docker compose logs -f app            # 应用日志（--tail=200 看最近）
docker compose ps                     # 容器状态
docker compose exec app printenv      # 确认容器内环境变量实际生效值
tail -f /var/log/nginx/error.log      # Nginx 侧报错（502 多半是 app 没起来或端口不对）
```

## 6. 踩坑经验（均为本机实际发生过的问题）

1. **改了 `.env` 后 `docker compose restart` 不生效**——restart 不会重读 env_file，必须 `docker compose up -d` 重建容器。改完后用 `docker compose exec app printenv | grep <变量名>` 确认。
2. **服务器拉 GitHub 不稳定**，`git pull` 可能连接失败。部署脚本里给 pull 加重试（本项目内置 5 次重试）；手动部署失败就多试几次，或配置 GitHub 镜像加速。
3. **国内构建三大慢**：npm 装包、apt 装包、Prisma 引擎下载。分别用 `NPM_REGISTRY=https://registry.npmmirror.com`、`DEBIAN_MIRROR=mirrors.aliyun.com`、`PRISMA_ENGINES_MIRROR` 解决，全部做成构建参数（见 §2.1）。
4. **413 Request Entity Too Large**：Nginx `client_max_body_size` 默认 1m，有上传功能必须按业务上限加余量调大（应用侧限制 + Nginx 侧限制两处都要设）。
5. **长请求被 Nginx 掐断（504）**：默认 `proxy_read_timeout 60s`，LLM 调用、大报表导出等要调到 120s 以上；SSE 流式还需 `proxy_buffering off`。
6. **app 比 postgres 先起导致连库失败**：postgres 配 healthcheck，app 用 `depends_on.condition: service_healthy`（`depends_on` 默认只等启动不等就绪）。
7. **容器内外数据库地址不同**：`.env` 里写本地开发地址（`127.0.0.1`），compose 的 `environment` 覆盖为容器网络地址（`postgres:5432`），两边不会互相打架。
8. **远程执行推荐走阿里云云助手**（ECS 控制台 → 云助手命令），免维护 SSH 密钥，命令与输出有留档；本服务器实例：`i-uf69vvyc9bfpd510ccdw`（cn-shanghai）。
9. **构建耗时**：`--build` 全量构建在这台服务器上可能需要几分钟，属正常；若不可接受，可演进为 CI 构建镜像推 ACR、服务器只 `docker compose pull`（本项目评估过尚未实施）。

## 7. 安全红线

- 密钥不进代码、不进 commit、不进日志；一律 `.env` 或加密配置，`openssl rand` 生成。
- 数据库/Redis 不暴露任何公网端口（compose 不写 ports 即可）；确需本机调试走 `docker-compose.override.yml` 且只绑 `127.0.0.1`。
- 应用初始管理员账号部署后立即改掉弱密码。
- 全站强制 HTTPS（80 端口只做 301 跳转）。
- 若仓库公开：部署文档里不出现真实密钥、内网拓扑之外的敏感信息；本文档中的实例 ID 等信息随仓库公开范围自行斟酌删改。

## 附：部署完成核对单

- [ ] `docker compose ps` 全部 running/healthy
- [ ] `curl http://127.0.0.1:<PORT>/api/health` 通过
- [ ] `https://<sub>.bitsouls.cn` 浏览器可访问，证书有效
- [ ] `.env` 已填齐且未提交 git（`git status` 确认）
- [ ] 备份 crontab 已配置，且手动执行过一次恢复演练
- [ ] 管理员初始密码已修改
- [ ] 服务器重启演练（可选）：`reboot` 后各容器自动拉起
