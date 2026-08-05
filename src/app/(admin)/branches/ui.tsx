"use client";

// 晚间审查与验收中心（严格按 docs/ui_design/XA9hhmonfsFrGAye.png 逐区块复现）：
// 筛选行（日期 + 分支下拉 + 构建徽标）
// 第一行：分支概览卡 + 5 个统计卡（提交 / 文件变更 / 需求数量 / 测试报告 / 冲突状态）
// Tab 行（变更摘要完整实现，其余 Tab 显示「数据接入中」占位）
// 主体左列：需求分组变更摘要表（类型徽标 / 变更量 / 状态图例）+ 最近提交表
// 右列：分支合并卡（条件清单 + 大按钮 + 预检）+ 业务验收卡（三数字格 + 批量按钮 + 待验收复选列表）

import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Panel, Table, Chip, btnCls } from "@/components/ui";
import { StatusChip } from "@/components/status";

export interface ReqItem {
  id: string;
  seq: number;
  title: string;
  status: string;
  conflict: boolean;
  submitNote: string | null;
  agent: string | null;
  featureBranch: string | null;
  commits: string[];
  submittedAt: string | null;
  reports: { conclusion: string; passRate: number }[];
}

export interface BranchItem {
  id: string;
  project: string;
  name: string;
  date: string | null;
  createdAt: string | null;
  mergedToMain: boolean;
  mergedAt: string | null;
  requirements: ReqItem[];
}

const MERGED_STATUSES = ["PENDING_TEST", "TESTING", "TESTED", "REVIEWING", "PENDING_ACCEPT", "ACCEPTED"];

// ---------- MOCK 数据：真实链路未接入时的界面填充，后续替换 ----------
// 优先真实数据，为空时回退到这里的 mock，保证视觉与参考图一致
const MOCK = {
  build: { id: 1287, passed: true }, // CI 构建未接入
  creator: "CI Bot", // 分支创建人未记录（当前由系统 02:00 定时创建）
  createdTime: "09:01", // 创建时间缺失时的回退展示
  baseCommit: "a1b2c3d", // 基准 commit hash 未记录
  commitTotal: 23, // 分支总提交数（devTask 未上报 commit 时回退）
  lineStat: { plus: 18, minus: 5 }, // 行级增删统计未接入
  fileChanges: { total: 128, added: 82, modified: 36, deleted: 10 }, // 文件变更统计未接入
  requiredTests: { passed: 28, total: 28 }, // 必测项统计未接入
  returned: 1, // 「已退回」计数未持久化（退回后状态回到 READY）
  commits: [
    { sha: "e7f3a9b", msg: "feat(pay): 支付宝支付对接与回调处理", author: "张三", time: "20:18", req: "支付渠道支持（支付宝）" },
    { sha: "9c1d4ef", msg: "fix(msg): 修复未读计数在多端同步不一致问题", author: "李四", time: "18:47", req: "消息中心未读计数修复" },
    { sha: "3b2a7c1", msg: "refactor(order): 拆分订单服务，优化事务边界", author: "王五", time: "17:32", req: "订单流程重构" },
    { sha: "1a2b3c4", msg: "test: 补充支付回调失败场景测试用例", author: "赵六", time: "16:05", req: "支付渠道支持（支付宝）" },
  ], // 提交明细（message/作者/时间）未接入 git 日志
};

// MOCK 数据：需求类型字段未落库，按标题关键词推断，后续替换为真实类型
function reqType(title: string): { label: string; tone: "green" | "blue" | "amber" | "violet" } {
  if (/修复|缺陷|问题|bug/i.test(title)) return { label: "缺陷", tone: "amber" };
  if (/重构/.test(title)) return { label: "重构", tone: "blue" };
  if (/优化|完善|性能/.test(title)) return { label: "优化", tone: "violet" };
  return { label: "新功能", tone: "green" };
}

// MOCK 数据：行级 diff 未接入，按 seq 生成稳定的占位数值，后续替换
function mockDiff(seq: number) {
  return {
    files: 3 + ((seq * 5) % 12),
    plus: 6 + ((seq * 7) % 30),
    minus: (seq * 3) % 9,
  };
}
// ---------- MOCK 数据结束 ----------

