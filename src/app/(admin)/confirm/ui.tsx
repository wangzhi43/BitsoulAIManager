"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Chip, Count, EmptyState, Label, LinkButton, btnCls, ago, fmtDateTime } from "@/components/ui";
import { ComplexityChip, StatusChip, CHANNEL_LABEL } from "@/components/status";
import { Icon } from "@/components/icons";
import { Modal, ConfirmDialog, CopyButton, useAction, useToast } from "@/components/ui-client";

export interface ConfirmItem {
  id: string;
  seq: number;
  title: string;
  userStory: string;
  acceptance: string[];
  complexity: string;
  moduleGuess: string | null;
  projectId: string | null;
  projectName: string | null;
  clarifications: { question: string; answer: string | null }[];
  source: { channel: string; sender: string | null; customer: string | null; wechat: boolean };
  rawMessages: { sender: string; ts: string | null; text: string }[];
  attachments: { name: string; mime: string }[];
  siblings: { id: string; seq: number; status: string }[];
  createdAtIso: string;
}

interface Project {
  id: string;
  name: string;
}

type EditForm = { title: string; userStory: string; acceptance: string; complexity: string; moduleGuess: string };
type Part = { title: string; userStory: string; acceptance: string; complexity: string };

const DEMO_MSG = "展示模式下操作不生效";

function sourceText(it: ConfirmItem): string {
  const parts = [CHANNEL_LABEL[it.source.channel] ?? it.source.channel];
  if (it.source.customer) parts.push(it.source.customer);
  if (it.source.sender && it.source.sender !== it.source.customer) parts.push(it.source.sender);
  return parts.join(" · ");
}

