"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { BranchSummary } from "@/lib/branch-summary";
import { Panel, KpiRow, KpiTile, Table, EmptyRow, Chip, EmptyState, Notice, Label, btnCls, fmtDateTime, ago } from "@/components/ui";
import { StatusChip } from "@/components/status";
import { Icon } from "@/components/icons";
import { ConfirmDialog, useAction, useToast } from "@/components/ui-client";

export interface BranchOption {
  id: string;
  project: string;
  name: string;
  mergedToMain: boolean;
  date: string;
}
export interface ReqRow {
  id: string;
  seq: number;
  title: string;
  status: string;
  agent: string | null;
  featureBranch: string | null;
  devStatus: string | null;
  submitNote: string | null;
  report: { conclusion: string; passRate: number } | null;
  conflictFiles: string[];
}
export interface BranchDetail {
  id: string;
  project: string;
  name: string;
  mergedToMain: boolean;
  mergedAt: string | null;
  createdAt: string;
  summary: BranchSummary | null;
  requirements: ReqRow[];
}

const DEMO_MSG = "展示模式下操作不生效";

export function RefreshDiffButton({ branchId, demo }: { branchId: string; demo: boolean }) {
  const toast = useToast();
  const { run, busy } = useAction();
  return (
    <button
      className={btnCls("secondary")}
      disabled={busy === "refresh"}
      onClick={() => (demo ? toast("info", DEMO_MSG) : run("refresh", `/api/admin/branches/${branchId}/refresh`, { method: "POST", body: {} }, "已排队刷新 diff，数秒后自动更新"))}
    >
      <Icon name="refresh" size={14} />
      刷新 diff
    </button>
  );
}

function ReportChip({ r }: { r: ReqRow["report"] }) {
  if (!r) return <Chip tone="slate">无报告</Chip>;
  const pct = Math.round(r.passRate * 100);
  if (r.conclusion === "PASS" && pct === 100) return <Chip tone="green">PASS 100%</Chip>;
  if (r.conclusion === "PASS") return <Chip tone="amber">部分 {pct}%</Chip>;
  return <Chip tone="red">{r.conclusion} {pct}%</Chip>;
}

