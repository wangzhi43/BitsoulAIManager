"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function MergeButton({ branchId, disabled }: { branchId: string; disabled: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function merge() {
    if (!window.confirm("确认把该当日分支合并回 main？")) return;
    setBusy(true);
    const res = await fetch(`/api/admin/branches/${branchId}/merge`, { method: "POST" });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      alert(data?.error?.message ?? "合并失败");
    } else {
      alert("已提交合并，稍后刷新查看结果");
      router.refresh();
    }
    setBusy(false);
  }

  return (
    <button
      onClick={merge}
      disabled={disabled || busy}
      className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
    >
      {busy ? "提交中…" : "合并到 main"}
    </button>
  );
}
