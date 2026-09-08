// API 冒烟（本地）：登录 → 导入 → 列表 → 拆分 → 优先级 → 重排 → 日报生成 → 系统参数 → SSE → 公开表单。
// 用法：BASE=http://localhost:3100 ADMIN_PASSWORD=admin123 npm run smoke

const BASE = process.env.BASE ?? "http://localhost:3100";
const PASSWORD = process.env.ADMIN_PASSWORD ?? "admin123";
let cookie = "";
let failed = 0;

function log(ok: boolean, name: string, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? `  — ${extra}` : ""}`);
  if (!ok) failed++;
}

async function call(method: string, path: string, body?: unknown): Promise<{ status: number; data: Record<string, unknown> | null; headers: Headers }> {
  const res = await fetch(BASE + path, {
    method,
    headers: { ...(body ? { "content-type": "application/json" } : {}), ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  return { status: res.status, data, headers: res.headers };
}

async function main() {
  const login = await call("POST", "/api/admin/login", { username: "admin", password: PASSWORD });
  log(login.status === 200 && !!cookie, "登录", `status ${login.status}`);
  if (!cookie) process.exit(1);

  const me = await call("GET", "/api/admin/me");
  log(me.status === 200 && me.data?.username === "admin", "GET /api/admin/me");

  const imp = await call("POST", "/api/admin/import", { text: "冒烟测试：希望在设置页增加一个导出全部数据为 CSV 的按钮，导出包含需求与测试报告。", customerName: "冒烟客户" });
  log(imp.status === 200 && typeof imp.data?.threadId === "string", "手动导入入队", String(imp.data?.threadId ?? imp.data?.error));

  const list = await call("GET", "/api/admin/requirements");
  const reqs = (list.data?.requirements as { id: string; status: string; seq: number; acceptance: string[] }[] | undefined) ?? [];
  log(list.status === 200 && Array.isArray(reqs), "需求列表", `${reqs.length} 条`);

  const pending = reqs.find((r) => r.status === "PENDING_CONFIRM" && (r.acceptance?.length ?? 0) >= 2);
  if (pending) {
    const split = await call("POST", `/api/admin/requirements/${pending.id}/split`, {
      parts: [
        { title: "冒烟拆分 A", userStory: "作为测试，我想拆分需求，以便验证接口。", acceptance: [pending.acceptance[0]] },
        { title: "冒烟拆分 B", userStory: "作为测试，我想拆分需求，以便验证接口。", acceptance: pending.acceptance.slice(1) },
      ],
    });
    log(split.status === 200 && Array.isArray(split.data?.seqs), `拆分 REQ-${pending.seq}`, JSON.stringify(split.data?.seqs ?? split.data?.error));
  } else log(true, "拆分（跳过：无可拆的待确认需求）");

  const ready = reqs.find((r) => r.status === "READY");
  if (ready) {
    const pr = await call("POST", `/api/admin/requirements/${ready.id}/priority`, { priority: "P1", locked: true });
    log(pr.status === 200, `优先级锁定 REQ-${ready.seq}`);
    const un = await call("POST", `/api/admin/requirements/${ready.id}/priority`, { locked: false });
    log(un.status === 200, `解除锁定 REQ-${ready.seq}`);
  } else log(true, "优先级（跳过：无待开发需求）");

  const rank = await call("POST", "/api/admin/pools/rank", {});
  log(rank.status === 200 && rank.data?.queued === true, "触发项管重排");

  const projects = await call("GET", "/api/admin/projects");
  const active = ((projects.data?.projects as { id: string; active: boolean }[] | undefined) ?? []).find((p) => p.active);
  if (active) {
    const gen = await call("POST", "/api/admin/reports/generate", { projectId: active.id });
    log(gen.status === 200 && gen.data?.queued === true, "日报生成入队");
    const br = await call("GET", `/api/admin/branches?projectId=${active.id}`);
    log(br.status === 200 && Array.isArray(br.data?.branches), "分支列表");
  } else log(true, "日报 / 分支（跳过：无活跃项目）");

  const cfg = await call("GET", "/api/admin/system-config");
  const snap = (d: Record<string, unknown> | null) => (d?.snapshot as { numbers?: Record<string, number> } | undefined)?.numbers;
  log(cfg.status === 200 && !!snap(cfg.data)?.aggWindowMinutes, "系统参数读取");
  const put = await call("PUT", "/api/admin/system-config", { key: "claimTimeoutHours", value: "5" });
  const cfg2 = await call("GET", "/api/admin/system-config");
  log(put.status === 200 && snap(cfg2.data)?.claimTimeoutHours === 5, "系统参数写入生效");
  await call("PUT", "/api/admin/system-config", { key: "claimTimeoutHours", value: "" });
  const bad = await call("PUT", "/api/admin/system-config", { key: "cronDailyReport", value: "not a cron" });
  log(bad.status === 400, "非法 cron 被拒绝");

  const rel = await call("POST", "/api/admin/tasks/nonexistent/release", {});
  log(rel.status === 404, "释放不存在任务 → 404");

  // SSE：6 秒内收到首字节
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(BASE + "/api/events", { headers: { cookie }, signal: ctrl.signal });
    const reader = res.body?.getReader();
    const first = await reader?.read();
    clearTimeout(t);
    ctrl.abort();
    log(res.status === 200 && res.headers.get("content-type")?.includes("text/event-stream") === true && !!first?.value, "SSE /api/events 连通");
  } catch (e) {
    log(false, "SSE /api/events 连通", String(e));
  }

  const pub = await call("GET", "/api/public/submit?token=wrong-token");
  log(pub.status === 200 && pub.data?.ok === false, "公开表单错误令牌 → ok:false");

  // ADR-003：体验包 / 发送队列 / Agent 凭据
  const builds = await call("GET", "/api/admin/builds");
  log(builds.status === 200 && Array.isArray(builds.data?.builds), "体验包列表");
  const noCmd = ((projects.data?.projects as { id: string; buildCommand: string | null }[] | undefined) ?? []).find((p) => !p.buildCommand);
  if (noCmd) {
    const b = await call("POST", "/api/admin/builds", { projectId: noCmd.id, branch: "main" });
    log(b.status === 409, "未配置构建命令时发起构建 → 409");
  } else log(true, "构建校验（跳过：所有项目都配置了命令）");
  const pubBuild = await call("GET", "/api/public/builds/nonexistent?token=x");
  log(pubBuild.status === 404, "公开下载错误令牌 → 404");
  const ob = await call("GET", "/api/admin/wechat-outbox");
  log(ob.status === 200 && Array.isArray(ob.data?.pending) && Array.isArray(ob.data?.failed), "微信发送队列");
  const agentsRes = await call("GET", "/api/admin/agents");
  const agentsList = (agentsRes.data?.agents as { id: string; hasGitToken: boolean }[] | undefined) ?? [];
  log(agentsRes.status === 200 && agentsList.every((a) => typeof a.hasGitToken === "boolean"), "Agent 列表含 hasGitToken");
  if (agentsList[0]) {
    const badTok = await call("PATCH", `/api/admin/agents/${agentsList[0].id}`, { gitToken: "short" });
    log(badTok.status === 400, "过短 PAT 被拒绝");
  }

  const health = await call("GET", "/api/health");
  log(health.status === 200 && health.data?.ok === true, "健康检查");

  console.log(failed ? `\n${failed} 项失败` : "\n全部通过");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
