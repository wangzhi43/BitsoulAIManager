# 单镜像双用途：app（next start）与 worker（tsx scripts/worker.ts），compose 里用 command 区分
FROM node:22-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends git openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build

FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3100
# app 用 standalone 产物启动；worker 复用完整 node_modules 跑 tsx（compose 里覆盖 command）
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/.next/standalone ./standalone
COPY --from=build /app/.next/static ./standalone/.next/static
COPY --from=build /app/public ./standalone/public
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY package.json next.config.ts tsconfig.json ./
COPY prisma ./prisma
COPY src ./src
COPY scripts ./scripts
EXPOSE 3100
CMD ["node", "standalone/server.js"]
