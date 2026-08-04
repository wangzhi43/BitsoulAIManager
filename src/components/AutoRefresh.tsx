"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// 轻轮询刷新（30s）：满足看板/审批页的准实时需求。SSE 推送列入 P1（ADR 备注）。
export function AutoRefresh({ intervalMs = 30_000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, intervalMs);
    return () => clearInterval(t);
  }, [router, intervalMs]);
  return null;
}
