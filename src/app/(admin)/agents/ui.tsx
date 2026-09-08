"use client";

import { useState } from "react";
import Link from "next/link";
import { Panel, Table, Chip, Label, Notice, btnCls, ago } from "@/components/ui";
import { Icon } from "@/components/icons";
import { Modal, ConfirmDialog, CopyButton, useAction, useToast } from "@/components/ui-client";

export interface AgentRow {
  id: string;
  username: string;
  role: string;
  enabled: boolean;
  projectIds: string[];
  hasGitToken: boolean;
  lastSeenAt: string | null;
  devCount: number;
  testCount: number;
  current: { taskId: string; label: string; reqId: string; reqSeq: number; title: string }[];
}

const ROLE_LABEL: Record<string, string> = { DEVELOPER: "开发", TESTER: "测试", BOTH: "全能" };
const DEMO_MSG = "展示模式下操作不生效";

export function AgentTable({ rows, projects, demo }: { rows: AgentRow[]; projects: { id: string; name: string }[]; demo: boolean }) {
  const toast = useToast();
  const { run, busy } = useAction();
  const [edit, setEdit] = useState<AgentRow | null>(null);
  const [form, setForm] = useState({ role: "DEVELOPER", projectIds: [] as string[], password: "", gitToken: "", clearGitToken: false });
  const [release, setRelease] = useState<{ a: AgentRow; t: AgentRow["current"][number] } | null>(null);
  const pname = (id: string) => projects.find((p) => p.id === id)?.name ?? id;
  const guard = () => {
    if (demo) toast("info", DEMO_MSG);
    return demo;
  };

  function openEdit(a: AgentRow) {
    setForm({ role: a.role, projectIds: a.projectIds, password: "", gitToken: "", clearGitToken: false });
    setEdit(a);
  }
  async function saveEdit() {
    if (guard() || !edit) return;
    if (form.projectIds.length === 0) return toast("error", "至少选择一个项目");
    const body: Record<string, unknown> = { role: form.role, projectIds: form.projectIds };
    if (form.password) {
      if (form.password.length < 8) return toast("error", "新密码至少 8 位");
      body.password = form.password;
    }
    if (form.clearGitToken) body.gitToken = "";
    else if (form.gitToken.trim()) {
      if (form.gitToken.trim().length < 20) return toast("error", "GitHub PAT 长度不对");
      body.gitToken = form.gitToken.trim();
    }
    const r = await run("edit", `/api/admin/agents/${edit.id}`, { method: "PATCH", body }, "已保存");
    if (r.ok) setEdit(null);
  }

  return (
    <>
      <Table head={["账号", "角色", "项目范围", "Git 凭据", "当前任务", "最近活动", "完成", "状态", ""]}>
        {rows.map((a) => {
          const active = a.lastSeenAt && Date.now() - new Date(a.lastSeenAt).getTime() < 3600_000;
          return (
            <tr key={a.id}>
              <td className="whitespace-nowrap font-mono text-[12px] font-medium text-ink">{a.username}</td>
              <td>
                <Chip tone={a.role === "TESTER" ? "amber" : a.role === "BOTH" ? "blue" : "slate"}>{ROLE_LABEL[a.role] ?? a.role}</Chip>
              </td>
              <td className="max-w-[200px] truncate text-[12px] text-ink-2" title={a.projectIds.map(pname).join(", ")}>
                {a.projectIds.map(pname).join(", ") || "—"}
              </td>
              <td>{a.hasGitToken ? <Chip tone="green">自有 PAT</Chip> : <Chip tone="slate" title="认领时下发全局 GITHUB_BOT_PAT">共用</Chip>}</td>
              <td className="text-[12px]">
                {a.current.length === 0 ? (
                  <span className="text-ink-3">—</span>
                ) : (
                  a.current.map((t) => (
                    <span key={t.taskId} className="block truncate">
                      <span className="text-ink-3">{t.label} </span>
                      <Link href={`/requirements/${t.reqId}`} className="text-accent hover:underline">
                        REQ-{t.reqSeq}
                      </Link>{" "}
                      <span className="text-ink-2">{t.title}</span>
                    </span>
                  ))
                )}
              </td>
              <td className="whitespace-nowrap text-[12px] text-ink-2">
                <span className={`mr-1.5 inline-block h-[7px] w-[7px] rounded-full ${active ? "bg-ok" : "bg-line-strong"}`} />
                {a.lastSeenAt ? ago(a.lastSeenAt) : "从未连接"}
              </td>
              <td className="num text-[12px] text-ink-2">
                {a.devCount + a.testCount}
                <span className="text-ink-3"> ({a.devCount}/{a.testCount})</span>
              </td>
              <td>{a.enabled ? <Chip tone="green">已启用</Chip> : <Chip tone="slate">已禁用</Chip>}</td>
              <td className="text-right">
                <span className="flex justify-end gap-1">
                  <button className={btnCls("ghost", "sm")} onClick={() => openEdit(a)}>
                    编辑
                  </button>
                  <button className={btnCls("ghost", "sm")} disabled={busy === `toggle-${a.id}`} onClick={() => (guard() ? null : run(`toggle-${a.id}`, `/api/admin/agents/${a.id}`, { method: "PATCH", body: { enabled: !a.enabled } }, a.enabled ? "已禁用，token 已吊销" : "已启用"))}>
                    {a.enabled ? "禁用" : "启用"}
                  </button>
                  {a.current.map((t) => (
                    <button key={t.taskId} className={btnCls("ghost", "sm", "text-danger")} onClick={() => setRelease({ a, t })}>
                      释放 REQ-{t.reqSeq}
                    </button>
                  ))}
                </span>
              </td>
            </tr>
          );
        })}
      </Table>

      <Modal open={!!edit} onClose={() => setEdit(null)} title={`编辑 ${edit?.username}`} width="max-w-md" footer={<button className={btnCls("primary")} disabled={busy === "edit"} onClick={saveEdit}>保存</button>}>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <Label>角色</Label>
            <select className="ctl" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="DEVELOPER">开发</option>
              <option value="TESTER">测试</option>
              <option value="BOTH">全能（开发 + 测试）</option>
            </select>
          </label>
          <div className="flex flex-col gap-1">
            <Label>可访问项目</Label>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {projects.map((p) => (
                <label key={p.id} className="flex items-center gap-1.5 text-[13px] text-ink">
                  <input type="checkbox" className="chk" checked={form.projectIds.includes(p.id)} onChange={(e) => setForm({ ...form, projectIds: e.target.checked ? [...form.projectIds, p.id] : form.projectIds.filter((x) => x !== p.id) })} />
                  {p.name}
                </label>
              ))}
            </div>
          </div>
          <label className="flex flex-col gap-1">
            <Label>重置密码（留空不改）</Label>
            <input type="password" className="ctl" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="至少 8 位；改密后旧 token 全部失效" />
          </label>
          <label className="flex flex-col gap-1">
            <Label>GitHub PAT（{edit?.hasGitToken ? "已配置，留空不改" : "未配置，认领时下发全局 bot PAT"}）</Label>
            <input type="password" className="ctl font-mono" autoComplete="off" value={form.gitToken} disabled={form.clearGitToken} onChange={(e) => setForm({ ...form, gitToken: e.target.value })} placeholder="github_pat_… 仅授权该 Agent 可访问的仓库" />
          </label>
          {edit?.hasGitToken && (
            <label className="flex items-center gap-2 text-[12px] text-ink-2">
              <input type="checkbox" className="chk" checked={form.clearGitToken} onChange={(e) => setForm({ ...form, clearGitToken: e.target.checked })} />
              清除已配置的 PAT（回退为全局 bot PAT）
            </label>
          )}
        </div>
      </Modal>

      <ConfirmDialog open={!!release} onClose={() => setRelease(null)} title={`释放 REQ-${release?.t.reqSeq} 的认领`} desc={`${release?.a.username} 的认领将被取消，任务回到池中。`} confirmText="释放" danger busy={busy === "release"} onConfirm={async () => { if (guard() || !release) return; const r = await run("release", `/api/admin/tasks/${release.t.taskId}/release`, { method: "POST", body: {} }, "已释放"); if (r.ok) setRelease(null); }} />
    </>
  );
}

