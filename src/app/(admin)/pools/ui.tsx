"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { KpiRow, KpiTile, Chip, Count, EmptyState, LinkButton, KV, Label, btnCls, ago, fmtDateTime } from "@/components/ui";
import { PriorityChip, ComplexityChip, StatusChip } from "@/components/status";
import { Icon } from "@/components/icons";
import { ConfirmDialog, Modal, useAction, useToast } from "@/components/ui-client";

export interface BoardCard {
  id: string;
  seq: number;
  title: string;
  status: string;
  project: string | null;
  projectId: string | null;
  priority: string | null;
  priorityReason: string | null;
  locked: boolean;
  complexity: string;
  rank: number | null;
  featureBranch: string | null;
  daily: string | null;
  isDefect: boolean;
  dev: { taskId: string; status: string; agent: string | null; heartbeatAt: string | null; claimedAt: string | null; commits: number } | null;
  test: { taskId: string; status: string; agent: string | null; heartbeatAt: string | null; caseCount: number } | null;
  report: { conclusion: string; passRate: number } | null;
  timedOut: boolean;
  updatedAt: string;
}

const COLUMNS: { key: string; label: string; statuses: string[] }[] = [
  { key: "ready", label: "待开发", statuses: ["READY"] },
  { key: "dev", label: "开发中", statuses: ["DEVELOPING"] },
  { key: "ptest", label: "待测试", statuses: ["PENDING_TEST"] },
  { key: "test", label: "测试中", statuses: ["TESTING", "REVIEWING"] },
  { key: "accept", label: "待验收", statuses: ["PENDING_ACCEPT"] },
];

const PRIO_ORDER: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
const DEMO_MSG = "展示模式下操作不生效";

function sortCards(a: BoardCard, b: BoardCard): number {
  if (a.rank != null && b.rank != null && a.rank !== b.rank) return a.rank - b.rank;
  if (a.rank != null && b.rank == null) return -1;
  if (a.rank == null && b.rank != null) return 1;
  const pa = PRIO_ORDER[a.priority ?? ""] ?? 9;
  const pb = PRIO_ORDER[b.priority ?? ""] ?? 9;
  if (pa !== pb) return pa - pb;
  return a.seq - b.seq;
}