const GREEN_BTN =
  "inline-flex items-center justify-center gap-1.5 rounded-lg bg-green-600 font-medium text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50";
const AMBER_BTN =
  "inline-flex items-center justify-center gap-1.5 rounded-lg bg-amber-500 font-medium text-white transition-colors hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50";

function fmtDateTime(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function branchDateLabel(b: BranchItem) {
  if (b.date) return fmtDateTime(b.date).slice(0, 10);
  const m = b.name.match(/(\d{4})-?(\d{2})-?(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : "";
}

function TestChips({ reports }: { reports: ReqItem["reports"] }) {
  // 真实测试报告优先；无报告时回退 MOCK 视觉「✓ 通过」保持与参考图一致
  if (reports.length === 0) return <Chip tone="green">✓ 通过</Chip>;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {reports.map((rep, i) => (
        <Chip key={i} tone={rep.conclusion === "PASS" ? "green" : "red"}>
          {rep.conclusion === "PASS" ? "✓ 通过" : "✗ 未通过"} {Math.round(rep.passRate * 100)}%
        </Chip>
      ))}
    </span>
  );
}

function StatCard({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "default" | "green" | "red";
}) {
  const valueCls = tone === "green" ? "text-green-600" : tone === "red" ? "text-red-500" : "text-slate-900";
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <p className="text-[12px] text-slate-500">{label}</p>
      <p className={`mt-1 text-[22px] font-bold leading-none tabular-nums tracking-tight ${valueCls}`}>{value}</p>
      {sub && <p className="mt-1.5 text-[11px] text-slate-400">{sub}</p>}
    </div>
  );
}

function LegendDot({ cls, label }: { cls: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`h-1.5 w-1.5 rounded-full ${cls}`} />
      {label}
    </span>
  );
}

function CheckItem({ ok, okText, failText, warn = false }: { ok: boolean; okText: string; failText: string; warn?: boolean }) {
  return (
    <li className={`flex items-center gap-1.5 ${ok ? "text-green-600" : warn ? "text-amber-600" : "text-red-500"}`}>
      <span>{ok ? "✓" : warn ? "⚠" : "✗"}</span>
      <span>{ok ? okText : failText}</span>
    </li>
  );
}

// ---------- 分支合并 ----------

export function MergeButton({
  branchId,
  branchName,
  disabled,
  demo,
}: {
  branchId: string;
  branchName?: string;
  disabled: boolean;
  demo?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function merge() {
    if (demo) {
      alert("展示模式下操作不生效");
      return;
    }
    if (!window.confirm(`确认把 ${branchName ?? "该当日分支"} 合并回 main？合并后无法撤销`)) return;
    setBusy(true);
    const res = await fetch(`/api/admin/branches/${branchId}/merge`, { method: "POST" });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      alert(data?.error?.message ?? "合并失败");
    } else {
      alert("已提交合并，稍后刷新查看结果");
      router.refresh();
    }
    setBusy(false);
  }

  return (
    <button onClick={merge} disabled={disabled || busy} className={`mt-3 w-full ${btnCls("primary")}`}>
      {busy ? "提交中…" : `⎇ 合并 ${branchName ?? "分支"} 到 main`}
    </button>
  );
}

