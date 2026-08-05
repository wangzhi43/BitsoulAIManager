"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Panel, btnCls } from "@/components/ui";

// 系统参数 + 项目共享上下文编辑

const input =
  "rounded-lg border border-slate-300 px-3 py-2 text-[13px] focus:border-blue-500 focus:outline-none";

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
    <Panel title="系统参数">
      <div className="space-y-3">
        {fields.map((f) => (
          <div key={f.key} className="flex flex-wrap items-center gap-2">
            <div className="min-w-44 flex-1">
              <p className="text-[13px] text-slate-600">{f.label}</p>
              <p className="text-[11px] text-slate-400">{f.hint}</p>
            </div>
            <input
              className={`${input} w-36 tabular-nums`}
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
    </Panel>
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
    <Panel title="项目共享上下文">
      <p className="-mt-1 mb-3 text-[12px] text-slate-400">
        docs/agent-context.md — 每个开发/测试 Agent 认领任务时都会读到这份内容
      </p>
      <div className="flex flex-wrap gap-2">
        {projects.map((p) => (
          <button
            key={p.id}
            onClick={() => open(p.id)}
            className={
              openId === p.id
                ? "inline-flex items-center justify-center rounded-lg border border-blue-300 bg-blue-50 px-2.5 py-1.5 text-[12px] font-medium text-blue-600"
                : btnCls("secondary", "sm")
            }
          >
            {p.name}
          </button>
        ))}
      </div>
      {openId && (
        <div className="mt-3 space-y-2">
          <textarea
            className="min-h-48 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-[12px] focus:border-blue-500 focus:outline-none"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            disabled={loading}
          />
          <div className="flex items-center gap-2">
            <button onClick={save} disabled={loading} className={btnCls("primary", "sm")}>
              {loading ? "处理中…" : "保存并提交入仓"}
            </button>
            {msg && <span className="text-[12px] text-slate-500">{msg}</span>}
          </div>
        </div>
      )}
    </Panel>
  );
}
