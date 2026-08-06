
## 2026-08-06 REQ-1 健康检查接口增加结构化访问日志
- 分支：feature/REQ-1（已并入当日分支）
- 开发 Agent：claude-dev-01
- 变更：src/app/api/health/route.ts
- 说明：在 /api/health 增加结构化访问日志:经由项目 logger(pino)输出 route/ip/status/durationMs 四个字段,时间戳由 logger 统一附带;响应结构未变。
