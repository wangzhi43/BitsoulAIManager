"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function PriorityControls({
  id,
  priority,
  locked,
}: {
  id: string;
  priority: string | null;
  locked: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function set(body: { priority?: string; locked?: boolean }) {
    setBusy(true);
    const res = await fetch(`/api/admin/requirements/${id}/priority`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) alert("操作失败");
    else router.refresh();
    setBusy(false);
  }

  return (
    <div className="flex items-center gap-1.5">
      {(["P0", "P1", "P2", "P3"] as const).map((p) => (
        <button
          key={p}
          disabled={busy}
          onClick={() => set({ priority: p })}
          className={`rounded px-2 py-0.5 text-xs ${
            priority === p
              ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
              : "border border-zinc-300 opacity-60 dark:border-zinc-700"
          }`}
        >
          {p}
        </button>
      ))}
      <button
        disabled={busy}
        onClick={() => set({ locked: !locked })}
        className={`ml-1 rounded px-2 py-0.5 text-xs ${
          locked
            ? "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300"
            : "border border-zinc-300 opacity-60 dark:border-zinc-700"
        }`}
        title={locked ? "已锁定，项管 Agent 不会改动" : "锁定优先级"}
      >
        {locked ? "🔒 已锁" : "锁定"}
      </button>
    </div>
  );
}