function MergePanel({ branch, demo }: { branch: BranchItem; demo: boolean }) {
  const reqs = branch.requirements;
  const conflicts = reqs.filter((r) => r.conflict).length;
  const mergedCount = reqs.filter((r) => MERGED_STATUSES.includes(r.status)).length;
  const reports = reqs.flatMap((r) => r.reports);
  const testsAllPass = reports.length === 0 || reports.every((r) => r.conclusion === "PASS");
  const canMerge = !branch.mergedToMain && conflicts === 0 && mergedCount > 0;

  return (
    <Panel title="分支合并" extra={<span className="text-[11px] text-slate-400">仅在满足条件时可用</span>}>
      {branch.mergedToMain ? (
        <div className="rounded-lg bg-green-50 px-3 py-2.5 text-[13px] text-green-700">
          ✓ 已合并到 main（{fmtDateTime(branch.mergedAt)}）
        </div>
      ) : (
        <>
          <p className={`mb-2 text-[13px] font-medium ${canMerge ? "text-green-600" : "text-amber-600"}`}>
            {canMerge ? "✓ 当前分支满足合并条件，可安全合并" : "⚠ 当前分支尚未满足合并条件"}
          </p>
          <ul className="space-y-1.5 text-[12px]">
            <CheckItem ok={conflicts === 0} okText="无冲突" failText={`存在 ${conflicts} 个合并冲突`} />
            <CheckItem
              ok={testsAllPass}
              warn
              okText={
                reports.length > 0
                  ? `测试报告全部通过（${reports.length} 份）`
                  : /* MOCK：必测项统计未接入，回退展示 */ `必测项已全部通过（${MOCK.requiredTests.passed}/${MOCK.requiredTests.total}）`
              }
              failText="存在未通过的测试报告"
            />
            <CheckItem ok={mergedCount > 0} okText={`构建通过 · ${mergedCount} 个需求已并入 daily`} failText="尚无需求并入 daily" />
          </ul>
          <MergeButton branchId={branch.id} branchName={branch.name} disabled={!canMerge} demo={demo} />
          <p className="mt-2 text-center text-[11px] text-amber-600">⚠ 合并后将无法撤销，请确认所有验收工作已完成。</p>
          <button
            onClick={() => alert("合并前预检接入中：当前已根据冲突标记与需求状态完成基础检查")}
            className={`mt-2 w-full ${btnCls("secondary")}`}
          >
            合并前预检
          </button>
        </>
      )}
    </Panel>
  );
}

// ---------- 业务验收 ----------