export function ConfirmWorkbench({ items, projects, demo, preselect }: { items: ConfirmItem[]; projects: Project[]; demo: boolean; preselect: string | null }) {
  const toast = useToast();
  const { run, busy } = useAction();
  const [projectFilter, setProjectFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(preselect ?? items[0]?.id ?? null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [mobileDetail, setMobileDetail] = useState(!!preselect);
  const [dialog, setDialog] = useState<null | "reject" | "reparse" | "merge" | "edit" | "split" | "clarify">(null);
  const [clarifyText, setClarifyText] = useState<{ message: string; sentToWechat: boolean } | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [parts, setParts] = useState<Part[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [projectPick, setProjectPick] = useState<string>("");

  const visible = useMemo(() => (projectFilter ? items.filter((i) => (projectFilter === "none" ? !i.projectId : i.projectId === projectFilter)) : items), [items, projectFilter]);
  const selected = items.find((i) => i.id === selectedId) ?? visible[0] ?? null;

  // 列表变化（确认后消失）时保证选中项有效
  useEffect(() => {
    if (!selected && visible[0]) setSelectedId(visible[0].id);
  }, [selected, visible]);
  useEffect(() => {
    setProjectPick(selected?.projectId ?? "");
    setAnswers({});
  }, [selected?.id, selected?.projectId]);

  const guard = () => {
    if (demo) toast("info", DEMO_MSG);
    return demo;
  };

  const selectNext = (cur: string) => {
    const idx = visible.findIndex((i) => i.id === cur);
    const next = visible[idx + 1] ?? visible[idx - 1] ?? null;
    setSelectedId(next?.id ?? null);
  };

  async function confirm(it: ConfirmItem) {
    if (guard()) return;
    const projectId = projectPick || it.projectId;
    if (!projectId) {
      toast("error", "请先选择所属项目");
      return;
    }
    const r = await run("confirm", `/api/admin/requirements/${it.id}/confirm`, { body: { projectId } }, `REQ-${it.seq} 已进入待开发池`);
    if (r.ok) selectNext(it.id);
  }

  async function changeProject(it: ConfirmItem, projectId: string) {
    setProjectPick(projectId);
    if (demo) return;
    await run("project", `/api/admin/requirements/${it.id}`, { method: "PATCH", body: { projectId: projectId || null } });
  }

  async function saveAnswer(it: ConfirmItem, idx: number) {
    if (guard()) return;
    const text = (answers[idx] ?? "").trim();
    if (!text) return;
    const next = it.clarifications.map((c, i) => (i === idx ? { question: c.question, answer: text } : c));
    await run("answer", `/api/admin/requirements/${it.id}`, { method: "PATCH", body: { clarifications: next } }, "答复已保存");
  }

  async function sendClarify(it: ConfirmItem) {
    if (guard()) return;
    const r = await run<{ message: string; sentToWechat: boolean }>("clarify", `/api/admin/requirements/${it.id}/clarify-message`, { method: "POST", body: {} });
    if (r.ok) {
      setClarifyText(r.data);
      setDialog("clarify");
    }
  }

  async function reject(it: ConfirmItem, reason: string, reparse: boolean) {
    if (guard()) return;
    const r = await run("reject", `/api/admin/requirements/${it.id}/reject`, { body: { reason, reparse } }, reparse ? "已驳回，产品专家正在重新拆解" : `REQ-${it.seq} 已驳回关闭`);
    if (r.ok) {
      setDialog(null);
      selectNext(it.id);
    }
  }

  async function merge() {
    if (guard()) return;
    const ids = visible.filter((i) => checked.has(i.id)).map((i) => i.id);
    if (ids.length < 2) return;
    const [intoId, ...fromIds] = ids;
    const r = await run("merge", "/api/admin/requirements/merge", { body: { intoId, fromIds } }, `已合并为 1 单（保留 REQ-${items.find((i) => i.id === intoId)?.seq}）`);
    if (r.ok) {
      setChecked(new Set());
      setSelectedId(intoId);
      setDialog(null);
    }
  }

  function openEdit(it: ConfirmItem) {
    setEditForm({ title: it.title, userStory: it.userStory, acceptance: it.acceptance.join("\n"), complexity: it.complexity, moduleGuess: it.moduleGuess ?? "" });
    setDialog("edit");
  }

  async function saveEdit(it: ConfirmItem) {
    if (guard() || !editForm) return;
    const acceptance = editForm.acceptance.split("\n").map((s) => s.trim()).filter(Boolean);
    if (!editForm.title.trim() || !editForm.userStory.trim() || acceptance.length === 0) {
      toast("error", "标题、用户故事、验收标准不能为空");
      return;
    }
    const r = await run("edit", `/api/admin/requirements/${it.id}`, {
      method: "PATCH",
      body: { title: editForm.title.trim(), userStory: editForm.userStory.trim(), acceptance, complexity: editForm.complexity, moduleGuess: editForm.moduleGuess.trim() || null },
    }, "已保存");
    if (r.ok) setDialog(null);
  }

  function openSplit(it: ConfirmItem) {
    const half = Math.ceil(it.acceptance.length / 2);
    setParts([
      { title: it.title, userStory: it.userStory, acceptance: it.acceptance.slice(0, half).join("\n"), complexity: it.complexity },
      { title: `${it.title}（二）`, userStory: it.userStory, acceptance: it.acceptance.slice(half).join("\n"), complexity: it.complexity },
    ]);
    setDialog("split");
  }

  async function submitSplit(it: ConfirmItem) {
    if (guard()) return;
    const body = parts.map((p) => ({ title: p.title.trim(), userStory: p.userStory.trim(), acceptance: p.acceptance.split("\n").map((s) => s.trim()).filter(Boolean), complexity: p.complexity }));
    if (body.some((p) => !p.title || !p.userStory || p.acceptance.length === 0)) {
      toast("error", "每一单都需要标题、用户故事和至少一条验收标准");
      return;
    }
    const r = await run<{ seqs: number[] }>("split", `/api/admin/requirements/${it.id}/split`, { body: { parts: body } });
    if (r.ok) {
      toast("ok", `已拆分为 ${r.data.seqs.length} 单：${r.data.seqs.map((s) => `REQ-${s}`).join("、")}`);
      setDialog(null);
    }
  }

  const toggleAll = () => {
    if (checked.size === visible.length) setChecked(new Set());
    else setChecked(new Set(visible.map((i) => i.id)));
  };

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-line bg-surface">
        <EmptyState icon="check" title="没有待确认的需求" desc="客户在微信描述需求或手动导入后，产品专家拆解结果会出现在这里。" action={<LinkButton href="/inbox#import" icon="plus">手动导入</LinkButton>} />
      </div>
    );
  }

  const list = (
    <section className="flex min-h-0 flex-col rounded-lg border border-line bg-surface">
      <div className="flex items-center justify-between gap-2 border-b border-line px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <span className="whitespace-nowrap text-[14px] font-semibold text-ink">待确认队列</span>
          <Count n={visible.length} />
        </div>
        <select className="ctl ctl-sm w-auto min-w-[120px]" value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}>
          <option value="">全部项目</option>
          <option value="none">未指定项目</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-2 border-b border-line px-3.5 py-2 text-[12px] text-ink-2">
        <input type="checkbox" className="chk" checked={visible.length > 0 && checked.size === visible.length} onChange={toggleAll} />
        全选
        <span className="text-ink-3">已选 {checked.size}</span>
        <button className={btnCls("secondary", "sm", "ml-auto")} disabled={checked.size < 2} onClick={() => setDialog("merge")}>
          <Icon name="merge" size={13} />
          合并所选
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {visible.length === 0 && <p className="py-8 text-center text-[12px] text-ink-3">该筛选下没有需求</p>}
        {visible.map((it) => {
          const sel = it.id === selected?.id;
          const open = it.clarifications.filter((c) => !c.answer).length;
          return (
            <div
              key={it.id}
              className={`relative flex cursor-pointer gap-2.5 border-b border-line px-3.5 py-3 ${sel ? "bg-accent-soft" : "hover:bg-surface-2"}`}
              onClick={() => {
                setSelectedId(it.id);
                setMobileDetail(true);
              }}
            >
              {sel && <span className="absolute bottom-0 left-0 top-0 w-[3px] bg-accent" />}
              <input
                type="checkbox"
                className="chk mt-0.5"
                checked={checked.has(it.id)}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => {
                  const n = new Set(checked);
                  if (e.target.checked) n.add(it.id);
                  else n.delete(it.id);
                  setChecked(n);
                }}
              />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-mono text-[12px] text-ink-3">REQ-{it.seq}</span>
                  <ComplexityChip complexity={it.complexity} />
                  {open > 0 && <Chip tone="amber">澄清 {open}</Chip>}
                </div>
                <span className="truncate text-[13px] font-medium text-ink">{it.title}</span>
                <span className="truncate text-[12px] text-ink-3">
                  {it.projectName ?? <span className="text-danger">未指定项目</span>} · {sourceText(it)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );

  const detail = selected && (
    <section className="flex min-h-0 flex-col rounded-lg border border-line bg-surface">
      <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <button className="flex items-center text-ink-3 lg:hidden" onClick={() => setMobileDetail(false)} aria-label="返回列表">
              <Icon name="arrowLeft" size={16} />
            </button>
            <span className="font-mono text-[12px] text-ink-3">REQ-{selected.seq}</span>
            <StatusChip status="PENDING_CONFIRM" />
            <ComplexityChip complexity={selected.complexity} />
            <span className="text-[12px] text-ink-3">产品专家 · {ago(selected.createdAtIso)}</span>
          </div>
          <h2 className="text-[16px] font-semibold leading-snug text-ink">{selected.title}</h2>
        </div>
        <Link href={`/requirements/${selected.id}`} className="flex shrink-0 items-center gap-0.5 text-[12px] text-accent hover:underline">
          详情页 <Icon name="chevronRight" size={12} />
        </Link>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-4 pb-24 lg:pb-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="flex flex-col gap-1">
            <Label>所属项目</Label>
            <select className={`ctl ctl-sm ${!projectPick ? "border-danger-line" : ""}`} value={projectPick} onChange={(e) => changeProject(selected, e.target.value)}>
              <option value="">请选择项目</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <Label>来源</Label>
            <span className="pt-1 text-[13px] text-ink">{sourceText(selected)}</span>
          </div>
          <div className="flex flex-col gap-1">
            <Label>涉及模块</Label>
            <span className="pt-1 text-[13px] text-ink">{selected.moduleGuess ?? <span className="text-ink-3">—</span>}</span>
          </div>
          <div className="flex flex-col gap-1">
            <Label>同线索</Label>
            <span className="pt-1 text-[13px] text-ink">
              {selected.siblings.length === 0 ? (
                <span className="text-ink-3">仅此一单</span>
              ) : (
                <>
                  {selected.siblings.slice(0, 4).map((s) => (
                    <Link key={s.id} href={s.status === "PENDING_CONFIRM" ? `/confirm?id=${s.id}` : `/requirements/${s.id}`} className="mr-1.5 text-accent hover:underline">
                      REQ-{s.seq}
                    </Link>
                  ))}
                  <span className="text-ink-3">共 {selected.siblings.length + 1} 单</span>
                </>
              )}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>用户故事</Label>
          <p className="text-[13px] leading-relaxed text-ink">{selected.userStory}</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <Label>验收标准（{selected.acceptance.length}）</Label>
            <button className="text-[12px] text-accent hover:underline" onClick={() => openEdit(selected)}>
              编辑
            </button>
          </div>
          <ol className="divide-y divide-line">
            {selected.acceptance.map((a, i) => (
              <li key={i} className="flex gap-3 py-1.5 text-[13px] text-ink">
                <span className="num w-4 shrink-0 font-mono text-[12px] text-ink-3">{i + 1}</span>
                <span>{a}</span>
              </li>
            ))}
          </ol>
        </div>

        {selected.clarifications.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label>澄清问题（{selected.clarifications.length}）</Label>
              {selected.clarifications.some((c) => !c.answer) && (
                <button className={btnCls("secondary", "sm")} onClick={() => sendClarify(selected)} disabled={busy === "clarify"}>
                  <Icon name="send" size={13} />
                  {selected.source.wechat ? "发给客户确认" : "生成提问文案"}
                </button>
              )}
            </div>
            {selected.clarifications.map((c, i) => (
              <div key={i} className={`flex flex-col gap-2 rounded-md border px-3 py-2.5 ${c.answer ? "border-line bg-surface-2" : "border-warn-line bg-warn-soft"}`}>
                <span className="text-[13px] text-ink">{c.question}</span>
                {c.answer ? (
                  <span className="text-[12px] text-ink-2">
                    <span className="text-ok">已答复：</span>
                    {c.answer}
                  </span>
                ) : (
                  <div className="flex gap-2">
                    <input className="ctl ctl-sm flex-1" placeholder="填写客户答复" value={answers[i] ?? ""} onChange={(e) => setAnswers({ ...answers, [i]: e.target.value })} />
                    <button className={btnCls("secondary", "sm")} disabled={!(answers[i] ?? "").trim() || busy === "answer"} onClick={() => saveAnswer(selected, i)}>
                      保存
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {(selected.rawMessages.length > 0 || selected.attachments.length > 0) && (
          <div className="flex flex-col gap-1.5">
            <Label>原始消息</Label>
            <div className="flex flex-col gap-1 rounded-md border border-line bg-surface-2 px-3 py-2.5 text-[12px] leading-relaxed text-ink-2">
              {selected.rawMessages.map((m, i) => (
                <div key={i}>
                  <span className="text-ink-3">
                    {m.sender}
                    {m.ts ? ` ${fmtDateTime(m.ts)}` : ""}{" "}
                  </span>
                  <span className="whitespace-pre-wrap">{m.text}</span>
                </div>
              ))}
              {selected.attachments.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {selected.attachments.map((a, i) => (
                    <Chip key={i} tone="outline" title={a.mime}>
                      <Icon name={a.mime.startsWith("image/") ? "image" : "file"} size={11} />
                      {a.name}
                    </Chip>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 操作条：桌面在卡片底部；手机固定在底部导航之上 */}
      <div className="fixed inset-x-0 bottom-14 z-30 flex items-center gap-2 border-t border-line bg-surface-2 px-3 py-2.5 lg:static lg:justify-between lg:rounded-b-lg lg:px-5 lg:py-3">
        <div className="hidden gap-2 lg:flex">
          <button className={btnCls("danger")} onClick={() => setDialog("reject")}>
            驳回
          </button>
          <button className={btnCls("secondary")} onClick={() => setDialog("reparse")}>
            驳回重拆
          </button>
        </div>
        <div className="flex flex-1 gap-2 lg:flex-none">
          <button className={btnCls("danger", "md", "h-11 flex-1 lg:hidden")} onClick={() => setDialog("reject")}>
            驳回
          </button>
          <button className={btnCls("secondary", "md", "h-11 flex-1 lg:h-8 lg:flex-none")} onClick={() => openSplit(selected)}>
            <Icon name="split" size={13} />
            拆分
          </button>
          <button className={btnCls("secondary", "md", "h-11 flex-1 lg:h-8 lg:flex-none")} onClick={() => openEdit(selected)}>
            <Icon name="edit" size={13} />
            编辑
          </button>
          <button className={btnCls("primary", "md", "h-11 flex-[2] lg:h-8 lg:flex-none")} disabled={busy === "confirm"} onClick={() => confirm(selected)}>
            <Icon name="check" size={13} />
            {busy === "confirm" ? "提交中…" : "确认进入待开发"}
          </button>
        </div>
      </div>

      {/* 对话框 */}
      <ConfirmDialog
        open={dialog === "reject"}
        onClose={() => setDialog(null)}
        onConfirm={(reason) => reject(selected, reason, false)}
        title={`驳回 REQ-${selected.seq}`}
        desc="本单将关闭，不再进入开发池。线索里的其它需求单不受影响。"
        confirmText="驳回并关闭"
        danger
        reason={{ label: "驳回原因", required: true, placeholder: "例如：与 REQ-12 重复 / 客户已取消" }}
        busy={busy === "reject"}
      />
      <ConfirmDialog
        open={dialog === "reparse"}
        onClose={() => setDialog(null)}
        onConfirm={(reason) => reject(selected, reason, true)}
        title="驳回并重新拆解"
        desc="整个线索连同你的原因交回产品专家重新拆分；同线索下所有待确认单会被作废重建。"
        confirmText="驳回重拆"
        reason={{ label: "哪里拆得不对", required: true, placeholder: "例如：应拆成登录与统计两单 / 验收标准不可测" }}
        busy={busy === "reject"}
      />
      <ConfirmDialog
        open={dialog === "merge"}
        onClose={() => setDialog(null)}
        onConfirm={() => merge()}
        title={`合并 ${checked.size} 个需求单`}
        desc={`以第一个勾选的需求单为目标，其余并入（用户故事与验收标准合并，原单关闭）：${visible
          .filter((i) => checked.has(i.id))
          .map((i) => `REQ-${i.seq}`)
          .join("、")}`}
        confirmText="合并"
        busy={busy === "merge"}
      />
      <Modal
        open={dialog === "clarify"}
        onClose={() => setDialog(null)}
        title="澄清问题文案"
        footer={
          <>
            {clarifyText && <CopyButton text={clarifyText.message} label="复制文案" />}
            <button className={btnCls("primary")} onClick={() => setDialog(null)}>
              完成
            </button>
          </>
        }
      >
        {clarifyText && (
          <>
            <p className="mb-2 text-[12px] text-ink-3">{clarifyText.sentToWechat ? "已加入微信发送队列，机器人会在客户下次来消息后回发；也可以复制后手动转发。" : "该需求来源不是微信，请复制后手动发给客户。"}</p>
            <pre className="whitespace-pre-wrap rounded-md border border-line bg-surface-2 p-3 font-sans text-[13px] leading-relaxed text-ink">{clarifyText.message}</pre>
          </>
        )}
      </Modal>
      <Modal
        open={dialog === "edit" && !!editForm}
        onClose={() => setDialog(null)}
        title={`编辑 REQ-${selected.seq}`}
        footer={
          <>
            <button className={btnCls("secondary")} onClick={() => setDialog(null)}>
              取消
            </button>
            <button className={btnCls("primary")} disabled={busy === "edit"} onClick={() => saveEdit(selected)}>
              保存
            </button>
          </>
        }
      >
        {editForm && (
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              <Label>标题</Label>
              <input className="ctl" value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1">
              <Label>用户故事</Label>
              <textarea className="ctl" rows={3} value={editForm.userStory} onChange={(e) => setEditForm({ ...editForm, userStory: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1">
              <Label>验收标准（每行一条）</Label>
              <textarea className="ctl" rows={5} value={editForm.acceptance} onChange={(e) => setEditForm({ ...editForm, acceptance: e.target.value })} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <Label>复杂度</Label>
                <select className="ctl" value={editForm.complexity} onChange={(e) => setEditForm({ ...editForm, complexity: e.target.value })}>
                  <option value="S">S（半天内）</option>
                  <option value="M">M（1-2 天）</option>
                  <option value="L">L（3 天以上）</option>
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <Label>涉及模块</Label>
                <input className="ctl" value={editForm.moduleGuess} onChange={(e) => setEditForm({ ...editForm, moduleGuess: e.target.value })} placeholder="可选" />
              </label>
            </div>
          </div>
        )}
      </Modal>
      <Modal
        open={dialog === "split"}
        onClose={() => setDialog(null)}
        title={`拆分 REQ-${selected.seq}`}
        width="max-w-3xl"
        footer={
          <>
            <button className={btnCls("secondary")} onClick={() => setParts([...parts, { title: "", userStory: selected.userStory, acceptance: "", complexity: selected.complexity }])}>
              <Icon name="plus" size={13} />
              再加一单
            </button>
            <button className={btnCls("primary")} disabled={busy === "split" || parts.length < 2} onClick={() => submitSplit(selected)}>
              拆分为 {parts.length} 单
            </button>
          </>
        }
      >
        <p className="mb-3 text-[12px] text-ink-3">第一单保留原编号 REQ-{selected.seq}，其余为新编号；全部留在待确认队列。</p>
        <div className="flex flex-col gap-3">
          {parts.map((p, i) => (
            <div key={i} className="flex flex-col gap-2 rounded-md border border-line p-3">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-medium text-ink-2">第 {i + 1} 单{i === 0 ? `（REQ-${selected.seq}）` : ""}</span>
                {parts.length > 2 && (
                  <button className="text-[12px] text-ink-3 hover:text-danger" onClick={() => setParts(parts.filter((_, j) => j !== i))}>
                    移除
                  </button>
                )}
              </div>
              <div className="grid gap-2 sm:grid-cols-[1fr_120px]">
                <input className="ctl" placeholder="标题" value={p.title} onChange={(e) => setParts(parts.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
                <select className="ctl" value={p.complexity} onChange={(e) => setParts(parts.map((x, j) => (j === i ? { ...x, complexity: e.target.value } : x)))}>
                  <option value="S">S</option>
                  <option value="M">M</option>
                  <option value="L">L</option>
                </select>
              </div>
              <textarea className="ctl" rows={2} placeholder="用户故事" value={p.userStory} onChange={(e) => setParts(parts.map((x, j) => (j === i ? { ...x, userStory: e.target.value } : x)))} />
              <textarea className="ctl" rows={3} placeholder="验收标准（每行一条）" value={p.acceptance} onChange={(e) => setParts(parts.map((x, j) => (j === i ? { ...x, acceptance: e.target.value } : x)))} />
            </div>
          ))}
        </div>
      </Modal>
    </section>
  );

  return (
    <div className="grid gap-4 xl:grid-cols-[400px_minmax(0,1fr)] xl:h-[calc(100dvh-140px)] xl:min-h-[640px]">
      <div className={`${mobileDetail ? "hidden xl:flex" : "flex"} min-h-0 flex-col`}>{list}</div>
      <div className={`${mobileDetail ? "flex" : "hidden xl:flex"} min-h-0 flex-col`}>{detail ?? <div className="rounded-lg border border-line bg-surface"><EmptyState compact title="选择左侧需求查看" /></div>}</div>
    </div>
  );
}
