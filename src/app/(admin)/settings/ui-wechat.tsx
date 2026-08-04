"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Binding {
  id: string;
  convId: string;
  convName: string | null;
  projectId: string | null;
  customerName: string | null;
  captureMode: string;
  paused: boolean;
}

const input =
  "rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950";

export function WechatSection({
  bindings,
  projects,
  botLastSeen,
}: {
  bindings: Binding[];
  projects: { id: string; name: string }[];
  botLastSeen: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const botHealthy = botLastSeen && Date.now() - new Date(botLastSeen).getTime() < 5 * 60_000;

  async function patch(id: string, body: unknown) {
    setBusy(true);
    const res = await fetch(`/api/admin/wechat-bindings/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) alert("操作失败");
    else router.refresh();
    setBusy(false);
  }

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-medium">微信采集</h2>
        <span className={`text-xs ${botHealthy ? "text-green-600" : "text-red-500"}`}>
          {botHealthy
            ? "● Bot 在线"
            : botLastSeen
              ? `● Bot 离线（最后心跳 ${new Date(botLastSeen).toLocaleString("zh-CN")}）`
              : "● Bot 未接入"}
        </span>
      </div>
      <p className="mb-3 text-xs opacity-60">
        新会话给机器人发消息后会自动出现在这里（暂停态）；启用并绑定项目后开始采集。当前通道仅支持单聊（ADR-002）。
      </p>
      <ul className="space-y-2">
        {bindings.map((b) => (
          <li key={b.id} className="rounded-xl border border-zinc-200 p-3 text-sm dark:border-zinc-800">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{b.convName ?? b.convId}</span>
              <span className="max-w-40 truncate font-mono text-xs opacity-40">{b.convId}</span>
              <button
                disabled={busy}
                onClick={() => patch(b.id, { paused: !b.paused })}
                className={`rounded px-2 py-0.5 text-xs ${
                  b.paused
                    ? "border border-zinc-300 dark:border-zinc-700"
                    : "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300"
                }`}
              >
                {b.paused ? "已暂停 · 点击启用" : "采集中 · 点击暂停"}
              </button>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <select
                className={input}
                value={b.projectId ?? ""}
                disabled={busy}
                onChange={(e) => patch(b.id, { projectId: e.target.value || null })}
              >
                <option value="">默认项目：由拆解判断</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <select
                className={input}
                value={b.captureMode}
                disabled={busy}
                onChange={(e) => patch(b.id, { captureMode: e.target.value })}
              >
                <option value="ALL">全量采集</option>
                <option value="HASHTAG">#需求 触发</option>
                <option value="MENTION">@ 触发</option>
              </select>
              <input
                className={input}
                placeholder="客户名"
                defaultValue={b.customerName ?? ""}
                disabled={busy}
                onBlur={(e) => {
                  if (e.target.value !== (b.customerName ?? "")) {
                    patch(b.id, { customerName: e.target.value || null });
                  }
                }}
              />
            </div>
          </li>
        ))}
        {bindings.length === 0 && (
          <p className="text-sm opacity-50">暂无会话——让客户给机器人微信发一条消息即可出现</p>
        )}
      </ul>
    </section>
  );
}
