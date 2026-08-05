"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Panel } from "@/components/ui";

interface Binding {
  id: string;
  convId: string;
  convName: string | null;
  projectId: string | null;
  customerName: string | null;
  captureMode: string;
  paused: boolean;
  pushDailyReport: boolean;
}

const input =
  "rounded-lg border border-slate-300 px-3 py-2 text-[13px] focus:border-blue-500 focus:outline-none";

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
    <Panel
      title="微信采集"
      extra={
        <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium ${botHealthy ? "text-green-600" : "text-red-500"}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${botHealthy ? "bg-green-500" : "bg-red-400"}`} />
          {botHealthy
            ? "Bot 在线"
            : botLastSeen
              ? `Bot 离线（最后心跳 ${new Date(botLastSeen).toLocaleString("zh-CN")}）`
              : "Bot 未接入"}
        </span>
      }
    >
      <p className="-mt-1 mb-3 text-[12px] text-slate-400">
        新会话给机器人发消息后会自动出现在这里（暂停态）；启用并绑定项目后开始采集。当前通道仅支持单聊（ADR-002）。
      </p>
      <ul className="space-y-2">
        {bindings.map((b) => (
          <li key={b.id} className="rounded-lg border border-slate-200 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[13px] font-medium text-slate-700">{b.convName ?? b.convId}</span>
              <span className="max-w-40 truncate font-mono text-[11px] text-slate-300">{b.convId}</span>
              <button
                disabled={busy}
                onClick={() => patch(b.id, { paused: !b.paused })}
                className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                  b.paused
                    ? "border border-slate-300 text-slate-500 hover:bg-slate-50"
                    : "bg-green-50 text-green-600 hover:bg-green-100"
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
              <button
                disabled={busy}
                onClick={() => patch(b.id, { pushDailyReport: !b.pushDailyReport })}
                className={`rounded-lg border px-2.5 py-1.5 text-[12px] font-medium transition-colors ${
                  b.pushDailyReport
                    ? "border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100"
                    : "border-slate-300 text-slate-500 hover:bg-slate-50"
                }`}
                title="勾选后该会话每晚接收项目日报"
              >
                {b.pushDailyReport ? "📩 接收日报" : "日报推送：关"}
              </button>
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
          <p className="text-[13px] text-slate-400">暂无会话——让客户给机器人微信发一条消息即可出现</p>
        )}
      </ul>
    </Panel>
  );
}
