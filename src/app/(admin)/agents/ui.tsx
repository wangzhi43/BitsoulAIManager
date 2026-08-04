"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const input =
  "rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950";

export function AgentAdmin({
  projects,
  agents,
}: {
  projects: { id: string; name: string }[];
  agents: { id: string; username: string; enabled: boolean }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ username: "", password: "", role: "DEVELOPER", projectIds: [] as string[] });

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await fetch("/api/admin/agents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(f),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      alert(data?.error?.message ?? "创建失败");
    } else {
      setF({ username: "", password: "", role: "DEVELOPER", projectIds: [] });
      router.refresh();
    }
    setBusy(false);
  }

  async function toggle(id: string, enabled: boolean) {
    setBusy(true);
    await fetch(`/api/admin/agents/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: !enabled }),
    });
    router.refresh();
    setBusy(false);
  }

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="mb-3 font-medium">账号管理</h2>
      <form onSubmit={create} className="grid gap-2 sm:grid-cols-2">
        <input
          className={input}
          placeholder="用户名（如 dev-agent-1）"
          value={f.username}
          onChange={(e) => setF({ ...f, username: e.target.value })}
        />
        <input
          className={input}
          placeholder="密码（≥8 位）"
          type="password"
          value={f.password}
          onChange={(e) => setF({ ...f, password: e.target.value })}
        />
        <select className={input} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
          <option value="DEVELOPER">开发</option>
          <option value="TESTER">测试</option>
          <option value="BOTH">开发+测试</option>
        </select>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {projects.map((p) => (
            <label key={p.id} className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={f.projectIds.includes(p.id)}
                onChange={(e) =>
                  setF({
                    ...f,
                    projectIds: e.target.checked
                      ? [...f.projectIds, p.id]
                      : f.projectIds.filter((x) => x !== p.id),
                  })
                }
              />
              {p.name}
            </label>
          ))}
        </div>
        <button
          type="submit"
          disabled={busy || !f.username || f.password.length < 8 || f.projectIds.length === 0}
          className="rounded-lg bg-zinc-900 px-3 py-2 text-sm text-white disabled:opacity-40 sm:col-span-2 dark:bg-zinc-100 dark:text-zinc-900"
        >
          创建 Agent 账号
        </button>
      </form>

      {agents.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {agents.map((a) => (
            <button
              key={a.id}
              disabled={busy}
              onClick={() => toggle(a.id, a.enabled)}
              className="rounded-lg border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700"
            >
              {a.enabled ? `禁用 ${a.username}` : `启用 ${a.username}`}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
