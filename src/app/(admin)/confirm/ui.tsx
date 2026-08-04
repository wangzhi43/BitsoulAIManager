"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Item {
  id: string;
  seq: number;
  title: string;
  userStory: string;
  acceptance: string[];
  complexity: string;
  projectId: string | null;
  projectName: string | null;
  clarifications: { question: string; answer: string | null }[];
  source: { channel: string; sender: string | null; customer: string | null };
}

interface Props {
  items: Item[];
  projects: { id: string; name: string }[];
}

export function ConfirmList({ items, projects }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [projectChoice, setProjectChoice] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<{ title: string; userStory: string; acceptance: string }>({
    title: "",
    userStory: "",
    acceptance: "",
  });

  async function call(path: string, body?: unknown): Promise<boolean> {
    const res = await fetch(path, {
      method: "POST",
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

  async function confirm(item: Item) {
    const projectId = projectChoice[item.id] ?? item.projectId;
    if (!projectId) {
      alert("请先选择归属项目");
      return;
    }
    setBusy(item.id);
    if (await call(`/api/admin/requirements/${item.id}/confirm`, { projectId })) router.refresh();
    setBusy(null);
  }

  async function reject(item: Item, reparse: boolean) {
    const reason = window.prompt(reparse ? "驳回并重拆——请填写原因（会提供给拆解 Agent）" : "驳回原因");
    if (!reason) return;
    setBusy(item.id);
    if (await call(`/api/admin/requirements/${item.id}/reject`, { reason, reparse })) router.refresh();
    setBusy(null);
  }

  async function saveEdit(item: Item) {
    setBusy(item.id);
    const acceptance = draft.acceptance
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    const res = await fetch(`/api/admin/requirements/${item.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: draft.title, userStory: draft.userStory, acceptance }),
    });
    if (res.ok) {
      setEditing(null);
      router.refresh();
    } else {
      alert("保存失败");
    }
    setBusy(null);
  }

  async function clarifyMessage(item: Item) {
    setBusy(item.id);
    const res = await fetch(`/api/admin/requirements/${item.id}/clarify-message`, { method: "POST" });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      alert(data?.error?.message ?? "生成失败");
    } else {
      try {
        await navigator.clipboard.writeText(data.message);
      } catch {}
      alert(data.sentToWechat ? "已发送到客户微信会话，并复制到剪贴板" : "文案已复制到剪贴板（该需求非微信来源，需手动转发）");
    }
    setBusy(null);
  }

  async function mergeSelected() {
    if (selected.length < 2) {
      alert("选择至少两个需求单，第一个所选为合并目标");
      return;
    }
    const [intoId, ...fromIds] = selected;
    if (await call("/api/admin/requirements/merge", { intoId, fromIds })) {
      setSelected([]);
      setSelectMode(false);
      router.refresh();
    }
  }

  if (items.length === 0) {
    return <p className="py-10 text-center text-sm opacity-50">没有待确认的需求单</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm">
        <button
          onClick={() => {
            setSelectMode(!selectMode);
            setSelected([]);
          }}
          className="rounded-lg border border-zinc-300 px-3 py-1.5 dark:border-zinc-700"
        >
          {selectMode ? "取消多选" : "多选合并"}
        </button>
        {selectMode && (
          <button
            onClick={mergeSelected}
            className="rounded-lg bg-zinc-900 px-3 py-1.5 text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            合并所选（{selected.length}）
          </button>
        )}
      </div>

      <div className="grid gap-3 2xl:grid-cols-2">
      {items.map((item) => (
        <div
          key={item.id}
          className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="flex items-start gap-2">
            {selectMode && (
              <input
                type="checkbox"
                className="mt-1.5 h-4 w-4"
                checked={selected.includes(item.id)}
                onChange={(e) =>
                  setSelected(
                    e.target.checked ? [...selected, item.id] : selected.filter((x) => x !== item.id),
                  )
                }
              />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs opacity-50">REQ-{item.seq}</span>
                <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs dark:bg-zinc-800">
                  {item.complexity}
                </span>
                <span className="text-xs opacity-50">
                  {item.source.channel === "WECHAT" ? "微信" : "手动"}
                  {item.source.customer ? ` · ${item.source.customer}` : ""}
                  {item.source.sender ? ` · ${item.source.sender}` : ""}
                </span>
              </div>

              {editing === item.id ? (
                <div className="mt-2 space-y-2">
                  <input
                    className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                    value={draft.title}
                    onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  />
                  <textarea
                    className="min-h-20 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                    value={draft.userStory}
                    onChange={(e) => setDraft({ ...draft, userStory: e.target.value })}
                  />
                  <textarea
                    className="min-h-24 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                    placeholder="验收标准，每行一条"
                    value={draft.acceptance}
                    onChange={(e) => setDraft({ ...draft, acceptance: e.target.value })}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => saveEdit(item)}
                      disabled={busy === item.id}
                      className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900"
                    >
                      保存
                    </button>
                    <button
                      onClick={() => setEditing(null)}
                      className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700"
                    >
                      取消
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <h2 className="mt-1 font-medium">{item.title}</h2>
                  <p className="mt-1 whitespace-pre-wrap text-sm opacity-80">{item.userStory}</p>
                  <ul className="mt-2 space-y-1 text-sm">
                    {item.acceptance.map((a, i) => (
                      <li key={i} className="flex gap-1.5">
                        <span className="opacity-40">☐</span>
                        <span>{a}</span>
                      </li>
                    ))}
                  </ul>
                  {item.clarifications.length > 0 && (
                    <div className="mt-2 rounded-lg bg-amber-50 p-2.5 text-sm dark:bg-amber-950/40">
                      <p className="mb-1 flex items-center justify-between text-xs font-medium text-amber-700 dark:text-amber-300">
                        待澄清问题
                        <button
                          onClick={() => clarifyMessage(item)}
                          disabled={busy === item.id}
                          className="rounded-md border border-amber-300 px-2 py-0.5 text-[11px] font-normal hover:bg-amber-100 dark:border-amber-800"
                        >
                          生成微信文案并发送
                        </button>
                      </p>
                      {item.clarifications.map((c, i) => (
                        <p key={i} className="text-amber-800 dark:text-amber-200">
                          · {c.question}
                        </p>
                      ))}
                    </div>
                  )}
                </>
              )}

              {editing !== item.id && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <select
                    className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                    value={projectChoice[item.id] ?? item.projectId ?? ""}
                    onChange={(e) => setProjectChoice({ ...projectChoice, [item.id]: e.target.value })}
                  >
                    <option value="" disabled>
                      选择项目
                    </option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => confirm(item)}
                    disabled={busy === item.id}
                    className="rounded-lg bg-green-600 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-40"
                  >
                    确认
                  </button>
                  <button
                    onClick={() => {
                      setEditing(item.id);
                      setDraft({
                        title: item.title,
                        userStory: item.userStory,
                        acceptance: item.acceptance.join("\n"),
                      });
                    }}
                    className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700"
                  >
                    编辑
                  </button>
                  <button
                    onClick={() => reject(item, false)}
                    disabled={busy === item.id}
                    className="rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-600 dark:border-red-900"
                  >
                    驳回
                  </button>
                  <button
                    onClick={() => reject(item, true)}
                    disabled={busy === item.id}
                    className="rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-600 dark:border-red-900"
                  >
                    驳回重拆
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
      </div>
    </div>
  );
}
