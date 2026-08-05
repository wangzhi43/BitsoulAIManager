"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Panel, Chip, btnCls } from "@/components/ui";

// 需求详情页客户端交互：
// RefreshButton 顶栏刷新 / ClarifyCard 澄清问题卡片（生成微信澄清文案）
// ConfirmActionBar 待确认状态的底部固定操作条（编辑 / 合并 / 驳回重拆 / 确认）
// AcceptActions、ManageActions 验收与生命周期管理（沿用原有 API）

async function call(path: string, body?: unknown, method = "POST"): Promise<boolean> {
  const res = await fetch(path, {
    method,
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : "{}",
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    alert(data?.error?.message ?? `操作失败（${res.status}）`);
    return false;
  }
  return true;
}

export function RefreshButton() {
  const router = useRouter();
  return (
    <button onClick={() => router.refresh()} className={btnCls("secondary", "sm")}>
      刷新
    </button>
  );
}

/** 参考图中存在但后端尚未提供的入口：视觉保留，点击提示待接入 */
export function TodoAction({ label, kind }: { label: string; kind: "ghost" | "link" }) {
  const cls = kind === "link" ? "text-[12px] font-medium text-blue-600 hover:underline" : btnCls("ghost", "sm");
  return (
    <button className={cls} onClick={() => alert("功能待接入")}>
      {label}
    </button>
  );
}

export function ClarifyCard({
  id,
  clarifications,
  demo,
  mock = false,
}: {
  id: string;
  clarifications: { question: string; answer: string | null }[];
  demo: boolean;
  mock?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const open = clarifications.filter((c) => !c.answer);

  async function send() {
    if (mock) {
      alert("当前澄清问题为示例数据（MOCK），真实澄清链路接入后可用");
      return;
    }
    if (demo) {
      alert("展示模式下操作不生效");
      return;
    }
    setBusy(true);
    const res = await fetch(`/api/admin/requirements/${id}/clarify-message`, { method: "POST" });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      alert(data?.error?.message ?? "生成失败");
    } else {
      try {
        await navigator.clipboard.writeText(data.message);
      } catch {}
      alert(data.sentToWechat ? "已发送到客户微信会话，并复制到剪贴板" : "文案已复制到剪贴板（该需求非微信来源，需手动转发）");
    }
    setBusy(false);
  }

  return (
    <Panel
      title={
        <>
          澄清问题{clarifications.length > 0 && <span className="ml-1 font-normal text-slate-400">（{clarifications.length}）</span>}
        </>
      }
      extra={
        open.length > 0 ? (
          <button onClick={send} disabled={busy} className="text-[12px] font-medium text-blue-600 hover:underline disabled:opacity-50">
            生成微信澄清文案
          </button>
        ) : undefined
      }
    >
      {clarifications.length > 0 ? (
        <ol className="space-y-2.5">
          {clarifications.map((c, i) => (
            <li key={i} className="flex items-start justify-between gap-3">
              <div className="min-w-0 text-[13px] leading-relaxed text-slate-600">
                <span className="mr-1 tabular-nums text-slate-400">{i + 1}.</span>
                {c.question}
                {c.answer && <p className="mt-0.5 text-[12px] text-slate-400">答：{c.answer}</p>}
              </div>
              <span className="mt-0.5 shrink-0">
                <Chip tone={c.answer ? "green" : "amber"}>{c.answer ? "已回复" : "待确认"}</Chip>
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-[12px] text-slate-400">暂无澄清问题</p>
      )}
    </Panel>
  );
}

interface BarProps {
  id: string;
  demo: boolean;
  title: string;
  userStory: string;
  acceptance: string[];
  projectId: string | null;
  projects: { id: string; name: string }[];
  candidates: { id: string; seq: number; title: string }[];
}

export function ConfirmActionBar({ id, demo, title, userStory, acceptance, projectId, projects, candidates }: BarProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<"edit" | "merge" | null>(null);
  const [projectChoice, setProjectChoice] = useState(projectId ?? "");
  const [mergeSel, setMergeSel] = useState<string[]>([]);
  const [draft, setDraft] = useState({ title, userStory, acceptance: acceptance.join("\n") });

  function guard(): boolean {
    if (demo) {
      alert("展示模式下操作不生效");
      return false;
    }
    return true;
  }

  async function confirm() {
    if (!guard()) return;
    if (!projectChoice) {
      alert("请先选择归属项目");
      return;
    }
    setBusy(true);
    if (await call(`/api/admin/requirements/${id}/confirm`, { projectId: projectChoice })) router.refresh();
    setBusy(false);
  }

  async function rejectReparse() {
    if (!guard()) return;
    const reason = window.prompt("驳回并重拆——请填写原因（会提供给拆解 Agent）");
    if (!reason) return;
    setBusy(true);
    if (await call(`/api/admin/requirements/${id}/reject`, { reason, reparse: true })) router.refresh();
    setBusy(false);
  }

  async function saveEdit() {
    if (!guard()) return;
    setBusy(true);
    const list = draft.acceptance
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    if (await call(`/api/admin/requirements/${id}`, { title: draft.title, userStory: draft.userStory, acceptance: list }, "PATCH")) {
      setModal(null);
      router.refresh();
    }
    setBusy(false);
  }

  async function merge() {
    if (!guard()) return;
    if (mergeSel.length === 0) {
      alert("请选择要并入本单的需求");
      return;
    }
    setBusy(true);
    if (await call("/api/admin/requirements/merge", { intoId: id, fromIds: mergeSel })) {
      setModal(null);
      setMergeSel([]);
      router.refresh();
    }
    setBusy(false);
  }

  return (
    <>
      {/* 底部固定操作条：小屏为移动端底部导航让位（bottom-16），大屏贴底 */}
      <div className="sticky bottom-16 z-30 -mx-4 -mb-5 mt-4 border-t border-slate-200 bg-white px-4 py-3 shadow-[0_-1px_2px_rgba(15,23,42,0.04)] sm:-mx-6 sm:px-6 lg:bottom-0 xl:-mx-7 xl:px-7">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <p className="text-[12px] text-slate-500">
            <span className="mr-1 text-slate-400">ⓘ</span>确认后将进入「待开发」阶段
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={projectChoice}
              onChange={(e) => setProjectChoice(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-[12px] text-slate-700 focus:border-blue-400 focus:outline-none"
            >
              <option value="" disabled>
                选择归属项目
              </option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button
              onClick={() => {
                setDraft({ title, userStory, acceptance: acceptance.join("\n") });
                setModal("edit");
              }}
              disabled={busy}
              className={btnCls("secondary", "md")}
            >
              编辑
            </button>
            {/* 拆开需求：后端暂无拆分 API，视觉保留，点击提示待接入 */}
            <button onClick={() => alert("功能待接入")} disabled={busy} className={btnCls("secondary", "md")}>
              拆开需求
            </button>
            <button onClick={() => setModal("merge")} disabled={busy || candidates.length === 0} className={btnCls("secondary", "md")}>
              与其他需求合并
            </button>
            <button
              onClick={rejectReparse}
              disabled={busy}
              className="rounded-lg border border-red-200 bg-red-50 px-4 py-1.5 text-center transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="block text-[13px] font-medium leading-tight text-red-600">驳回重拆</span>
              <span className="block text-[10px] leading-tight text-red-400">需填写驳回原因</span>
            </button>
            <button
              onClick={confirm}
              disabled={busy}
              className="rounded-lg bg-blue-600 px-4 py-1.5 text-center transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="block text-[13px] font-medium leading-tight text-white">确认进入待开发</span>
              <span className="block text-[10px] leading-tight text-blue-200">需求确认后不可直接修改</span>
            </button>
          </div>
        </div>
      </div>

      {modal === "edit" && (
        <Modal title="编辑需求" onClose={() => setModal(null)}>
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-[12px] text-slate-500">标题</span>
              <input
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px] text-slate-700 focus:border-blue-400 focus:outline-none"
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[12px] text-slate-500">用户故事</span>
              <textarea
                className="min-h-24 w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px] text-slate-700 focus:border-blue-400 focus:outline-none"
                value={draft.userStory}
                onChange={(e) => setDraft({ ...draft, userStory: e.target.value })}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[12px] text-slate-500">验收标准（每行一条）</span>
              <textarea
                className="min-h-28 w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px] text-slate-700 focus:border-blue-400 focus:outline-none"
                value={draft.acceptance}
                onChange={(e) => setDraft({ ...draft, acceptance: e.target.value })}
              />
            </label>
            <div className="flex justify-end gap-2">
              <button onClick={() => setModal(null)} className={btnCls("secondary", "md")}>
                取消
              </button>
              <button onClick={saveEdit} disabled={busy} className={btnCls("primary", "md")}>
                保存
              </button>
            </div>
          </div>
        </Modal>
      )}

      {modal === "merge" && (
        <Modal title="与其他需求合并" onClose={() => setModal(null)}>
          <p className="mb-3 text-[12px] text-slate-500">当前需求为合并目标：所选需求的用户故事与验收标准将并入本单，原单关闭。</p>
          <div className="max-h-64 space-y-1.5 overflow-y-auto">
            {candidates.map((c) => (
              <label
                key={c.id}
                className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-slate-200 px-3 py-2 hover:bg-slate-50"
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-blue-600"
                  checked={mergeSel.includes(c.id)}
                  onChange={(e) => setMergeSel(e.target.checked ? [...mergeSel, c.id] : mergeSel.filter((x) => x !== c.id))}
                />
                <span className="font-mono text-[11px] tabular-nums text-slate-400">REQ-{c.seq}</span>
                <span className="min-w-0 truncate text-[13px] text-slate-700">{c.title}</span>
              </label>
            ))}
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => setModal(null)} className={btnCls("secondary", "md")}>
              取消
            </button>
            <button onClick={merge} disabled={busy || mergeSel.length === 0} className={btnCls("primary", "md")}>
              合并所选（{mergeSel.length}）
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-[15px] font-semibold text-slate-800">{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function AcceptActions({ id, status, demo }: { id: string; status: string; demo: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function act(action: "accept" | "approve_partial" | "send_back") {
    if (demo) {
      alert("展示模式下操作不生效");
      return;
    }
    const note = action === "send_back" ? window.prompt("退回原因（可选）") ?? undefined : undefined;
    setBusy(true);
    await call(`/api/admin/requirements/${id}/accept`, { action, note });
    router.refresh();
    setBusy(false);
  }

  if (status === "PENDING_ACCEPT") {
    return (
      <section className="rounded-xl border border-green-200 bg-green-50 p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <h2 className="mb-1.5 text-[14px] font-semibold text-green-800">等待验收</h2>
        <p className="mb-3 text-[12px] text-green-700/70">测试已通过，确认功能符合预期后点击验收。</p>
        <button
          disabled={busy}
          onClick={() => act("accept")}
          className="w-full rounded-lg bg-green-600 py-2 text-[13px] font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50"
        >
          ✓ 验收通过
        </button>
      </section>
    );
  }

  if (status === "REVIEWING") {
    return (
      <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <h2 className="mb-2 text-[14px] font-semibold text-amber-800">测试部分通过，等待裁决</h2>
        <div className="space-y-2">
          <button
            disabled={busy}
            onClick={() => act("approve_partial")}
            className="w-full rounded-lg bg-amber-600 py-2 text-[13px] font-medium text-white transition-colors hover:bg-amber-700 disabled:opacity-50"
          >
            放行至待验收
          </button>
          <button
            disabled={busy}
            onClick={() => act("send_back")}
            className="w-full rounded-lg border border-amber-300 bg-white py-2 text-[13px] font-medium text-amber-800 transition-colors hover:bg-amber-100 disabled:opacity-50"
          >
            退回重做
          </button>
        </div>
      </section>
    );
  }

  return null;
}

export function ManageActions({ id, status, demo }: { id: string; status: string; demo: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function act(action: "close" | "hold" | "resume") {
    if (demo) {
      alert("展示模式下操作不生效");
      return;
    }
    const label = action === "close" ? "关闭" : action === "hold" ? "挂起" : "恢复";
    const note = window.prompt(`${label}原因（可选）`) ?? undefined;
    if (action === "close" && !window.confirm("确认关闭该需求？进行中的认领会被释放")) return;
    setBusy(true);
    await call(`/api/admin/requirements/${id}/state`, { action, note });
    router.refresh();
    setBusy(false);
  }

  const terminal = status === "ACCEPTED";
  return (
    <Panel title="管理操作">
      <div className="flex flex-wrap gap-2">
        {status !== "CLOSED" && status !== "ON_HOLD" && !terminal && (
          <>
            <button disabled={busy} onClick={() => act("hold")} className={btnCls("secondary", "sm")}>
              挂起
            </button>
            <button disabled={busy} onClick={() => act("close")} className={btnCls("danger", "sm")}>
              关闭
            </button>
          </>
        )}
        {(status === "CLOSED" || status === "ON_HOLD") && (
          <button disabled={busy} onClick={() => act("resume")} className={btnCls("primary", "sm")}>
            恢复
          </button>
        )}
        {terminal && <p className="text-[12px] text-slate-400">已验收，无可用操作</p>}
      </div>
    </Panel>
  );
}
