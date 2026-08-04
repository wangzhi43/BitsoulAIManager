"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

async function setDemo(on: boolean) {
  await fetch("/api/admin/demo", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ on }),
  });
}

/** 展示模式下的悬浮横幅（带关闭） */
export function DemoBanner() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <div className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-3 bg-indigo-600 px-4 py-1.5 text-xs text-white">
      <span className="font-medium">前端展示模式</span>
      <span className="opacity-80">当前为示例数据，仅供验收视觉效果，操作不会生效</span>
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await setDemo(false);
          router.refresh();
        }}
        className="rounded-full bg-white/20 px-2.5 py-0.5 font-medium hover:bg-white/30"
      >
        关闭
      </button>
    </div>
  );
}

/** 「更多」页里的开关入口 */
export function DemoToggle({ on }: { on: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await setDemo(!on);
        router.refresh();
        setBusy(false);
      }}
      className="block w-full rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-left dark:border-indigo-900 dark:bg-indigo-950/40"
    >
      <p className="flex items-center justify-between font-medium text-indigo-900 dark:text-indigo-200">
        前端展示模式
        <span
          className={`rounded-full px-2 py-0.5 text-xs ${
            on ? "bg-indigo-600 text-white" : "bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300"
          }`}
        >
          {on ? "已开启" : "已关闭"}
        </span>
      </p>
      <p className="mt-1 text-sm text-indigo-900/60 dark:text-indigo-200/60">
        开启后全站以示例数据渲染，用于查看各页面的完整视觉效果；关闭后恢复真实数据。
      </p>
    </button>
  );
}