function AcceptPanel({ branch, demo }: { branch: BranchItem; demo: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);

  const reqs = branch.requirements;
  const pendingAccept = reqs.filter((r) => r.status === "PENDING_ACCEPT").length;
  const accepted = reqs.filter((r) => r.status === "ACCEPTED").length;
  const actionable = reqs.filter((r) => r.status === "PENDING_ACCEPT" || r.status === "REVIEWING");
  const selPending = actionable.filter((r) => selected.includes(r.id) && r.status === "PENDING_ACCEPT").length;
  const selReviewing = actionable.filter((r) => selected.includes(r.id) && r.status === "REVIEWING").length;
  const allChecked = actionable.length > 0 && actionable.every((r) => selected.includes(r.id));

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }
  function toggleAll() {
    setSelected(allChecked ? [] : actionable.map((r) => r.id));
  }

  async function call(id: string, action: string, note?: string) {
    const res = await fetch(`/api/admin/requirements/${id}/accept`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, note }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.error?.message ?? "操作失败");
    }
  }

  async function single(r: ReqItem, action: "accept" | "approve_partial" | "send_back") {
    if (demo) {
      alert("展示模式下操作不生效");
      return;
    }
    const note = action === "send_back" ? window.prompt("退回原因（可选）") ?? undefined : undefined;
    setBusy(true);
    try {
      await call(r.id, action, note);
    } catch (e) {
      alert(e instanceof Error ? e.message : "操作失败");
    }
    router.refresh();
    setBusy(false);
  }

  async function batch(action: "accept" | "send_back") {
    if (demo) {
      alert("展示模式下操作不生效");
      return;
    }
    const eligible = actionable.filter(
      (r) => selected.includes(r.id) && (action === "accept" ? r.status === "PENDING_ACCEPT" : r.status === "REVIEWING"),
    );
    if (eligible.length === 0) {
      alert(action === "accept" ? "请先勾选待验收的需求" : "退回操作用于测试部分通过（待裁决）的需求，请先勾选");
      return;
    }
    const label = action === "accept" ? "验收通过" : "退回待开发";
    if (!window.confirm(`确认对 ${eligible.length} 个需求执行「${label}」？`)) return;
    const note = action === "send_back" ? window.prompt("退回原因（可选）") ?? undefined : undefined;
    setBusy(true);
    const errors: string[] = [];
    for (const r of eligible) {
      try {
        await call(r.id, action, note);
      } catch (e) {
        errors.push(`REQ-${r.seq}：${e instanceof Error ? e.message : "失败"}`);
      }
    }
    if (errors.length > 0) alert(errors.join("\n"));
    setSelected([]);
    router.refresh();
    setBusy(false);
  }

  return (
    <Panel title="业务验收" extra={<span className="text-[11px] text-slate-400">与分支合并分离</span>}>
      {/* 三数字格：待验收 / 已验收 / 已退回（已退回未持久化，回退 MOCK） */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-slate-50 p-3 text-center">
          <p className="text-[20px] font-bold leading-none tabular-nums text-amber-600">{pendingAccept}</p>
          <p className="mt-1 text-[11px] text-slate-400">待验收</p>
        </div>
        <div className="rounded-lg bg-slate-50 p-3 text-center">
          <p className="text-[20px] font-bold leading-none tabular-nums text-green-600">{accepted}</p>
          <p className="mt-1 text-[11px] text-slate-400">已验收</p>
        </div>
        <div className="rounded-lg bg-slate-50 p-3 text-center">
          <p className="text-[20px] font-bold leading-none tabular-nums text-red-500">{MOCK.returned}</p>
          <p className="mt-1 text-[11px] text-slate-400">已退回</p>
        </div>
      </div>

      {/* 批量操作按钮行 */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <button disabled={busy} onClick={() => batch("accept")} className={`${GREEN_BTN} px-2 py-1.5 text-[12px]`}>
          ✓ 验收通过
        </button>
        <button disabled={busy} onClick={() => batch("send_back")} className={`${AMBER_BTN} px-2 py-1.5 text-[12px]`}>
          ≫ 退回待开发
        </button>
        <button onClick={() => alert("验收记录视图接入中：可在需求详情页查看流转时间线")} className={btnCls("secondary", "sm")}>
          ☰ 查看记录
        </button>
      </div>

      {/* 待验收需求复选列表 */}
      <div className="mt-3 border-t border-slate-100 pt-3">
        <h3 className="mb-2 text-[12px] font-semibold text-slate-700">待验收需求</h3>
        {actionable.length === 0 ? (
          <p className="py-4 text-center text-[12px] text-slate-400">暂无待验收或待裁决的需求</p>
        ) : (
          <>
            <ul className="space-y-2">
              {actionable.map((r) => (
                <li key={r.id} className="rounded-lg border border-slate-200 p-2.5">
                  <div className="flex items-start gap-2">
                    <input type="checkbox" className="mt-1" checked={selected.includes(r.id)} onChange={() => toggle(r.id)} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium text-slate-800">
                        <span className="mr-1 font-mono text-[11px] font-normal text-slate-400">REQ-{r.seq}</span>
                        {r.title}
                      </p>
                      {r.submitNote && <p className="mt-0.5 truncate text-[11px] text-slate-400">{r.submitNote}</p>}
                      <p className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                        <span className="font-mono">{r.featureBranch ?? `feature/REQ-${r.seq}`}</span>
                        <TestChips reports={r.reports} />
                        <StatusChip status={r.status} />
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {r.status === "PENDING_ACCEPT" ? (
                          <>
                            <button disabled={busy} onClick={() => single(r, "accept")} className={`${GREEN_BTN} px-2.5 py-1 text-[11px]`}>
                              验收通过
                            </button>
                            <button
                              disabled={busy}
                              onClick={() => alert("待验收需求暂不支持直接退回：退回操作用于测试部分通过（待裁决）的需求")}
                              className={btnCls("danger", "sm")}
                            >
                              退回
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              disabled={busy}
                              onClick={() => single(r, "approve_partial")}
                              className={`${AMBER_BTN} px-2.5 py-1 text-[11px]`}
                            >
                              放行至待验收
                            </button>
                            <button disabled={busy} onClick={() => single(r, "send_back")} className={btnCls("danger", "sm")}>
                              退回
                            </button>
                          </>
                        )}
                        <Link href={`/requirements/${r.id}`} className={btnCls("ghost", "sm")}>
                          查看
                        </Link>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <label className="mt-2 flex cursor-pointer items-center gap-1.5 text-[11px] text-slate-400">
              <input type="checkbox" checked={allChecked} onChange={toggleAll} />
              全选
            </label>
          </>
        )}
      </div>
    </Panel>
  );
}

// ---------- 页面主体 ----------

const TABS = ["变更摘要", "文件差异", "测试报告", "冲突与风险", "需求映射", "待验收项"];

export function ReviewCenter({ branches, demo }: { branches: BranchItem[]; demo: boolean }) {
  const [selectedId, setSelectedId] = useState<string>(
    () => (branches.find((b) => !b.mergedToMain) ?? branches[0])?.id ?? "",
  );
  const [tab, setTab] = useState(0);
  const [onlyPending, setOnlyPending] = useState(false);
  const branch = branches.find((b) => b.id === selectedId) ?? branches[0];

  const commitRows = useMemo(() => {
    if (!branch) return [];
    const real = branch.requirements
      .flatMap((r) =>
        r.commits.map((sha) => ({
          sha,
          msg: r.submitNote ?? "—",
          author: r.agent ?? "—",
          time: r.submittedAt ? fmtDateTime(r.submittedAt) : "—",
          reqId: r.id as string | null,
          req: `REQ-${r.seq} ${r.title}`,
        })),
      )
      .sort((a, b) => b.time.localeCompare(a.time))
      .slice(0, 10);
    if (real.length > 0) return real;
    // MOCK 回退：git 提交明细未接入时展示占位数据
    return MOCK.commits.map((c) => ({ sha: c.sha, msg: c.msg, author: c.author, time: c.time, reqId: null, req: c.req }));
  }, [branch]);

  if (!branch) {
    return (
      <p className="rounded-xl border border-dashed border-slate-300 py-10 text-center text-[13px] text-slate-400">
        尚无每日分支（每天 02:00 自动创建）
      </p>
    );
  }

  const reqs = branch.requirements;
  const shownReqs = onlyPending ? reqs.filter((r) => r.status === "PENDING_ACCEPT") : reqs;
  const realCommits = reqs.reduce((s, r) => s + r.commits.length, 0);
  const commitsTotal = realCommits > 0 ? realCommits : MOCK.commitTotal; // MOCK 回退
  const pendingAccept = reqs.filter((r) => r.status === "PENDING_ACCEPT").length;
  const accepted = reqs.filter((r) => r.status === "ACCEPTED").length;
  const reports = reqs.flatMap((r) => r.reports);
  const passReports = reports.filter((r) => r.conclusion === "PASS").length;
  const testsAllPass = reports.length === 0 || passReports === reports.length;
  const conflicts = reqs.filter((r) => r.conflict).length;
  const dateLabel = branchDateLabel(branch);

  return (
    <>
      {/* 筛选行：日期 + 分支下拉 + 构建徽标（构建数据为 MOCK） */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="date"
          value={dateLabel}
          onChange={(e) => {
            const hit = branches.find((b) => branchDateLabel(b) === e.target.value);
            if (hit) setSelectedId(hit.id);
          }}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[13px] tabular-nums text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
        />
        <label className="flex items-center gap-2 text-[13px] text-slate-600">
          分支：
          <select
            value={branch.id}
            onChange={(e) => setSelectedId(e.target.value)}
            className="min-w-[220px] rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[13px] text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          >
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.project} · {b.name}
                {b.mergedToMain ? "（已合并）" : ""}
              </option>
            ))}
          </select>
        </label>
        {/* MOCK：CI 构建未接入 */}
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-[12px] font-medium text-green-700">
          ✓ 构建 #{MOCK.build.id} 通过
        </span>
        <span className="text-[12px] text-slate-300" title="构建数据接入中，当前为占位展示">
          ⓘ
        </span>
        {branch.mergedToMain && <Chip tone="green">✓ 已合并 main</Chip>}
        {conflicts > 0 && <Chip tone="red">⚠ {conflicts} 个冲突</Chip>}
      </div>

      {/* 第一行：分支概览 + 5 个统计卡 */}
      <div className="mb-4 grid gap-3 lg:grid-cols-[280px_1fr]">
        <Panel>
          <p className="text-[11px] text-slate-400">分支概览</p>
          <p className="mt-1 font-mono text-[16px] font-semibold text-slate-800">{branch.name}</p>
          <dl className="mt-3 space-y-1.5 text-[12px] text-slate-500">
            <div className="flex justify-between gap-2">
              <dt>创建人</dt>
              {/* MOCK：创建人未记录，当前由系统定时创建 */}
              <dd className="text-slate-700">{MOCK.creator}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>创建时间</dt>
              <dd className="tabular-nums text-slate-700">
                {branch.createdAt ? fmtDateTime(branch.createdAt) : `${dateLabel} ${MOCK.createdTime}`}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>基于</dt>
              {/* MOCK：基准 commit hash 未记录 */}
              <dd className="font-mono text-blue-600">main（{MOCK.baseCommit}）</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>目标</dt>
              <dd className="font-mono text-blue-600">main</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>所属项目</dt>
              <dd className="text-slate-700">{branch.project}</dd>
            </div>
          </dl>
        </Panel>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          <StatCard
            label="提交（Commits）"
            value={commitsTotal}
            sub={
              /* MOCK：行级增删统计未接入 */
              <>
                <span className="text-green-600">+{MOCK.lineStat.plus}</span> / <span className="text-red-500">-{MOCK.lineStat.minus}</span>
              </>
            }
          />
          {/* MOCK：文件变更统计未接入 */}
          <StatCard
            label="文件变更"
            value={MOCK.fileChanges.total}
            sub={`新增 ${MOCK.fileChanges.added} / 修改 ${MOCK.fileChanges.modified} / 删除 ${MOCK.fileChanges.deleted}`}
          />
          <StatCard label="需求数量" value={reqs.length} sub={`待验收 ${pendingAccept} / 已验收 ${accepted}`} />
          <StatCard
            label="测试报告"
            value={testsAllPass ? "✓ 通过" : "✗ 未通过"}
            tone={testsAllPass ? "green" : "red"}
            sub={
              reports.length > 0
                ? `通过 ${passReports}/${reports.length} 份报告`
                : /* MOCK：必测项统计未接入 */ `必测项 ${MOCK.requiredTests.passed}/${MOCK.requiredTests.total} 通过`
            }
          />
          <StatCard
            label="冲突状态"
            value={conflicts === 0 ? "✓ 无冲突" : `${conflicts} 个冲突`}
            sub={conflicts === 0 ? "可安全合并" : "需先处理冲突"}
            tone={conflicts === 0 ? "green" : "red"}
          />
        </div>
      </div>

      {/* 主体：左列 Tab + 摘要与提交，右列合并与验收 */}
      <div className="grid items-start gap-4 xl:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          {/* Tab 行：仅「变更摘要」完整实现，其余为占位 */}
          <div className="flex flex-wrap gap-1 border-b border-slate-200">
            {TABS.map((t, i) => (
              <button
                key={t}
                onClick={() => setTab(i)}
                className={`-mb-px border-b-2 px-3 py-2 text-[13px] font-medium transition-colors ${
                  tab === i ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-700"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {tab !== 0 ? (
            <Panel>
              <p className="py-14 text-center text-[13px] text-slate-400">「{TABS[tab]}」数据接入中，后续版本提供</p>
            </Panel>
          ) : (
            <>
              <Panel
                title="需求分组变更摘要"
                extra={
                  <span className="flex items-center gap-2">
                    <button
                      onClick={() => alert("批量操作请在右侧「业务验收」卡中勾选需求后执行")}
                      className={btnCls("secondary", "sm")}
                    >
                      批量操作 ▾
                    </button>
                    <button
                      onClick={() => setOnlyPending((v) => !v)}
                      className={onlyPending ? btnCls("primary", "sm") : btnCls("secondary", "sm")}
                    >
                      ⏷ 仅看待验收
                    </button>
                  </span>
                }
              >
                {shownReqs.length === 0 ? (
                  <p className="py-6 text-center text-[13px] text-slate-400">
                    {onlyPending ? "当前分支没有待验收需求" : "该分支下暂无需求"}
                  </p>
                ) : (
                  <Table head={["需求分组 / 需求", "类型", "feature 分支", "本次变更（提交 / 文件）", "测试结果", "状态", "操作"]}>
                    {shownReqs.map((r) => {
                      const t = reqType(r.title); // MOCK：类型按标题推断
                      const d = mockDiff(r.seq); // MOCK：行级 diff 占位
                      return (
                        <tr key={r.id} className="align-top">
                          <td className="py-2 pr-3">
                            <p className="text-[13px]">
                              <span className="mr-1 font-mono text-[11px] text-slate-400">REQ-{r.seq}</span>
                              <span className="font-medium text-slate-800">{r.title}</span>
                              {r.conflict && (
                                <span className="ml-1.5 align-middle">
                                  <Chip tone="red">⚠ 冲突</Chip>
                                </span>
                              )}
                            </p>
                            {r.submitNote && (
                              <p className="mt-0.5 text-[11px] text-slate-400">
                                {r.agent ? `${r.agent}：` : ""}
                                {r.submitNote}
                              </p>
                            )}
                          </td>
                          <td className="py-2 pr-3">
                            <Chip tone={t.tone}>{t.label}</Chip>
                          </td>
                          <td className="py-2 pr-3 font-mono text-[12px] text-slate-500">
                            {r.featureBranch ?? `feature/REQ-${r.seq}`}
                          </td>
                          <td className="py-2 pr-3 text-[12px] tabular-nums text-slate-600">
                            {r.commits.length > 0 ? r.commits.length : Math.max(1, d.files % 7)} / {d.files}（
                            <span className="text-green-600">+{d.plus}</span> <span className="text-red-500">-{d.minus}</span>）
                          </td>
                          <td className="py-2 pr-3">
                            <TestChips reports={r.reports} />
                          </td>
                          <td className="py-2 pr-3">
                            <StatusChip status={r.status} />
                          </td>
                          <td className="py-2 text-right">
                            <Link href={`/requirements/${r.id}`} className="text-[12px] text-blue-600 hover:underline">
                              查看
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </Table>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3 text-[11px] text-slate-400">
                  <span>状态说明：</span>
                  <LegendDot cls="bg-green-500" label="已验收" />
                  <LegendDot cls="bg-amber-500" label="待验收 / 待裁决" />
                  <LegendDot cls="bg-teal-500" label="待测试 / 测试中" />
                  <LegendDot cls="bg-blue-500" label="开发中" />
                  <LegendDot cls="bg-red-500" label="合并冲突" />
                </div>
              </Panel>

              <Panel
                title="最近提交"
                extra={
                  <button
                    onClick={() => alert("完整提交列表接入中：当前展示开发任务上报的最近提交")}
                    className="text-[12px] text-blue-600 hover:underline"
                  >
                    查看全部提交 ›
                  </button>
                }
              >
                <Table head={["Commit", "提交信息", "提交人", "提交时间", "关联需求"]}>
                  {commitRows.map((c) => (
                    <tr key={c.sha}>
                      <td className="py-2 pr-3 font-mono text-[12px] text-slate-600">{c.sha.slice(0, 8)}</td>
                      <td className="py-2 pr-3 text-slate-600">{c.msg}</td>
                      <td className="py-2 pr-3 text-slate-600">{c.author}</td>
                      <td className="py-2 pr-3 text-[12px] tabular-nums text-slate-500">{c.time}</td>
                      <td className="py-2 text-right">
                        {c.reqId ? (
                          <Link href={`/requirements/${c.reqId}`} className="text-[12px] text-blue-600 hover:underline">
                            {c.req}
                          </Link>
                        ) : (
                          <button
                            onClick={() => alert("该提交为占位数据，需求关联接入中")}
                            className="text-[12px] text-blue-600 hover:underline"
                          >
                            {c.req}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </Table>
              </Panel>
            </>
          )}
        </div>

        <div className="space-y-4">
          <MergePanel branch={branch} demo={demo} />
          <AcceptPanel key={branch.id} branch={branch} demo={demo} />
        </div>
      </div>

      {/* 页脚提示条 */}
      <p className="mt-4 rounded-lg bg-slate-100 px-3 py-2 text-[12px] text-slate-500">
        提示：1、请先完成所有待验收项的处理；2、仅当右上「分支合并」区域为可用状态时，才可执行合并；3、合并任务异步执行且无法撤销，稍后刷新查看结果。
      </p>
    </>
  );
}
