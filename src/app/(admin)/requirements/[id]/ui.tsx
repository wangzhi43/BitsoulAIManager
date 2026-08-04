"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// 需求详情页操作区：按状态展示验收/裁决按钮

export function AcceptActions({ id, status, demo }: { id: string; status: string; demo: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function act(action: "accept" | "approve_partial" | "send_back") {
    if (demo) {
      alert("展示模式下操作不生效");
      return;
    }
    const note = action === "send_back" ? window.prompt("退回原因（可选）") ?? undefined : undefined;
    setBusy(true);
    const res = await fetch(`/api/admin/requirements/${id}/accept`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, note }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      alert(data?.error?.message ?? "操作失败");
    }
    router.refresh();
    setBusy(false);
  }

  if (status === "PENDING_ACCEPT") {
    return (
      <section className="rounded-2xl border border-green-200 bg-green-50 p-4 dark:border-green-900 dark:bg-green-950/40">
        <h2 className="mb-2 text-[13px] font-semibold text-green-800 dark:text-green-300">等待验收</h2>
        <p className="mb-3 text-xs text-green-700/70 dark:text-green-400/70">测试已通过，确认功能符合预期后点击验收。</p>
        <button
          disabled={busy}
          onClick={() => act("accept")}
          className="w-full rounded-xl bg-green-600 py-2.5 text-sm font-medium text-white hover:bg-green-500 disabled:opacity-40"
        >
          ✓ 验收通过
        </button>
      </section>
    );
  }

  if (status === "REVIEWING") {
    return (
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/40">
        <h2 className="mb-2 text-[13px] font-semibold text-amber-800 dark:text-amber-300">测试部分通过，等待裁决</h2>
        <div className="space-y-2">
          <button
            disabled={busy}
            onClick={() => act("approve_partial")}
            className="w-full rounded-xl bg-amber-600 py-2.5 text-sm font-medium text-white hover:bg-amber-500 disabled:opacity-40"
          >
            放行至待验收
          </button>
          <button
            disabled={busy}
            onClick={() => act("send_back")}
            className="w-full rounded-xl border border-amber-300 py-2.5 text-sm font-medium text-amber-800 disabled:opacity-40 dark:border-amber-800 dark:text-amber-300"
          >
            退回重做
          </button>
        </div>
      </section>
    );
  }

  return null;
}

export function ManageActions({ id, status, demo }: { id: string; status: string; demo: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function act(action: "close" | "hold" | "resume") {
    if (demo) {
      alert("展示模式下操作不生效");
      return;
    }
    const label = action === "close" ? "关闭" : action === "hold" ? "挂起" : "恢复";
    const note = window.prompt(`${label}原因（可选）`) ?? undefined;
    if (action === "close" && !window.confirm("确认关闭该需求？进行中的认领会被释放")) return;
    setBusy(true);
    const res = await fetch(`/api/admin/requirements/${id}/state`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, note }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      alert(data?.error?.message ?? "操作失败");
    }
    router.refresh();
    setBusy(false);
  }

  const terminal = status === "ACCEPTED";
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="mb-2 text-[13px] font-semibold">管理操作</h2>
      <div className="flex flex-wrap gap-2">
        {status !== "CLOSED" && status !== "ON_HOLD" && !terminal && (
          <>
            <button disabled={busy} onClick={() => act("hold")} className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-300">
              ⏸ 挂起
            </button>
            <button disabled={busy} onClick={() => act("close")} className="rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-600 dark:border-red-900">
              ✕ 关闭
            </button>
          </>
        )}
        {(status === "CLOSED" || status === "ON_HOLD") && (
          <button disabled={busy} onClick={() => act("resume")} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-500">
            ↻ 恢复
          </button>
        )}
        {terminal && <p className="text-xs text-zinc-400">已验收，无可用操作</p>}
      </div>
    </section>
  );
}
