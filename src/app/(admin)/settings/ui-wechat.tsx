"use client";

import { useState } from "react";
import { Panel, Table, EmptyRow, Chip, Label, Notice, btnCls, ago } from "@/components/ui";
import { Icon } from "@/components/icons";
import { useAction, useToast } from "@/components/ui-client";

// 微信采集：Bot 状态 + 会话绑定表 + 手动添加绑定

interface Binding {
  id: string;
  convId: string;
  convName: string | null;
  projectId: string | null;
  customerName: string | null;
  captureMode: string;
  paused: boolean;
  pushDailyReport: boolean;
  createdAt: string;
}

export function WechatTab({ bindings, projects, botLastSeen }: { bindings: Binding[]; projects: { id: string; name: string }[]; botLastSeen: string | null }) {
  const toast = useToast();
  const { run, busy } = useAction();
  const [nb, setNb] = useState({ convId: "", convName: "", projectId: "", customerName: "" });
  const healthy = !!botLastSeen && Date.now() - new Date(botLastSeen).getTime() < 5 * 60_000;
  const patch = (b: Binding, body: unknown, ok?: string) => run(`p-${b.id}`, `/api/admin/wechat-bindings/${b.id}`, { method: "PATCH", body }, ok);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!nb.convId.trim()) return toast("error", "convId 必填");
    const r = await run("add", "/api/admin/wechat-bindings", { body: { convId: nb.convId.trim(), convName: nb.convName || undefined, projectId: nb.projectId || null, customerName: nb.customerName || null } }, "已添加并启用采集");
    if (r.ok) setNb({ convId: "", convName: "", projectId: "", customerName: "" });
  }

  return (
    <>
      <Panel
        title="会话绑定"
        pad={false}
        extra={
          <span className="flex items-center gap-2 text-[12px] text-ink-2">
            机器人心跳
            {botLastSeen ? healthy ? <Chip tone="green">在线 · {ago(botLastSeen)}</Chip> : <Chip tone="red">超时 · {ago(botLastSeen)}</Chip> : <Chip tone="slate">未接入</Chip>}
          </span>
        }
      >
        <div className="px-4 pt-3">
          <Notice tone="info">当前微信通道为腾讯 iLink 机器人，仅支持单聊（ADR-002）。客户给机器人发第一条消息后会话自动出现在这里（暂停态），启用并绑定项目后开始采集。</Notice>
        </div>
        <Table head={["会话", "默认项目", "客户", "采集模式", "日报推送", "状态", ""]}>
          {bindings.map((b) => (
            <tr key={b.id}>
              <td>
                <span className="block font-medium text-ink">{b.convName ?? b.convId}</span>
                <span className="block max-w-[200px] truncate font-mono text-[11px] text-ink-3" title={b.convId}>
                  {b.convId} · {ago(b.createdAt)}登记
                </span>
              </td>
              <td>
                <select className="ctl ctl-sm w-auto min-w-[140px]" value={b.projectId ?? ""} disabled={busy === `p-${b.id}`} onChange={(e) => patch(b, { projectId: e.target.value || null })}>
                  <option value="">由拆解判断</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <input className="ctl ctl-sm w-[120px]" defaultValue={b.customerName ?? ""} placeholder="客户名" onBlur={(e) => e.target.value !== (b.customerName ?? "") && patch(b, { customerName: e.target.value || null }, "客户名已更新")} />
              </td>
              <td>
                <select className="ctl ctl-sm w-auto" value={b.captureMode} disabled={busy === `p-${b.id}`} onChange={(e) => patch(b, { captureMode: e.target.value })}>
                  <option value="ALL">全量采集</option>
                  <option value="HASHTAG">#需求 触发</option>
                  <option value="MENTION">@ 触发</option>
                </select>
              </td>
              <td>
                <label className="flex items-center gap-1.5 text-[12px] text-ink-2">
                  <input type="checkbox" className="chk" checked={b.pushDailyReport} onChange={(e) => patch(b, { pushDailyReport: e.target.checked }, e.target.checked ? "该会话将接收日报" : "已取消日报推送")} />
                  接收
                </label>
              </td>
              <td>{b.paused ? <Chip tone="slate">已暂停</Chip> : <Chip tone="green">采集中</Chip>}</td>
              <td className="text-right">
                <button className={btnCls(b.paused ? "primary" : "secondary", "sm")} disabled={busy === `p-${b.id}`} onClick={() => patch(b, { paused: !b.paused }, b.paused ? "已启用采集" : "已暂停采集")}>
                  {b.paused ? "启用" : "暂停"}
                </button>
              </td>
            </tr>
          ))}
          {bindings.length === 0 && <EmptyRow colSpan={7}>暂无会话。让客户给机器人发一条消息即可自动出现，或在下方手动添加。</EmptyRow>}
        </Table>
      </Panel>

      <Panel title="手动添加绑定">
        <form onSubmit={add} className="grid gap-3 md:grid-cols-4">
          <label className="flex flex-col gap-1">
            <Label>convId</Label>
            <input className="ctl font-mono" value={nb.convId} onChange={(e) => setNb({ ...nb, convId: e.target.value })} placeholder="微信会话标识" />
          </label>
          <label className="flex flex-col gap-1">
            <Label>会话名</Label>
            <input className="ctl" value={nb.convName} onChange={(e) => setNb({ ...nb, convName: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1">
            <Label>默认项目</Label>
            <select className="ctl" value={nb.projectId} onChange={(e) => setNb({ ...nb, projectId: e.target.value })}>
              <option value="">由拆解判断</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <Label>客户</Label>
            <input className="ctl" value={nb.customerName} onChange={(e) => setNb({ ...nb, customerName: e.target.value })} />
          </label>
          <div className="md:col-span-4">
            <button type="submit" className={btnCls("secondary")} disabled={busy === "add"}>
              <Icon name="plus" size={14} />
              添加
            </button>
          </div>
        </form>
      </Panel>
    </>
  );
}