export function CreateAgentForm({ projects, demo }: { projects: { id: string; name: string }[]; demo: boolean }) {
  const toast = useToast();
  const { run, busy } = useAction();
  const [form, setForm] = useState({ username: "", password: "", role: "DEVELOPER", projectIds: [] as string[], gitToken: "" });
  const [created, setCreated] = useState<{ username: string; password: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (demo) return toast("info", DEMO_MSG);
    if (!/^[a-zA-Z0-9_-]{3,32}$/.test(form.username)) return toast("error", "用户名 3-32 位，字母数字 - _");
    if (form.password.length < 8) return toast("error", "密码至少 8 位");
    if (form.projectIds.length === 0) return toast("error", "至少选择一个项目");
    if (form.gitToken.trim() && form.gitToken.trim().length < 20) return toast("error", "GitHub PAT 长度不对");
    const r = await run("create", "/api/admin/agents", { body: { ...form, gitToken: form.gitToken.trim() || undefined } }, "账号已创建");
    if (r.ok) {
      setCreated({ username: form.username, password: form.password });
      setForm({ username: "", password: "", role: "DEVELOPER", projectIds: [], gitToken: "" });
    }
  }

  return (
    <Panel title="创建账号">
      {created && (
        <Notice tone="ok" className="mb-3">
          <div className="flex flex-col gap-1">
            <span>已创建，凭据只显示这一次：</span>
            <code className="font-mono text-[12px]">
              {created.username} / {created.password}
            </code>
            <div className="flex items-center gap-2">
              <CopyButton text={`用户名：${created.username}\n密码：${created.password}\n平台：${typeof window !== "undefined" ? window.location.origin : ""}\n接入指引：https://github.com/wangzhi43/BitsoulAIManager/blob/main/docs/api/AGENT_GUIDE.md`} label="复制接入信息" />
              <a href="https://github.com/wangzhi43/BitsoulAIManager/blob/main/docs/api/AGENT_GUIDE.md" target="_blank" rel="noreferrer" className="text-[12px] text-accent hover:underline">
                接入指引
              </a>
            </div>
          </div>
        </Notice>
      )}
      <form onSubmit={submit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <Label>用户名</Label>
          <input className="ctl font-mono" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="dev-agent-1" />
        </label>
        <label className="flex flex-col gap-1">
          <Label>密码</Label>
          <input type="password" className="ctl" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="至少 8 位" />
        </label>
        <label className="flex flex-col gap-1">
          <Label>角色</Label>
          <select className="ctl" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="DEVELOPER">开发</option>
            <option value="TESTER">测试</option>
            <option value="BOTH">全能（开发 + 测试）</option>
          </select>
        </label>
        <div className="flex flex-col gap-1">
          <Label>可访问项目</Label>
          {projects.length === 0 && <span className="text-[12px] text-ink-3">先在设置页添加项目</span>}
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {projects.map((p) => (
              <label key={p.id} className="flex items-center gap-1.5 text-[13px] text-ink">
                <input type="checkbox" className="chk" checked={form.projectIds.includes(p.id)} onChange={(e) => setForm({ ...form, projectIds: e.target.checked ? [...form.projectIds, p.id] : form.projectIds.filter((x) => x !== p.id) })} />
                {p.name}
              </label>
            ))}
          </div>
        </div>
        <label className="flex flex-col gap-1">
          <Label>GitHub PAT（可选）</Label>
          <input type="password" className="ctl font-mono" autoComplete="off" value={form.gitToken} onChange={(e) => setForm({ ...form, gitToken: e.target.value })} placeholder="不填则认领时下发全局 bot PAT" />
        </label>
        <button type="submit" className={btnCls("primary", "md", "w-full")} disabled={busy === "create"}>
          <Icon name="plus" size={14} />
          创建 Agent 账号
        </button>
      </form>
    </Panel>
  );
}