export function ReviewCenter({ options, detail, missingToday, demo }: { options: BranchOption[]; detail: BranchDetail | null; missingToday: { id: string; name: string }[]; demo: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const { run, busy } = useAction();
  const [dlg, setDlg] = useState<null | { kind: "merge" | "force" | "exclude" | "retry" | "cherry" | "accept" | "sendback"; req?: ReqRow }>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [allCommits, setAllCommits] = useState(false);

  const guard = () => {
    if (demo) toast("info", DEMO_MSG);
    return demo;
  };

  const createBtn = (p: { id: string; name: string }) => (
    <button key={p.id} className={btnCls("secondary", "sm")} disabled={busy === `create-${p.id}`} onClick={() => (guard() ? null : run(`create-${p.id}`, "/api/admin/branches", { body: { projectId: p.id } }, `已排队创建 ${p.name} 今日分支`))}>
      <Icon name="plus" size={13} />
      为 {p.name} 创建今日分支
    </button>
  );

  const computed = useMemo(() => {
    if (!detail) return null;
    const s = detail.summary;
    const perReq = new Map((s?.perRequirement ?? []).map((p) => [p.seq, p]));
    const merged = detail.requirements.filter((r) => r.devStatus === "MERGED" || (perReq.get(r.seq)?.mergeSha ?? null) !== null);
    const conflicts = detail.requirements.filter((r) => r.devStatus === "CONFLICT");
    const passing = merged.filter((r) => r.report?.conclusion === "PASS" && r.report.passRate >= 1);
    const lacking = merged.filter((r) => !(r.report?.conclusion === "PASS" && r.report.passRate >= 1));
    const pendingAccept = detail.requirements.filter((r) => r.status === "PENDING_ACCEPT");
    const reviewing = detail.requirements.filter((r) => r.status === "REVIEWING");
    const authors = new Set((s?.commits ?? []).map((c) => c.author)).size;
    return { perReq, merged, conflicts, passing, lacking, pendingAccept, reviewing, authors };
  }, [detail]);

  if (!detail || !computed) {
    return (
      <div className="rounded-lg border border-line bg-surface">
        <EmptyState icon="branch" title="尚未创建每日分支" desc="每天 02:00 自动为活跃项目从 main 创建 daily 分支；也可以现在手动创建。" action={missingToday.length ? <div className="flex flex-wrap justify-center gap-2">{missingToday.map(createBtn)}</div> : undefined} />
      </div>
    );
  }

  const d = detail;
  const s = d.summary;
  const c = computed;
  const noConflict = c.conflicts.length === 0;
  const allPass = c.lacking.length === 0;
  const acceptDone = c.pendingAccept.length + c.reviewing.length === 0;
  const canMerge = !d.mergedToMain && noConflict && allPass;
  const canForce = !d.mergedToMain && noConflict && !allPass;
  const base = (id: string) => `/api/admin/requirements/${id}`;

  async function doMerge(force: boolean, reason?: string) {
    if (guard()) return;
    const r = await run("merge", `/api/admin/branches/${d.id}/merge${force ? "?force=1" : ""}`, { method: "POST", body: reason ? { reason } : {} }, "已排队合并，稍后刷新查看结果");
    if (r.ok) setDlg(null);
  }
  async function acceptMany(ids: string[]) {
    if (guard()) return;
    for (const id of ids) {
      const r = await run(`accept-${id}`, base(id) + "/accept", { method: "POST", body: { action: "accept" } });
      if (!r.ok) break;
    }
    toast("ok", `已验收 ${ids.length} 项`);
    setChecked(new Set());
  }

  const commits = s?.commits ?? [];
  const shownCommits = allCommits ? commits : commits.slice(0, 20);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <select className="ctl w-auto min-w-[260px]" value={d.id} onChange={(e) => router.push(`/branches?branch=${e.target.value}`)}>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.project} · {o.name}
              {o.mergedToMain ? "（已合并）" : ""}
            </option>
          ))}
        </select>
        {d.mergedToMain ? <Chip tone="green">已合并 main · {fmtDateTime(d.mergedAt)}</Chip> : <Chip tone="amber">未合并</Chip>}
        <span className="text-[12px] text-ink-3">
          {s?.baseCommit ? `基于 main@${s.baseCommit} · ` : ""}
          创建 {fmtDateTime(d.createdAt)}
          {s ? ` · diff 刷新于 ${ago(s.refreshedAt)}` : ""}
        </span>
        {missingToday.length > 0 && <div className="ml-auto flex flex-wrap gap-2">{missingToday.slice(0, 3).map(createBtn)}</div>}
      </div>

      {!s && <Notice tone="info">diff 摘要尚未生成。点右上「刷新 diff」，worker 会用 git 计算提交与变更统计。</Notice>}
      {s?.error && <Notice tone="danger">diff 计算失败：{s.error}</Notice>}

      <KpiRow cols={5}>
        <KpiTile label="需求" value={d.requirements.length} sub={`${c.merged.length} 已合入 daily`} />
        <KpiTile label="提交" value={s ? s.totals.commits : "—"} sub={s ? `${c.authors} 位作者` : "待刷新"} />
        <KpiTile label="变更" value={s ? `${s.totals.files} 文件` : "—"} sub={s ? <span className="num">+{s.totals.insertions} −{s.totals.deletions}</span> : "待刷新"} />
        <KpiTile label="测试报告" value={`${c.passing.length} / ${c.merged.length}`} sub={c.merged.length === 0 ? "无已合入需求" : allPass ? "全部 PASS" : `缺 ${c.lacking.length} 份`} tone={c.merged.length > 0 && !allPass ? "warn" : "default"} />
        <KpiTile label="冲突" value={c.conflicts.length} sub={c.conflicts.length ? c.conflicts.map((r) => `REQ-${r.seq}`).join("、") : "无"} tone={c.conflicts.length ? "alert" : "default"} />
      </KpiRow>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
        <div className="flex flex-col gap-4">
          <Panel title="当日分支变更（按需求分组）" pad={false} extra={<span className="text-[12px] text-ink-3">数据来自 git diff main…daily</span>}>
            <Table head={["编号", "需求", "开发 Agent", "feature 分支", "文件 / 行数", "测试", "状态", ""]}>
              {d.requirements.map((r) => {
                const p = c.perReq.get(r.seq);
                const conflict = r.devStatus === "CONFLICT";
                const mergedIn = !!p?.mergeSha || r.devStatus === "MERGED";
                return (
                  <tr key={r.id} className={conflict ? "bg-danger-soft/40" : ""}>
                    <td className="font-mono text-[12px] text-ink-3">REQ-{r.seq}</td>
                    <td className="max-w-[260px]">
                      <Link href={`/requirements/${r.id}`} className="block truncate font-medium text-ink hover:text-accent">
                        {r.title}
                      </Link>
                      {r.submitNote && <span className="block truncate text-[12px] text-ink-3">{r.submitNote}</span>}
                    </td>
                    <td className="font-mono text-[12px] text-ink-2">{r.agent ?? "—"}</td>
                    <td className="font-mono text-[12px] text-ink-2">{r.featureBranch ?? "—"}</td>
                    <td className="num font-mono text-[12px] text-ink-2">
                      {p && mergedIn ? (
                        <span title={p.changedFiles.slice(0, 20).join("\n")}>
                          {p.files} / <span className="text-ok">+{p.insertions}</span> <span className="text-danger">−{p.deletions}</span>
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      <ReportChip r={r.report} />
                    </td>
                    <td>{conflict ? <Chip tone="red">冲突</Chip> : mergedIn ? <StatusChip status={r.status} /> : <Chip tone="slate">未合入</Chip>}</td>
                    <td className="text-right">
                      <span className="flex justify-end gap-1">
                        {conflict && (
                          <button className={btnCls("ghost", "sm")} onClick={() => setDlg({ kind: "retry", req: r })}>
                            重试合并
                          </button>
                        )}
                        {(conflict || mergedIn) && !d.mergedToMain && r.status !== "ACCEPTED" && (
                          <button className={btnCls("ghost", "sm")} onClick={() => setDlg({ kind: "exclude", req: r })}>
                            剔除
                          </button>
                        )}
                        {r.status === "PENDING_ACCEPT" && !d.mergedToMain && (
                          <button className={btnCls("ghost", "sm")} onClick={() => setDlg({ kind: "cherry", req: r })}>
                            单独合入 main
                          </button>
                        )}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {d.requirements.length === 0 && <EmptyRow colSpan={8}>今天还没有需求认领到这个分支。</EmptyRow>}
            </Table>
          </Panel>

          <Panel title={`提交记录（${commits.length}）`} pad={false}>
            <Table head={["SHA", "提交信息", "作者", "需求", { label: "时间", align: "right" }]} dense>
              {shownCommits.map((cm) => (
                <tr key={cm.sha}>
                  <td className="font-mono text-[12px] text-accent">{cm.sha}</td>
                  <td className="max-w-[420px] truncate text-ink">{cm.message}</td>
                  <td className="font-mono text-[12px] text-ink-2">{cm.author}</td>
                  <td className="font-mono text-[12px] text-ink-2">{cm.reqSeq ? `REQ-${cm.reqSeq}` : "—"}</td>
                  <td className="num text-right text-[12px] text-ink-3">{fmtDateTime(cm.date)}</td>
                </tr>
              ))}
              {commits.length === 0 && <EmptyRow colSpan={5}>{s ? "该分支相对 main 没有新提交" : "diff 摘要未生成"}</EmptyRow>}
            </Table>
            {commits.length > 20 && (
              <button className="w-full border-t border-line py-2 text-center text-[12px] text-ink-3 hover:text-ink" onClick={() => setAllCommits(!allCommits)}>
                {allCommits ? "收起" : `展开全部 ${commits.length} 条`}
              </button>
            )}
          </Panel>
        </div>

        <div className="flex flex-col gap-4">
          <Panel>
            <div className="flex items-center justify-between">
              <span className="text-[14px] font-semibold text-ink">合并到 main</span>
              {d.mergedToMain ? <Chip tone="green">已合并</Chip> : canMerge ? <Chip tone="green">可合并</Chip> : <Chip tone="red">{[!noConflict, !allPass].filter(Boolean).length} 项未满足</Chip>}
            </div>
            <ul className="mt-3 flex flex-col gap-2">
              {[
                { ok: noConflict, t: "无合并冲突", d: noConflict ? "所有 feature 已合入" : `${c.conflicts.map((r) => `REQ-${r.seq}`).join("、")} 存在冲突` },
                { ok: allPass, t: "测试报告全部通过", d: c.merged.length === 0 ? "尚无已合入需求" : allPass ? `${c.passing.length} / ${c.merged.length} 份 PASS` : `缺：${c.lacking.map((r) => `REQ-${r.seq}`).join("、")}` },
                { ok: acceptDone, t: "待验收需求已处理", d: acceptDone ? "无遗留" : `${c.pendingAccept.length} 项待验收${c.reviewing.length ? ` · ${c.reviewing.length} 项待裁决` : ""}（建议先处理）`, soft: true },
              ].map((it) => (
                <li key={it.t} className="flex items-start gap-2">
                  <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${it.ok ? "bg-ok-soft text-ok" : it.soft ? "bg-warn-soft text-warn" : "bg-danger-soft text-danger"}`}>
                    <Icon name={it.ok ? "checkSimple" : "x"} size={10} strokeWidth={2.4} />
                  </span>
                  <span className="flex flex-col">
                    <span className="text-[13px] font-medium text-ink">{it.t}</span>
                    <span className="text-[12px] text-ink-3">{it.d}</span>
                  </span>
                </li>
              ))}
            </ul>
            <button className={btnCls("primary", "md", "mt-3 w-full")} disabled={!canMerge || busy === "merge"} onClick={() => setDlg({ kind: "merge" })}>
              <Icon name="merge" size={14} />
              {d.mergedToMain ? "已合并 main" : `合并 ${d.name} → main`}
            </button>
            {canForce && (
              <button className={btnCls("ghost", "sm", "mt-1 w-full")} onClick={() => setDlg({ kind: "force" })}>
                强制合并（跳过报告检查）
              </button>
            )}
            <p className="mt-2 text-[12px] leading-relaxed text-ink-3">合并为 --no-ff，异步执行；完成后本页状态变为「已合并」。</p>
          </Panel>

          <Panel title={`待验收（${c.pendingAccept.length}）`} pad={false} extra={<Link href="/requirements?status=PENDING_ACCEPT" className="text-[12px] text-accent hover:underline">需求列表</Link>}>
            {c.pendingAccept.length === 0 ? (
              <p className="px-4 py-4 text-center text-[12px] text-ink-3">无待验收</p>
            ) : (
              <>
                <ul className="divide-y divide-line">
                  {c.pendingAccept.map((r) => (
                    <li key={r.id} className="flex items-center gap-2 px-4 py-2.5">
                      <input
                        type="checkbox"
                        className="chk"
                        checked={checked.has(r.id)}
                        onChange={(e) => {
                          const n = new Set(checked);
                          if (e.target.checked) n.add(r.id);
                          else n.delete(r.id);
                          setChecked(n);
                        }}
                      />
                      <div className="min-w-0 flex-1">
                        <span className="block font-mono text-[11px] text-ink-3">REQ-{r.seq}</span>
                        <Link href={`/requirements/${r.id}`} className="block truncate text-[13px] font-medium text-ink hover:text-accent">
                          {r.title}
                        </Link>
                      </div>
                      <button className={btnCls("primary", "sm")} disabled={busy === `accept-${r.id}`} onClick={() => setDlg({ kind: "accept", req: r })}>
                        验收
                      </button>
                      <button className={btnCls("secondary", "sm")} onClick={() => setDlg({ kind: "sendback", req: r })}>
                        退回
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="flex justify-end border-t border-line px-4 py-2.5">
                  <button className={btnCls("secondary", "sm")} disabled={checked.size === 0} onClick={() => acceptMany([...checked])}>
                    批量验收所选（{checked.size}）
                  </button>
                </div>
              </>
            )}
          </Panel>

          {c.conflicts.length > 0 && (
            <Panel title="冲突处理">
              <div className="flex flex-col gap-4">
                {c.conflicts.map((r) => (
                  <div key={r.id} className="flex flex-col gap-1.5 text-[13px]">
                    <span>
                      <span className="font-mono text-ink-2">REQ-{r.seq}</span> {r.featureBranch} → daily 合并失败
                    </span>
                    {r.conflictFiles.length > 0 && <span className="font-mono text-[12px] text-danger">{r.conflictFiles.join(", ")}</span>}
                    <div className="flex gap-2">
                      <button className={btnCls("primary", "sm")} onClick={() => setDlg({ kind: "retry", req: r })}>
                        <Icon name="refresh" size={12} />
                        重试合并
                      </button>
                      <button className={btnCls("secondary", "sm")} onClick={() => setDlg({ kind: "exclude", req: r })}>
                        剔除本需求
                      </button>
                    </div>
                  </div>
                ))}
                <p className="text-[12px] leading-relaxed text-ink-3">在本地解决冲突并 push 到 feature 分支后，点击「重试合并」。</p>
              </div>
            </Panel>
          )}
        </div>
      </div>

      <ConfirmDialog open={dlg?.kind === "merge"} onClose={() => setDlg(null)} title={`合并 ${d.name} 到 main`} desc="合并后无法撤销，请确认所有验收工作已完成。" confirmText="合并到 main" busy={busy === "merge"} onConfirm={() => doMerge(false)} />
      <ConfirmDialog open={dlg?.kind === "force"} onClose={() => setDlg(null)} title="强制合并" desc={`以下需求没有通过的测试报告：${c.lacking.map((r) => `REQ-${r.seq}`).join("、")}。强制合并将记入审计。`} confirmText="强制合并" danger reason={{ label: "原因", required: true }} busy={busy === "merge"} onConfirm={(reason) => doMerge(true, reason)} />
      <ConfirmDialog open={dlg?.kind === "retry"} onClose={() => setDlg(null)} title={`重试合并 REQ-${dlg?.req?.seq}`} desc="确认已在本地解决冲突并 push 到 feature 分支。" confirmText="重试" busy={busy === "retry"} onConfirm={async () => { if (guard() || !dlg?.req) return; const r = await run("retry", base(dlg.req.id) + "/retry-merge", { method: "POST", body: {} }, "已重新排队合并"); if (r.ok) setDlg(null); }} />
      <ConfirmDialog open={dlg?.kind === "exclude"} onClose={() => setDlg(null)} title={`剔除 REQ-${dlg?.req?.seq}`} desc="revert 该需求在 daily 上的合并提交，需求回到待开发池（feature 分支保留）。" confirmText="剔除" danger busy={busy === "exclude"} onConfirm={async () => { if (guard() || !dlg?.req) return; const r = await run("exclude", base(dlg.req.id) + "/exclude", { method: "POST", body: {} }, "已排队剔除"); if (r.ok) setDlg(null); }} />
      <ConfirmDialog open={dlg?.kind === "cherry"} onClose={() => setDlg(null)} title={`单独合入 main：REQ-${dlg?.req?.seq}`} desc="不等晚间合并，把该需求的合并提交 cherry-pick 到 main。" confirmText="合入 main" busy={busy === "cherry"} onConfirm={async () => { if (guard() || !dlg?.req) return; const r = await run("cherry", base(dlg.req.id) + "/cherry-pick", { method: "POST", body: {} }, "已排队合入 main"); if (r.ok) setDlg(null); }} />
      <ConfirmDialog open={dlg?.kind === "accept"} onClose={() => setDlg(null)} title={`验收 REQ-${dlg?.req?.seq}`} desc={dlg?.req?.title} confirmText="验收通过" busy={busy === `accept-${dlg?.req?.id}`} onConfirm={async () => { if (guard() || !dlg?.req) return; const r = await run(`accept-${dlg.req.id}`, base(dlg.req.id) + "/accept", { method: "POST", body: { action: "accept" } }, "验收通过"); if (r.ok) setDlg(null); }} />
      <ConfirmDialog open={dlg?.kind === "sendback"} onClose={() => setDlg(null)} title={`退回 REQ-${dlg?.req?.seq}`} desc="需求回到待开发池重新认领开发。" confirmText="退回" danger reason={{ label: "退回原因", required: true }} busy={busy === "sendback"} onConfirm={async (note) => { if (guard() || !dlg?.req) return; const r = await run("sendback", base(dlg.req.id) + "/accept", { method: "POST", body: { action: "send_back", note } }, "已退回待开发"); if (r.ok) setDlg(null); }} />
    </>
  );
}
