"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// 系统参数 + 项目共享上下文编辑

const input =
  "rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950";
const btn =
  "rounded-lg bg-zinc-900 px-3 py-1.5 text-sm text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900";

export function SystemConfigPanel({ config }: { config: Record<string, string> }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const fields = [
    { key: "dailyTokenLimit", label: "LLM 日消耗上限（tokens）", hint: "超限后次日凌晨在看板告警；留空不限制" },
    { key: "aggWindowMinutes", label: "微信聚合窗口（分钟）", hint: "会话静默该时长后合并为需求线索" },
    { key: "claimTimeoutHours", label: "认领心跳超时（小时）", hint: "超时未心跳的任务自动释放回池" },
  ];

  async function save(key: string, value: string) {
    setBusy(true);
    const res = await fetch("/api/admin/system-config", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key, value }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      alert(data?.error?.message ?? "保存失败");
    } else {
      router.refresh();
    }
    setBusy(false);
  }

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="mb-3 font-medium">系统参数</h2>
      <div className="space-y-3">
        {fields.map((f) => (
          <div key={f.key} className="flex flex-wrap items-center gap-2 text-sm">
            <div className="min-w-44 flex-1">
              <p>{f.label}</p>
              <p className="text-[11px] text-zinc-400">{f.hint}</p>
            </div>
            <input
              className={`${input} w-36`}
              defaultValue={config[f.key] ?? ""}
              placeholder="默认"
              onBlur={(e) => {
                if (e.target.value !== (config[f.key] ?? "")) save(f.key, e.target.value.trim());
              }}
              disabled={busy}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

export function ContextEditor({ projects }: { projects: { id: string; name: string }[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  async function open(id: string) {
    if (openId === id) {
      setOpenId(null);
      return;
    }
    setLoading(true);
    setMsg("");
    setOpenId(id);
    const res = await fetch(`/api/admin/projects/${id}/context`);
    const data = await res.json().catch(() => null);
    if (res.ok) {
      setContent(data.content ?? "# 项目共享上下文\n\n（写给开发/测试 Agent 的项目要点：架构、约定、当前迭代重点）\n");
      if (!data.readable) setMsg("⚠ 仓库暂不可读（GitHub PAT 未配置或仓库未就绪），保存会排队等仓库可用");
    } else {
      setMsg("读取失败");
    }
    setLoading(false);
  }

  async function save() {
    if (!openId) return;
    setLoading(true);
    const res = await fetch(`/api/admin/projects/${openId}/context`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content }),
    });
    setMsg(res.ok ? "✓ 已提交，将 commit 到仓库 docs/agent-context.md" : "保存失败");
    setLoading(false);
  }

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="mb-1 font-medium">项目共享上下文</h2>
      <p className="mb-3 text-xs text-zinc-400">
        docs/agent-context.md — 每个开发/测试 Agent 认领任务时都会读到这份内容
      </p>
      <div className="flex flex-wrap gap-2">
        {projects.map((p) => (
          <button
            key={p.id}
            onClick={() => open(p.id)}
            className={`rounded-lg border px-3 py-1.5 text-sm ${
              openId === p.id
                ? "border-indigo-400 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300"
                : "border-zinc-300 dark:border-zinc-700"
            }`}
          >
            {p.name}
          </button>
        ))}
      </div>
      {openId && (
        <div className="mt-3 space-y-2">
          <textarea
            className="min-h-48 w-full rounded-xl border border-zinc-300 px-3 py-2 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-950"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            disabled={loading}
          />
          <div className="flex items-center gap-2">
            <button onClick={save} disabled={loading} className={btn}>
              {loading ? "处理中…" : "保存并提交入仓"}
            </button>
            {msg && <span className="text-xs text-zinc-500">{msg}</span>}
          </div>
        </div>
      )}
    </section>
  );
}