export function Board({
  cards,
  projects,
  agents,
  filters,
  timeoutHours,
  demo,
}: {
  cards: BoardCard[];
  projects: { id: string; name: string }[];
  agents: string[];
  filters: { project: string; priority: string; agent: string; q: string };
  timeoutHours: number;
  demo: boolean;
}) {
  const toast = useToast();
  const { run, busy } = useAction();
  const [openId, setOpenId] = useState<string | null>(null);
  const [rankDlg, setRankDlg] = useState(false);
  const open = cards.find((c) => c.id === openId) ?? null;

  useEffect(() => {
    if (openId && !open) setOpenId(null);
  }, [openId, open]);

  const stats = useMemo(() => {
    const p0 = cards.filter((c) => c.priority === "P0" && c.status !== "PENDING_ACCEPT").length;
    const devClaimed = cards.filter((c) => c.dev?.status === "CLAIMED").length;
    const testClaimed = cards.filter((c) => c.test?.status === "CLAIMED").length;
    const timedOut = cards.filter((c) => c.timedOut).length;
    const conflicts = cards.filter((c) => c.dev?.status === "CONFLICT");
    const accept = cards.filter((c) => c.status === "PENDING_ACCEPT").length;
    return { p0, devClaimed, testClaimed, timedOut, conflicts, accept, projects: new Set(cards.map((c) => c.projectId)).size };
  }, [cards]);

  const hasFilter = !!(filters.project || filters.priority || filters.agent || filters.q);

  async function rank() {
    if (demo) return toast("info", DEMO_MSG);
    const r = await run("rank", "/api/admin/pools/rank", { body: filters.project ? { projectId: filters.project } : {} }, "已排队重排，项管专家约 30 秒内完成");
    if (r.ok) setRankDlg(false);
  }

  return (
    <>
      <KpiRow cols={6}>
        <KpiTile label="池内需求" value={cards.length} sub={`${stats.projects} 个项目`} />
        <KpiTile label="P0" value={stats.p0} sub="线上缺陷优先" tone={stats.p0 > 0 ? "alert" : "default"} />
        <KpiTile label="认领中" value={stats.devClaimed + stats.testClaimed} sub={`${stats.devClaimed} 开发 · ${stats.testClaimed} 测试`} />
        <KpiTile label="心跳超时" value={stats.timedOut} sub={`阈值 ${timeoutHours} 小时`} tone={stats.timedOut > 0 ? "alert" : "default"} />
        <KpiTile label="合并冲突" value={stats.conflicts.length} sub={stats.conflicts.length ? stats.conflicts.map((c) => `REQ-${c.seq}`).slice(0, 3).join("、") : "无"} tone={stats.conflicts.length > 0 ? "alert" : "default"} />
        <KpiTile label="待验收" value={stats.accept} sub="测试已通过" tone={stats.accept > 0 ? "warn" : "default"} href={stats.accept > 0 ? "/branches" : undefined} />
      </KpiRow>

      <form method="get" action="/pools" className="flex flex-wrap items-center gap-2">
        <select name="project" defaultValue={filters.project} className="ctl w-auto min-w-[130px]">
          <option value="">全部项目</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select name="priority" defaultValue={filters.priority} className="ctl w-auto min-w-[100px]">
          <option value="">优先级</option>
          {["P0", "P1", "P2", "P3"].map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select name="agent" defaultValue={filters.agent} className="ctl w-auto min-w-[110px]">
          <option value="">Agent</option>
          {agents.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <div className="relative">
          <Icon name="search" size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
          <input name="q" defaultValue={filters.q} placeholder="搜索编号或标题" className="ctl w-[200px] pl-7" />
        </div>
        <button className={btnCls("secondary")}>筛选</button>
        {hasFilter && (
          <Link href="/pools" className="text-[12px] text-ink-3 hover:text-ink">
            重置筛选
          </Link>
        )}
        <button type="button" className={btnCls("secondary", "md", "ml-auto")} onClick={() => setRankDlg(true)}>
          <Icon name="zap" size={14} />
          触发项管重排
        </button>
      </form>

      {cards.length === 0 ? (
        <div className="rounded-lg border border-line bg-surface">
          <EmptyState icon="kanban" title={hasFilter ? "没有匹配的需求" : "池内没有需求"} desc={hasFilter ? "换个筛选条件试试。" : "待确认页确认需求后进入待开发池。"} action={hasFilter ? <LinkButton href="/pools" size="sm">重置筛选</LinkButton> : <LinkButton href="/confirm" size="sm">去待确认</LinkButton>} />
        </div>
      ) : (
        <div className="-mx-4 overflow-x-auto px-4 sm:-mx-6 sm:px-6">
          <div className="grid min-w-[1100px] grid-cols-5 gap-3">
            {COLUMNS.map((col) => {
              const list = cards.filter((c) => col.statuses.includes(c.status)).sort(sortCards);
              return (
                <div key={col.key} className="flex min-w-0 flex-col gap-2">
                  <div className="flex items-center gap-2 px-0.5">
                    <span className="text-[13px] font-semibold text-ink">{col.label}</span>
                    <Count n={list.length} />
                  </div>
                  <div className="flex min-h-[480px] flex-col gap-2 rounded-lg bg-[#eceff3] p-2">
                    {list.length === 0 && <p className="py-6 text-center text-[12px] text-ink-3">空</p>}
                    {list.map((c) => (
                      <Card key={c.id} c={c} onOpen={() => setOpenId(c.id)} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <ConfirmDialog open={rankDlg} onClose={() => setRankDlg(false)} onConfirm={rank} title="触发项管专家重排" desc={`对${filters.project ? "当前项目" : "所有项目"}待开发池全量重排优先级（已锁定的不动），消耗一次 LLM 调用。`} confirmText="开始重排" busy={busy === "rank"} />

      <Drawer c={open} onClose={() => setOpenId(null)} demo={demo} />
    </>
  );
}

function Card({ c, onOpen }: { c: BoardCard; onOpen: () => void }) {
  const conflict = c.dev?.status === "CONFLICT";
  const hbText = (hb: string | null) => (hb ? `心跳 ${ago(hb)}` : "无心跳");
  return (
    <div
      className={`flex cursor-pointer flex-col gap-1.5 rounded-md border bg-surface px-3 py-2.5 transition-colors hover:border-line-strong ${conflict ? "border-danger-line" : "border-line"}`}
      onClick={onOpen}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[12px] text-ink-3">REQ-{c.seq}</span>
        <span className="flex items-center gap-1">
          {c.isDefect && <Chip tone="red">缺陷</Chip>}
          <PriorityChip priority={c.priority} />
          <ComplexityChip complexity={c.complexity} />
        </span>
      </div>
      <Link href={`/requirements/${c.id}`} className="text-[13px] font-medium leading-snug text-ink hover:text-accent" onClick={(e) => e.stopPropagation()}>
        {c.title}
      </Link>
      <span className="truncate text-[12px] text-ink-3">{c.project ?? "未指定项目"}</span>

      {c.status === "READY" && c.priorityReason && (
        <span className="flex items-center gap-1 truncate text-[12px] text-ink-3" title={c.priorityReason}>
          {c.locked && <Icon name="lock" size={11} />}
          {c.priorityReason}
        </span>
      )}
      {c.status === "DEVELOPING" && c.dev && (
        <div className="mt-0.5 flex flex-col gap-1 border-t border-line pt-1.5 text-[12px]">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-ink-2">{c.dev.agent ?? "—"}</span>
            {c.dev.status === "CLAIMED" && <span className={c.timedOut ? "text-danger" : "text-ink-3"}>{hbText(c.dev.heartbeatAt)}</span>}
            {c.dev.status === "SUBMITTED" && <Chip tone="blue">已提交，合并中</Chip>}
          </div>
          {c.featureBranch && <span className="truncate font-mono text-accent">{c.featureBranch}</span>}
          {conflict && (
            <span className="flex items-center gap-1 text-danger">
              <Icon name="alert" size={12} />
              合并冲突
            </span>
          )}
        </div>
      )}
      {c.status === "PENDING_TEST" && <div className="mt-0.5">{c.test ? <Chip tone="amber">{c.test.caseCount} 条用例待认领</Chip> : <Chip tone="slate">生成用例中</Chip>}</div>}
      {(c.status === "TESTING" || c.status === "REVIEWING") && (
        <div className="mt-0.5 flex flex-col gap-1 border-t border-line pt-1.5 text-[12px]">
          {c.status === "REVIEWING" ? (
            <Chip tone="amber">部分通过 {c.report ? Math.round(c.report.passRate * 100) : ""}% · 待裁决</Chip>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-ink-2">{c.test?.agent ?? "—"}</span>
                <span className={c.timedOut ? "text-danger" : "text-ink-3"}>{hbText(c.test?.heartbeatAt ?? null)}</span>
              </div>
              <span className="text-ink-3">用例 {c.test?.caseCount ?? 0}</span>
            </>
          )}
        </div>
      )}
      {c.status === "PENDING_ACCEPT" && <div className="mt-0.5">{c.report ? <Chip tone={c.report.conclusion === "PASS" ? "green" : "amber"}>{c.report.conclusion} {Math.round(c.report.passRate * 100)}%</Chip> : <Chip tone="slate">无报告</Chip>}</div>}
    </div>
  );
}

function Drawer({ c, onClose, demo }: { c: BoardCard | null; onClose: () => void; demo: boolean }) {
  const toast = useToast();
  const { run, busy } = useAction();
  const [dlg, setDlg] = useState<null | "release" | "retry" | "exclude" | "accept">(null);
  const [prio, setPrio] = useState({ priority: "P2", locked: false });
  const [prioOpen, setPrioOpen] = useState(false);

  useEffect(() => {
    if (c) setPrio({ priority: c.priority ?? "P2", locked: c.locked });
  }, [c]);
  useEffect(() => {
    if (!c) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [c, onClose]);

  if (!c) return null;
  const guard = () => {
    if (demo) toast("info", DEMO_MSG);
    return demo;
  };
  const base = `/api/admin/requirements/${c.id}`;
  const claimedTask = c.dev?.status === "CLAIMED" ? c.dev : c.test?.status === "CLAIMED" ? c.test : null;

  return (
    <div className="fixed inset-0 z-[80] flex justify-end bg-ink/30" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="flex h-full w-full max-w-[440px] flex-col border-l border-line bg-surface">
        <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-mono text-[12px] text-ink-3">REQ-{c.seq}</span>
              <StatusChip status={c.status} />
              <PriorityChip priority={c.priority} />
              <ComplexityChip complexity={c.complexity} />
            </div>
            <h3 className="mt-1 text-[14px] font-semibold leading-snug text-ink">{c.title}</h3>
          </div>
          <button onClick={onClose} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-3 hover:bg-bg hover:text-ink" aria-label="关闭">
            <Icon name="x" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <KV
            items={[
              { k: "项目", v: c.project ?? "—" },
              { k: "优先级理由", v: <span className="text-[12px] text-ink-2">{c.priorityReason ?? "—"}{c.locked ? "（已锁定）" : ""}</span> },
              { k: "开发 Agent", v: c.dev?.agent ? <span className="font-mono text-[12px]">{c.dev.agent}</span> : "—" },
              { k: "测试 Agent", v: c.test?.agent ? <span className="font-mono text-[12px]">{c.test.agent}</span> : "—" },
              { k: "feature 分支", v: c.featureBranch ? <span className="font-mono text-[12px] text-accent">{c.featureBranch}</span> : "—" },
              { k: "所在 daily", v: c.daily ? <span className="font-mono text-[12px]">{c.daily}</span> : "—" },
              { k: "认领时间", v: <span className="num text-[12px]">{fmtDateTime(c.dev?.claimedAt)}</span> },
              { k: "最近心跳", v: <span className={`text-[12px] ${c.timedOut ? "text-danger" : ""}`}>{c.dev?.heartbeatAt || c.test?.heartbeatAt ? ago(c.dev?.heartbeatAt ?? c.test?.heartbeatAt) : "—"}</span> },
              { k: "提交数", v: <span className="num text-[12px]">{c.dev?.commits ?? 0}</span> },
              { k: "测试", v: c.report ? <Chip tone={c.report.conclusion === "PASS" ? "green" : "red"}>{c.report.conclusion} {Math.round(c.report.passRate * 100)}%</Chip> : c.test ? <span className="text-[12px]">{c.test.caseCount} 条用例</span> : "—" },
              { k: "更新", v: <span className="text-[12px]">{ago(c.updatedAt)}</span> },
            ]}
          />
        </div>
        <div className="flex flex-col gap-2 border-t border-line bg-surface-2 px-4 py-3">
          <Label>动作</Label>
          <div className="flex flex-wrap gap-1.5">
            {c.status === "READY" && (
              <button className={btnCls("primary", "sm")} onClick={() => setPrioOpen(true)}>
                调整优先级
              </button>
            )}
            {c.status === "PENDING_ACCEPT" && (
              <button className={btnCls("primary", "sm")} onClick={() => setDlg("accept")}>
                <Icon name="check" size={13} />
                验收通过
              </button>
            )}
            {c.dev?.status === "CONFLICT" && (
              <>
                <button className={btnCls("primary", "sm")} onClick={() => setDlg("retry")}>
                  重试合并
                </button>
                <button className={btnCls("secondary", "sm")} onClick={() => setDlg("exclude")}>
                  剔除回待开发
                </button>
              </>
            )}
            {claimedTask && (
              <button className={btnCls("danger", "sm")} onClick={() => setDlg("release")}>
                强制释放认领
              </button>
            )}
            <LinkButton href={`/requirements/${c.id}`} size="sm" icon="external">
              查看详情
            </LinkButton>
          </div>
        </div>
      </aside>

      <ConfirmDialog open={dlg === "release"} onClose={() => setDlg(null)} title="强制释放认领" desc={`${claimedTask?.agent ?? ""} 的认领将被取消，任务回到池中。`} confirmText="释放" danger busy={busy === "release"} onConfirm={async () => { if (guard()) return; const r = await run("release", `/api/admin/tasks/${claimedTask?.taskId}/release`, { method: "POST", body: {} }, "已释放"); if (r.ok) setDlg(null); }} />
      <ConfirmDialog open={dlg === "retry"} onClose={() => setDlg(null)} title="重试合并" desc="确认已在本地解决冲突并 push 到 feature 分支。" confirmText="重试" busy={busy === "retry"} onConfirm={async () => { if (guard()) return; const r = await run("retry", `${base}/retry-merge`, { method: "POST", body: {} }, "已重新排队合并"); if (r.ok) setDlg(null); }} />
      <ConfirmDialog open={dlg === "exclude"} onClose={() => setDlg(null)} title="剔除回待开发" desc="revert 该需求在 daily 上的合并提交（若有），需求回待开发池。" confirmText="剔除" danger busy={busy === "exclude"} onConfirm={async () => { if (guard()) return; const r = await run("exclude", `${base}/exclude`, { method: "POST", body: {} }, "已排队剔除"); if (r.ok) setDlg(null); }} />
      <ConfirmDialog open={dlg === "accept"} onClose={() => setDlg(null)} title={`验收 REQ-${c.seq}`} desc="验收通过后写入 requirements-log.md。" confirmText="验收通过" busy={busy === "accept"} onConfirm={async () => { if (guard()) return; const r = await run("accept", `${base}/accept`, { method: "POST", body: { action: "accept" } }, "验收通过"); if (r.ok) { setDlg(null); onClose(); } }} />
      <Modal open={prioOpen} onClose={() => setPrioOpen(false)} title="调整优先级" width="max-w-sm" footer={<button className={btnCls("primary")} disabled={busy === "prio"} onClick={async () => { if (guard()) return; const r = await run("prio", `${base}/priority`, { method: "POST", body: prio }, "优先级已更新"); if (r.ok) setPrioOpen(false); }}>保存</button>}>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <Label>优先级</Label>
            <select className="ctl" value={prio.priority} onChange={(e) => setPrio({ ...prio, priority: e.target.value })}>
              <option value="P0">P0 阻塞 / 线上缺陷</option>
              <option value="P1">P1 高价值</option>
              <option value="P2">P2 常规</option>
              <option value="P3">P3 低优</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-[13px] text-ink">
            <input type="checkbox" className="chk" checked={prio.locked} onChange={(e) => setPrio({ ...prio, locked: e.target.checked })} />
            锁定（项管专家不再改动）
          </label>
        </div>
      </Modal>
    </div>
  );
}
