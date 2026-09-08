"use client";

import { useState } from "react";
import Link from "next/link";
import { Panel, Chip, Label, btnCls, ago, fmtDateTime } from "@/components/ui";
import { Icon } from "@/components/icons";
import { Modal, api, useAction, useToast, CopyButton } from "@/components/ui-client";

// 体验包面板（PRD #27 / ADR-003）：发起构建、查看日志、下载、发给客户

export interface BuildView {
  id: string;
  status: string;
  branch: string;
  createdAt: string;
  finishedAt: string | null;
  artifactName: string | null;
  artifactSize: number | null;
  hasArtifact: boolean;
  requirementSeqs: number[];
  sentTo: { convId: string; at: string }[];
}
export interface BuildsProps {
  projectId: string;
  projectName: string;
  branch: string;
  buildCommand: string | null;
  builds: BuildView[];
  requirementIds: string[];
  bindings: { convId: string; convName: string | null; customerName: string | null }[];
  demo: boolean;
}

const STATUS: Record<string, { label: string; tone: "slate" | "blue" | "green" | "red" }> = {
  QUEUED: { label: "排队中", tone: "slate" },
  RUNNING: { label: "构建中", tone: "blue" },
  SUCCESS: { label: "成功", tone: "green" },
  FAILED: { label: "失败", tone: "red" },
};

function fmtSize(n: number | null): string {
  if (n == null) return "";
  return n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`;
}

export function BuildsPanel({ projectId, projectName, branch, buildCommand, builds, requirementIds, bindings, demo }: BuildsProps) {
  const toast = useToast();
  const { run, busy } = useAction();
  const [logFor, setLogFor] = useState<{ id: string; log: string; command: string } | null>(null);
  const [sendFor, setSendFor] = useState<BuildView | null>(null);
  const [convId, setConvId] = useState(bindings[0]?.convId ?? "");
  const [note, setNote] = useState("");
  const [sentLink, setSentLink] = useState<string | null>(null);
  const active = builds.some((b) => b.status === "QUEUED" || b.status === "RUNNING");
  const guard = () => {
    if (demo) toast("info", "展示模式下操作不生效");
    return demo;
  };

  async function start() {
    if (guard()) return;
    await run("build", "/api/admin/builds", { body: { projectId, branch, requirementIds } }, "已排队构建，完成后自动刷新");
  }
  async function openLog(b: BuildView) {
    if (guard()) return;
    const r = await api<{ log: string; command: string }>(`/api/admin/builds/${b.id}`);
    if (r.ok) setLogFor({ id: b.id, log: r.data.log || "（暂无输出）", command: r.data.command });
    else toast("error", r.message);
  }
  async function send() {
    if (guard() || !sendFor) return;
    const r = await run<{ link: string }>("send", `/api/admin/builds/${sendFor.id}/send`, { body: { convId, note: note.trim() || undefined } }, "已加入微信发送队列");
    if (r.ok) setSentLink(r.data.link);
  }

  return (
    <Panel
      title="体验包"
      pad={false}
      extra={
        <button className={btnCls("secondary", "sm")} disabled={!buildCommand || active || busy === "build"} onClick={start} title={!buildCommand ? "项目未配置构建命令" : active ? "已有构建进行中" : undefined}>
          <Icon name="zap" size={13} />
          构建体验包
        </button>
      }
    >
      {!buildCommand && (
        <p className="border-b border-line px-4 py-3 text-[12px] leading-relaxed text-ink-3">
          {projectName} 未配置构建命令。
          <Link href="/settings?tab=projects" className="ml-1 text-accent hover:underline">
            去设置页填写
          </Link>
          ，产物写到 $BUILD_OUT 后即可在这里一键打包并发给客户。
        </p>
      )}
      {builds.length === 0 ? (
        <p className="px-4 py-4 text-center text-[12px] text-ink-3">该分支还没有构建记录</p>
      ) : (
        <ul className="divide-y divide-line">
          {builds.map((b) => {
            const st = STATUS[b.status] ?? STATUS.QUEUED;
            return (
              <li key={b.id} className="flex flex-col gap-1.5 px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <Chip tone={st.tone}>{st.label}</Chip>
                  <span className="text-[12px] text-ink-3">{b.finishedAt ? fmtDateTime(b.finishedAt) : ago(b.createdAt)}</span>
                  {b.requirementSeqs.length > 0 && <span className="truncate text-[12px] text-ink-3">含 {b.requirementSeqs.map((s) => `REQ-${s}`).join("、")}</span>}
                </div>
                {b.hasArtifact && (
                  <span className="truncate font-mono text-[12px] text-ink">
                    {b.artifactName} <span className="text-ink-3">{fmtSize(b.artifactSize)}</span>
                  </span>
                )}
                {b.status === "SUCCESS" && !b.hasArtifact && <span className="text-[12px] text-warn">构建成功但 $BUILD_OUT 为空，无产物</span>}
                <div className="flex flex-wrap items-center gap-1">
                  <button className={btnCls("ghost", "sm")} onClick={() => openLog(b)}>
                    日志
                  </button>
                  {b.hasArtifact && (
                    <a className={btnCls("ghost", "sm")} href={`/api/admin/builds/${b.id}/artifact`}>
                      <Icon name="download" size={12} />
                      下载
                    </a>
                  )}
                  {b.hasArtifact && (
                    <button className={btnCls("ghost", "sm")} disabled={bindings.length === 0} title={bindings.length === 0 ? "该项目没有启用的微信会话" : undefined} onClick={() => { setSendFor(b); setSentLink(null); setNote(""); }}>
                      <Icon name="send" size={12} />
                      发给客户
                    </button>
                  )}
                  {b.sentTo.length > 0 && <span className="text-[11px] text-ink-3">已发 {b.sentTo.length} 次</span>}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Modal open={!!logFor} onClose={() => setLogFor(null)} title="构建日志" width="max-w-3xl">
        {logFor && (
          <>
            <p className="mb-2 font-mono text-[12px] text-ink-2">$ {logFor.command}</p>
            <pre className="max-h-[60vh] overflow-auto rounded-md border border-line bg-[#111827] p-3 font-mono text-[11px] leading-relaxed text-[#e5e7eb]">{logFor.log}</pre>
          </>
        )}
      </Modal>

      <Modal open={!!sendFor} onClose={() => setSendFor(null)} title="发给客户" width="max-w-md" footer={sentLink ? <CopyButton text={sentLink} label="复制下载链接" /> : <button className={btnCls("primary")} disabled={!convId || busy === "send"} onClick={send}>加入发送队列</button>}>
        {sentLink ? (
          <div className="flex flex-col gap-2 text-[13px]">
            <p className="text-ok">已加入微信发送队列，机器人会在客户下次来消息后回发；也可以直接复制链接发给客户。</p>
            <code className="break-all rounded-md border border-line bg-surface-2 p-2 font-mono text-[12px]">{sentLink}</code>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              <Label>微信会话</Label>
              <select className="ctl" value={convId} onChange={(e) => setConvId(e.target.value)}>
                {bindings.map((b) => (
                  <option key={b.convId} value={b.convId}>
                    {b.convName ?? b.convId}
                    {b.customerName ? ` · ${b.customerName}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <Label>附言（可选）</Label>
              <textarea className="ctl" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="例如：重点看下导出功能" />
            </label>
            <p className="text-[12px] text-ink-3">消息含分支、包含的需求与带令牌的下载链接，无需登录即可下载。</p>
          </div>
        )}
      </Modal>
    </Panel>
  );
}
