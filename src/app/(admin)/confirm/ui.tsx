"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Chip, btnCls } from "@/components/ui";
import { PriorityChip } from "@/components/status";

// 待确认列表：与需求详情页同风格的白卡列表
// 每卡 = 标题（跳详情）+ 项目/来源元信息 + 用户故事 + 验收标准摘要 + 澄清问题 + 操作行

interface Item {
  id: string;
  seq: number;
  title: string;
  userStory: string;
  acceptance: string[];
  complexity: string;
  priority: string | null;
  projectId: string | null;
  projectName: string | null;
  clarifications: { question: string; answer: string | null }[];
  source: { channel: string; sender: string | null; customer: string | null };
}

interface Props {
  items: Item[];
  projects: { id: string; name: string }[];
}

const COMPLEXITY: Record<string, { label: string; tone: "green" | "amber" | "red" }> = {
  S: { label: "简单", tone: "green" },
  M: { label: "中等", tone: "amber" },
  L: { label: "复杂", tone: "red" },
};

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
    return (
      <div className="rounded-xl border border-slate-200 bg-white py-12 text-center shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <p className="text-[13px] text-slate-400">没有待确认的需求单</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button
          onClick={() => {
            setSelectMode(!selectMode);
            setSelected([]);
          }}
          className={btnCls("secondary", "sm")}
        >
          {selectMode ? "取消多选" : "多选合并"}
        </button>
        {selectMode && (
          <button onClick={mergeSelected} className={btnCls("primary", "sm")}>
            合并所选（{selected.length}）
          </button>
        )}
        {selectMode && <span className="text-[11px] text-slate-400">第一个所选为合并目标</span>}
      </div>

      <div className="grid gap-3 2xl:grid-cols-2">
        {items.map((item) => {
          const cplx = COMPLEXITY[item.complexity] ?? { label: item.complexity, tone: "amber" as const };
          const openClarify = item.clarifications.filter((c) => !c.answer);
          return (
            <div
              key={item.id}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
            >
              <div className="flex items-start gap-2.5">
                {selectMode && (
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 accent-blue-600"
                    checked={selected.includes(item.id)}
                    onChange={(e) =>
                      setSelected(e.target.checked ? [...selected, item.id] : selected.filter((x) => x !== item.id))
                    }
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-[11px] tabular-nums text-slate-400">REQ-{item.seq}</span>
                    <Chip tone={cplx.tone}>{cplx.label}</Chip>
                    {item.priority && <PriorityChip priority={item.priority} />}
                    {item.clarifications.length > 0 && <Chip tone="amber">待澄清 {openClarify.length || item.clarifications.length}</Chip>}
                  </div>

                  {editing === item.id ? (
                    <div className="mt-2 space-y-2.5">
                      <input
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px] text-slate-700 focus:border-blue-400 focus:outline-none"
                        value={draft.title}
                        onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                      />
                      <textarea
                        className="min-h-20 w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px] text-slate-700 focus:border-blue-400 focus:outline-none"
                        value={draft.userStory}
                        onChange={(e) => setDraft({ ...draft, userStory: e.target.value })}
                      />
                      <textarea
                        className="min-h-24 w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px] text-slate-700 focus:border-blue-400 focus:outline-none"
                        placeholder="验收标准，每行一条"
                        value={draft.acceptance}
                        onChange={(e) => setDraft({ ...draft, acceptance: e.target.value })}
                      />
                      <div className="flex gap-2">
                        <button onClick={() => saveEdit(item)} disabled={busy === item.id} className={btnCls("primary", "sm")}>
                          保存
                        </button>
                        <button onClick={() => setEditing(null)} className={btnCls("secondary", "sm")}>
                          取消
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <Link
                        href={`/requirements/${item.id}`}
                        className="mt-1 block text-[15px] font-semibold leading-snug text-slate-800 hover:text-blue-600"
                      >
                        {item.title}
                      </Link>
                      <p className="mt-0.5 text-[12px] text-slate-400">
                        {item.projectName ?? "未指定项目"} · 来源：{item.source.channel === "WECHAT" ? "微信反馈" : "手动导入"}
                        {item.source.customer ? ` · ${item.source.customer}` : ""}
                        {item.source.sender ? ` · ${item.source.sender}` : ""}
                      </p>
                      <p className="mt-2 line-clamp-2 whitespace-pre-wrap text-[13px] leading-relaxed text-slate-600">{item.userStory}</p>

                      <p className="mt-2.5 text-[11px] font-medium text-slate-400">验收标准</p>
                      <ol className="mt-1 space-y-1">
                        {item.acceptance.slice(0, 3).map((a, i) => (
                          <li key={i} className="flex gap-1.5 text-[13px] text-slate-600">
                            <span className="tabular-nums text-slate-400">{i + 1}.</span>
                            <span>{a}</span>
                          </li>
                        ))}
                      </ol>
                      {item.acceptance.length > 3 && (
                        <p className="mt-1 text-[12px] text-slate-400">…等 {item.acceptance.length} 条，详情页查看全部</p>
                      )}

                      {item.clarifications.length > 0 && (
                        <div className="mt-2.5 rounded-lg border border-amber-100 bg-amber-50/60 p-2.5">
                          <div className="mb-1 flex items-center justify-between gap-2">
                            <p className="text-[12px] font-medium text-amber-700">澄清问题（{item.clarifications.length}）</p>
                            <button
                              onClick={() => clarifyMessage(item)}
                              disabled={busy === item.id}
                              className="text-[12px] font-medium text-blue-600 hover:underline disabled:opacity-50"
                            >
                              生成微信澄清文案
                            </button>
                          </div>
                          {item.clarifications.map((c, i) => (
                            <p key={i} className="flex items-start justify-between gap-2 text-[12px] leading-relaxed text-amber-800">
                              <span>
                                {i + 1}. {c.question}
                              </span>
                              <span className="mt-0.5 shrink-0">
                                <Chip tone={c.answer ? "green" : "amber"}>{c.answer ? "已回复" : "待确认"}</Chip>
                              </span>
                            </p>
                          ))}
                        </div>
                      )}
                    </>
                  )}

                  {editing !== item.id && (
                    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                      <select
                        className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-[12px] text-slate-700 focus:border-blue-400 focus:outline-none"
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
                      <button onClick={() => confirm(item)} disabled={busy === item.id} className={btnCls("primary", "sm")}>
                        确认进入待开发
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
                        className={btnCls("secondary", "sm")}
                      >
                        编辑
                      </button>
                      <button onClick={() => reject(item, false)} disabled={busy === item.id} className={btnCls("danger", "sm")}>
                        驳回
                      </button>
                      <button onClick={() => reject(item, true)} disabled={busy === item.id} className={btnCls("danger", "sm")}>
                        驳回重拆
                      </button>
                      <Link
                        href={`/requirements/${item.id}`}
                        className="ml-auto text-[12px] font-medium text-blue-600 hover:underline"
                      >
                        查看详情 →
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
