"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { btnCls } from "./ui";

// 展示模式开关（cookie，见 /api/admin/demo）：全站以示例数据渲染，用于演示与视觉验收

async function setDemo(on: boolean) {
  await fetch("/api/admin/demo", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ on }),
  });
}

/** 展示模式顶部横条 */
export function DemoBanner() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <div className="fixed inset-x-0 top-0 z-50 flex h-8 items-center justify-center gap-3 bg-warn px-4 text-[12px] text-white">
      <span className="font-medium">展示模式</span>
      <span className="hidden opacity-90 sm:inline">当前为示例数据，操作不会生效</span>
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await setDemo(false);
          router.refresh();
        }}
        className="rounded border border-white/40 px-2 py-0.5 font-medium hover:bg-white/15"
      >
        关闭
      </button>
    </div>
  );
}

/** 「更多」页开关 */
export function DemoToggle({ on }: { on: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-line bg-surface p-4">
      <div>
        <p className="text-[13px] font-semibold text-ink">展示模式</p>
        <p className="mt-0.5 text-[12px] text-ink-3">开启后全站以示例数据渲染，用于演示各页面完整效果；关闭后恢复真实数据。</p>
      </div>
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await setDemo(!on);
          router.refresh();
          setBusy(false);
        }}
        className={btnCls(on ? "secondary" : "primary", "md")}
      >
        {busy ? "切换中…" : on ? "关闭" : "开启"}
      </button>
    </div>
  );
}
