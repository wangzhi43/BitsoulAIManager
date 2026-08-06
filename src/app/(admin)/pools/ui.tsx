"use client";

// 项目执行中心：严格复现 docs/ui_design/n2YduMmHJzBQ445A.png
// 顶栏 + 筛选条 + 7 格统计行 + 五列看板 + 右侧详情抽屉
// 数据优先取真实字段，缺失时回退下方 MOCK 常量

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageShell, PageHeader, Panel, Chip, btnCls } from "@/components/ui";
import { PriorityChip, StatusChip, STATUS_LABEL } from "@/components/status";

export interface BoardCard {
  id: string;
  seq: number;
  title: string;
  status: string;
  project: string | null;
  priority: string | null;
  locked: boolean;
  reason: string | null;
  complexity: string;
  rank: number | null;
  featureBranch: string | null;
  userStory: string;
  createdBy: string | null;
  createdAt: string | null;
  devAgent: string | null;
  testAgent: string | null;
  agent: string | null;
  heartbeatAgo: string | null;
  timedOutHours: number | null;
  claimedAt: string | null;
  submittedAt: string | null;
  submitNote: string | null;
  commits: string[];
  conflict: boolean;
  caseCount: number | null;
  passRate: number | null;
  conclusion: string | null;
  defectCount: number;
  events: { fromStatus: string | null; toStatus: string; actor: string; note: string | null; at: string }[];
}

// MOCK 数据:真实链路未接入时的界面填充,后续替换
const MOCK = {
  deltaYesterday: "较昨日 +9",
  readyP0: 6,
  devTimeout: 2,
  testBlocked: 3,
  failRate: "18%",
  acceptOverdue: 4,
  riskConflict: 1,
  suggestAgents: ["Planner-01", "Coder-02", "Coder-03"],
  execAgents: ["Coder-01", "Coder-04", "Coder-02"],
  testAgents: ["Tester-01", "Tester-02", "Tester-03"],
  heartbeats: ["1 分钟前", "2 分钟前", "30 秒前"],
  progress: [60, 35, 80],
  passRates: [1, 0.85, 0.93, 0.7, 0.98],
  commits: ["a1b2c3d", "d4e5f6a", "f7g8h9i", "9f8e7d6"],
  builds: ["#1842", "#1838", "#1831", "#1849"],
  deps: [2, 0, 1],
  caseCounts: [8, 14, 21, 6],
  defectCounts: [2, 1, 3, 0],
  footCounts: [
    [2, 3],
    [1, 2],
    [3, 4],
    [0, 1],
    [2, 1],
  ],
  estimateDays: 5,
  dueAt: "05-30 18:00",
  startAt: "05-28 09:15",
  createdBy: "李四",
  createdAt: "05-24 10:30",
  buildStatus: "构建成功",
  userStory: "支持接入微信、企业微信、网页、App 等渠道，统一消息格式与鉴权。",
  riskLevel: "高风险",
  blockReason: "第三方 SDK 鉴权接口限流",
  depsUnfinished: "2 项未完成",
  bellCount: 12,
  currentUser: "张三",
};

// MOCK 数据:库中尚无需求时整板回退展示的示例卡片(真实需求出现后自动切换),后续替换
const mockCard = (o: Partial<BoardCard> & { id: string; seq: number; title: string; status: string }): BoardCard => ({
  project: "示例项目",
  priority: "P1",
  locked: false,
  reason: null,
  complexity: "M",
  rank: null,
  featureBranch: null,
  userStory: MOCK.userStory,
  createdBy: null,
  createdAt: null,
  devAgent: null,
  testAgent: null,
  agent: null,
  heartbeatAgo: null,
  timedOutHours: null,
  claimedAt: null,
  submittedAt: null,
  submitNote: null,
  commits: [],
  conflict: false,
  caseCount: null,
  passRate: null,
  conclusion: null,
  defectCount: 0,
  events: [],
  ...o,
});
const MOCK_BOARD: BoardCard[] = [
  mockCard({ id: "mock-1", seq: 1024, title: "用户登录流程优化", status: "READY", priority: "P0", featureBranch: "feature/login-opt" }),
  mockCard({ id: "mock-2", seq: 1031, title: "会话消息持久化", status: "READY", complexity: "S", featureBranch: "feature/msg-persist" }),
  mockCard({ id: "mock-3", seq: 1040, title: "知识库热词推荐", status: "READY", priority: "P2", featureBranch: "feature/hot-words" }),
  mockCard({ id: "mock-4", seq: 1007, title: "多渠道接入适配", status: "DEVELOPING", priority: "P0", complexity: "L", devAgent: "Coder-01", heartbeatAgo: "1 分钟前", featureBranch: "feature/multi-channel", timedOutHours: 2 }),
  mockCard({ id: "mock-5", seq: 1011, title: "用户资料权限控制", status: "DEVELOPING", devAgent: "Coder-04", heartbeatAgo: "2 分钟前", featureBranch: "feature/auth-control" }),
  mockCard({ id: "mock-6", seq: 1022, title: "消息未读数统计", status: "DEVELOPING", priority: "P2", complexity: "S", devAgent: "Coder-02", heartbeatAgo: "30 秒前", featureBranch: "feature/unread-count" }),
  mockCard({ id: "mock-7", seq: 1003, title: "会话转人工功能", status: "PENDING_TEST", featureBranch: "feature/transfer-human", commits: ["a1b2c3d"] }),
  mockCard({ id: "mock-8", seq: 1015, title: "文件上传与预览", status: "PENDING_TEST", complexity: "S", featureBranch: "feature/file-preview", commits: ["d4e5f6a"] }),
  mockCard({ id: "mock-9", seq: 1001, title: "登录验证码", status: "TESTING", priority: "P0", testAgent: "Tester-01", heartbeatAgo: "1 分钟前", featureBranch: "feature/login-code", passRate: 0.85, caseCount: 21, defectCount: 2 }),
  mockCard({ id: "mock-10", seq: 1008, title: "会话列表分页优化", status: "TESTING", testAgent: "Tester-02", heartbeatAgo: "2 分钟前", featureBranch: "feature/session-page", passRate: 0.93, caseCount: 14, defectCount: 1 }),
  mockCard({ id: "mock-11", seq: 998, title: "工作台首页概览", status: "PENDING_ACCEPT", priority: "P0", complexity: "L", testAgent: "Tester-01", passRate: 1, caseCount: 18 }),
  mockCard({ id: "mock-12", seq: 1018, title: "自定义菜单管理", status: "PENDING_ACCEPT", priority: "P2", complexity: "S", testAgent: "Tester-03", passRate: 1, caseCount: 20, featureBranch: "feature/menu-manage" }),
];

/** 按 seq 稳定取 mock，避免 SSR/客户端不一致 */
function pick<T>(arr: T[], seq: number): T {
  return arr[seq % arr.length];
}

/** 无后端支撑的按钮统一降级 */
function notReady() {
  alert("该功能接入中，敬请期待");
}

const COLUMNS: { key: string; label: string; bar: string; statuses: string[] }[] = [
  { key: "READY", label: "待开发", bar: "bg-slate-400", statuses: ["READY"] },
  { key: "DEVELOPING", label: "开发中", bar: "bg-blue-500", statuses: ["DEVELOPING"] },
  { key: "PENDING_TEST", label: "待测试", bar: "bg-amber-400", statuses: ["PENDING_TEST"] },
  { key: "TESTING", label: "测试中", bar: "bg-violet-500", statuses: ["TESTING", "REVIEWING"] },
  { key: "PENDING_ACCEPT", label: "待验收", bar: "bg-green-500", statuses: ["PENDING_ACCEPT"] },
];

// 复杂度存储为 S/M/L（小/中/大），界面按参考图展示为 L/M/H
const CPLX_DISPLAY: Record<string, string> = { S: "L", M: "M", L: "H" };
const CPLX_TONE: Record<string, "green" | "amber" | "red"> = { S: "green", M: "amber", L: "red" };

// 紧急度徽标（参考图 高/中/低），由优先级推导
const URGENCY: Record<string, { label: string; tone: "red" | "amber" | "slate" }> = {
  P0: { label: "高", tone: "red" },
  P1: { label: "中", tone: "amber" },
  P2: { label: "低", tone: "slate" },
  P3: { label: "低", tone: "slate" },
};

const selectCls =
  "rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-[12px] text-slate-700 outline-none focus:border-blue-400";

function uniq(list: (string | null)[]): string[] {
  return [...new Set(list.filter((x): x is string => !!x))].sort();
}

function AgentRow({ label, name, heartbeat, timedOut }: { label: string; name: string; heartbeat?: string | null; timedOut?: boolean }) {
  return (
    <div className="mt-1.5 flex items-center gap-1.5 text-[12px] text-slate-600">
      <span className="text-[11px] text-slate-400">{label}</span>
      <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[10px]">🤖</span>
      <span className="truncate">{name}</span>
      {heartbeat && (
        <span className={`inline-flex items-center gap-1 text-[11px] ${timedOut ? "text-red-500" : "text-green-600"}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${timedOut ? "bg-red-500" : "bg-green-500"}`} />
          心跳 {heartbeat}
        </span>
      )}
    </div>
  );
}

function ProgressBar({ pct, tone = "blue", label = "进度" }: { pct: number; tone?: "blue" | "red" | "green"; label?: string }) {
  const bar = { blue: "bg-blue-500", red: "bg-red-500", green: "bg-green-500" }[tone];
  const text = { blue: "text-slate-500", red: "text-red-500", green: "text-green-600" }[tone];
  return (
    <div className="mt-1.5">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-slate-400">{label}</span>
        <span className={`tabular-nums ${text}`}>{pct}%</span>
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-slate-100">
        <div className={`h-1.5 rounded-full ${bar}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** 优先级调整 + 锁定（沿用原任务池能力，调用 /api/admin/requirements/:id/priority） */
function PriorityControls({ id, priority, locked }: { id: string; priority: string | null; locked: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function set(body: { priority?: string; locked?: boolean }) {
    setBusy(true);
    const res = await fetch(`/api/admin/requirements/${id}/priority`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) alert("操作失败");
    else router.refresh();
    setBusy(false);
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {(["P0", "P1", "P2", "P3"] as const).map((p) => (
        <button
          key={p}
          disabled={busy}
          onClick={() => set({ priority: p })}
          className={`rounded px-2 py-0.5 text-[12px] font-medium transition-colors disabled:opacity-50 ${
            priority === p ? "bg-blue-600 text-white" : "border border-slate-300 text-slate-500 hover:bg-slate-50"
          }`}
        >
          {p}
        </button>
      ))}
      <button
        disabled={busy}
        onClick={() => set({ locked: !locked })}
        className={`ml-1 rounded px-2 py-0.5 text-[12px] font-medium transition-colors disabled:opacity-50 ${
          locked ? "bg-amber-100 text-amber-700" : "border border-slate-300 text-slate-500 hover:bg-slate-50"
        }`}
        title={locked ? "已锁定，项管 Agent 不会改动" : "锁定后项管 Agent 不再改动优先级"}
      >
        {locked ? "🔒 已锁定" : "锁定"}
      </button>
    </div>
  );
}

/** 卡片展示字段：真实数据优先，缺失回退 MOCK */
function cardView(card: BoardCard) {
  const inTest = card.status === "PENDING_TEST" || card.status === "TESTING" || card.status === "REVIEWING";
  const agentLabel = card.status === "READY" ? "建议 Agent" : inTest ? "测试 Agent" : "执行 Agent";
  const agent =
    card.agent ??
    (card.status === "READY"
      ? pick(MOCK.suggestAgents, card.seq)
      : inTest
        ? pick(MOCK.testAgents, card.seq)
        : pick(MOCK.execAgents, card.seq));
  const heartbeat = card.status === "READY" ? null : card.heartbeatAgo ?? pick(MOCK.heartbeats, card.seq);
  const branch = card.featureBranch ?? `feature/REQ-${card.seq}`;
  const progress = pick(MOCK.progress, card.seq); // 进度暂无真实字段，MOCK 填充
  const passRate = card.passRate ?? pick(MOCK.passRates, card.seq);
  const commit = card.commits.length > 0 ? card.commits[card.commits.length - 1].slice(0, 7) : pick(MOCK.commits, card.seq);
  const build = pick(MOCK.builds, card.seq); // 构建号暂无真实字段，MOCK 填充
  const deps = pick(MOCK.deps, card.seq);
  const caseCount = card.caseCount ?? pick(MOCK.caseCounts, card.seq);
  const defectCount = card.defectCount > 0 ? card.defectCount : pick(MOCK.defectCounts, card.seq);
  const foot = [
    card.events.length > 0 ? card.events.length : pick(MOCK.footCounts, card.seq)[0],
    card.commits.length > 0 ? card.commits.length : pick(MOCK.footCounts, card.seq)[1],
  ];
  return { agentLabel, agent, heartbeat, branch, progress, passRate, commit, build, deps, caseCount, defectCount, foot };
}

function Card({ card, active, onSelect }: { card: BoardCard; active: boolean; onSelect: () => void }) {
  const v = cardView(card);
  const urgency = URGENCY[card.priority ?? "P2"];
  const lowPass = card.conclusion === "FAIL" || v.passRate < 0.9;
  return (
    <button
      onClick={onSelect}
      className={`w-full rounded-xl border bg-white p-3 text-left shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors ${
        active ? "border-blue-400" : "border-slate-200 hover:border-blue-300"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] text-slate-400">
          REQ-{card.seq}
          {card.locked && <span title="优先级已锁定"> 🔒</span>}
        </span>
        <span className="flex items-center gap-1">
          {card.timedOutHours != null && (
            <span className="rounded bg-red-500 px-1.5 py-0.5 text-[10px] font-medium text-white">超时 {card.timedOutHours}h</span>
          )}
          {card.conflict && <Chip tone="red">冲突</Chip>}
          {card.status === "REVIEWING" && <StatusChip status="REVIEWING" />}
        </span>
      </div>

      <p className="mt-1 line-clamp-2 text-[13px] font-semibold leading-snug text-slate-800">{card.title}</p>

      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <PriorityChip priority={card.priority ?? "P2"} />
        <Chip tone={urgency.tone}>{urgency.label}</Chip>
        <Chip tone={CPLX_TONE[card.complexity] ?? "amber"}>复杂度 {CPLX_DISPLAY[card.complexity] ?? card.complexity}</Chip>
      </div>

      <AgentRow label={v.agentLabel} name={v.agent} heartbeat={v.heartbeat} timedOut={card.timedOutHours != null} />

      <p className="mt-1.5 truncate font-mono text-[11px] text-blue-600">⎇ {v.branch}</p>

      {card.status === "DEVELOPING" && <ProgressBar pct={v.progress} tone="blue" label="进度" />}

      {card.status === "PENDING_TEST" && (
        <div className="mt-1.5 space-y-0.5 text-[11px] text-slate-500">
          <p>
            提交 <span className="font-mono text-slate-600">{v.commit}</span>
            <span className="ml-2">
              构建 <span className="font-mono text-slate-600">{v.build}</span>
            </span>
          </p>
          <p>
            依赖 <span className={`tabular-nums ${v.deps > 0 ? "text-amber-600" : ""}`}>{v.deps} 项</span>
          </p>
        </div>
      )}

      {(card.status === "TESTING" || card.status === "REVIEWING" || card.status === "PENDING_ACCEPT") && (
        <>
          <ProgressBar pct={Math.round(v.passRate * 100)} tone={lowPass ? "red" : "green"} label="测试通过率" />
          {card.status !== "PENDING_ACCEPT" && (
            <p className="mt-1 text-[11px] text-slate-500">
              缺陷 <span className={`tabular-nums ${v.defectCount > 0 ? "text-red-500" : ""}`}>{v.defectCount}</span>
              <span className="ml-2">
                用例 <span className="tabular-nums">{v.caseCount}</span>
              </span>
            </p>
          )}
        </>
      )}

      <div className="mt-2 flex items-center gap-3 text-[11px] tabular-nums text-slate-400">
        <span>🕒 {v.foot[0]}</span>
        <span>📋 {v.foot[1]}</span>
      </div>
    </button>
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1">
      <dt className="shrink-0 text-[12px] text-slate-400">{label}</dt>
      <dd className="min-w-0 text-right text-[12px] text-slate-700">{children}</dd>
    </div>
  );
}

function Drawer({ card, onClose }: { card: BoardCard; onClose: () => void }) {
  const [tab, setTab] = useState<"detail" | "relation" | "activity" | "ai">("detail");
  // MOCK 卡片(空库回退)没有真实需求记录:详情跳转与优先级 API 降级为提示
  const isMock = card.id.startsWith("mock-");
  const v = cardView(card);
  const lowPass = card.conclusion === "FAIL" || v.passRate < 0.9;
  const showTest = card.status === "TESTING" || card.status === "REVIEWING" || card.status === "PENDING_ACCEPT";

  return (
    <>
      <div className="fixed inset-0 z-30 bg-slate-900/20" onClick={onClose} />
      <aside className="fixed inset-y-0 right-0 z-40 flex w-full flex-col bg-white shadow-xl sm:w-[380px]">
        {/* 头部 */}
        <div className="border-b border-slate-100 p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[13px] font-semibold text-slate-800">REQ-{card.seq}</span>
              <PriorityChip priority={card.priority ?? "P2"} />
              <StatusChip status={card.status} />
            </div>
            <div className="flex items-center gap-1">
              <button onClick={notReady} className={btnCls("ghost", "sm")} title="更多">
                ⋯
              </button>
              <button onClick={onClose} className={btnCls("ghost", "sm")} aria-label="关闭">
                ✕
              </button>
            </div>
          </div>
          <h2 className="mt-2 text-[15px] font-semibold leading-snug text-slate-800">{card.title}</h2>
          <p className="mt-1 flex items-center gap-3 text-[12px] text-slate-400">
            <span>◔ 复杂度 {CPLX_DISPLAY[card.complexity] ?? card.complexity}</span>
            <span>🕒 预估 {MOCK.estimateDays} 人日</span>
          </p>
          <div className="mt-3 flex gap-1">
            {(
              [
                ["detail", "详情"],
                ["relation", "关联"],
                ["activity", "动态"],
                ["ai", "AI 分析"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`rounded-lg px-3 py-1 text-[12px] font-medium transition-colors ${
                  tab === k ? "bg-blue-50 text-blue-600" : "text-slate-500 hover:bg-slate-100"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* 内容 */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {tab === "detail" && (
            <div className="space-y-4">
              <section>
                <h3 className="mb-1 text-[12px] font-semibold text-slate-800">基本信息</h3>
                <p className="mb-2 rounded-lg bg-slate-50 p-2.5 text-[12px] leading-relaxed text-slate-600">
                  {card.userStory || MOCK.userStory}
                </p>
                <dl className="divide-y divide-slate-50">
                  <InfoRow label="创建人">{card.createdBy ?? MOCK.createdBy}</InfoRow>
                  <InfoRow label="创建时间">{card.createdAt ?? MOCK.createdAt}</InfoRow>
                  <InfoRow label="执行 Agent">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-blue-100 text-[10px]">🤖</span>
                      {v.agent}
                    </span>
                  </InfoRow>
                  <InfoRow label="心跳">
                    <span className={card.timedOutHours != null ? "text-red-500" : "text-green-600"}>
                      {v.heartbeat ?? pick(MOCK.heartbeats, card.seq)}
                    </span>
                  </InfoRow>
                  <InfoRow label="开始时间">{card.claimedAt ?? MOCK.startAt}</InfoRow>
                  <InfoRow label="预计完成">{MOCK.dueAt}</InfoRow>
                  <InfoRow label="进度">
                    <span className="inline-flex w-36 items-center gap-2">
                      <span className="h-1.5 flex-1 rounded-full bg-slate-100">
                        <span className="block h-1.5 rounded-full bg-blue-500" style={{ width: `${v.progress}%` }} />
                      </span>
                      <span className="tabular-nums">{v.progress}%</span>
                    </span>
                  </InfoRow>
                  <InfoRow label="分支">
                    <span className="break-all font-mono text-[11px] text-blue-600">{v.branch}</span>
                  </InfoRow>
                  <InfoRow label="最新提交">
                    <span className="font-mono text-[11px] text-slate-600">{v.commit}</span>
                  </InfoRow>
                  <InfoRow label="构建状态">
                    <span className="text-green-600">
                      ✓ {MOCK.buildStatus} <span className="font-mono text-[11px]">{v.build}</span>
                    </span>
                  </InfoRow>
                  {showTest && (
                    <InfoRow label="测试通过率">
                      <span className={`tabular-nums ${lowPass ? "text-red-500" : "text-green-600"}`}>
                        {Math.round(v.passRate * 100)}%
                      </span>
                    </InfoRow>
                  )}
                </dl>
              </section>

              <section>
                <h3 className="mb-1.5 text-[12px] font-semibold text-slate-800">优先级</h3>
                {isMock ? (
                  <p className="text-[12px] text-slate-400">示例数据，接入真实需求后可调整优先级</p>
                ) : (
                  <PriorityControls id={card.id} priority={card.priority} locked={card.locked} />
                )}
                {card.reason && <p className="mt-1.5 text-[11px] text-slate-400">{card.reason}</p>}
              </section>

              <section>
                <h3 className="mb-1.5 text-[12px] font-semibold text-slate-800">风险与阻塞</h3>
                <dl className="divide-y divide-slate-50">
                  <InfoRow label="风险等级">
                    <span className="text-red-500">⚠ {MOCK.riskLevel}</span>
                  </InfoRow>
                  <InfoRow label="阻塞原因">
                    {card.conflict ? "合并冲突，需人工处理" : card.timedOutHours != null ? `心跳超时 ${card.timedOutHours} 小时` : MOCK.blockReason}
                  </InfoRow>
                  <InfoRow label="依赖项">
                    <span className="text-amber-600">{MOCK.depsUnfinished}</span>
                  </InfoRow>
                </dl>
              </section>
            </div>
          )}

          {tab === "relation" && (
            <div className="space-y-4">
              <section>
                <h3 className="mb-1.5 text-[12px] font-semibold text-slate-800">分支与提交</h3>
                <p className="break-all font-mono text-[11px] text-blue-600">⎇ {v.branch}</p>
                {card.commits.length > 0 ? (
                  <ul className="mt-2 space-y-1">
                    {card.commits.map((c) => (
                      <li key={c} className="font-mono text-[11px] text-slate-500">
                        {c.slice(0, 12)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 font-mono text-[11px] text-slate-500">{v.commit}</p>
                )}
                {card.submitNote && (
                  <p className="mt-2 rounded-lg bg-slate-50 p-2.5 text-[12px] text-slate-600">{card.submitNote}</p>
                )}
              </section>
              <section>
                <h3 className="mb-1.5 text-[12px] font-semibold text-slate-800">测试与缺陷</h3>
                <dl className="divide-y divide-slate-50">
                  <InfoRow label="测试用例">{v.caseCount} 条</InfoRow>
                  <InfoRow label="测试 Agent">{card.testAgent ?? pick(MOCK.testAgents, card.seq)}</InfoRow>
                  <InfoRow label="开发 Agent">{card.devAgent ?? pick(MOCK.execAgents, card.seq)}</InfoRow>
                  <InfoRow label="关联缺陷">
                    <span className={v.defectCount > 0 ? "text-red-500" : ""}>{v.defectCount} 个</span>
                  </InfoRow>
                </dl>
              </section>
            </div>
          )}

          {tab === "activity" &&
            (card.events.length > 0 ? (
              <ul className="space-y-3">
                {card.events.map((e, i) => (
                  <li key={i} className="text-[12px]">
                    <p className="flex items-center gap-2">
                      <span className="tabular-nums text-slate-400">{e.at}</span>
                      <span className="text-slate-700">
                        {e.fromStatus ? `${STATUS_LABEL[e.fromStatus] ?? e.fromStatus} → ` : ""}
                        {STATUS_LABEL[e.toStatus] ?? e.toStatus}
                      </span>
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      {e.actor}
                      {e.note ? ` · ${e.note}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-8 text-center text-[12px] text-slate-400">数据接入中</p>
            ))}

          {tab === "ai" && <p className="py-8 text-center text-[12px] text-slate-400">数据接入中</p>}
        </div>

        {/* 操作区 */}
        <div className="space-y-2 border-t border-slate-100 p-4">
          <div className="flex items-center gap-2">
            {isMock ? (
              <button onClick={() => alert("示例数据，接入真实需求后可打开详情")} className={`${btnCls("primary", "sm")} flex-1`}>
                打开详情
              </button>
            ) : (
              <Link href={`/requirements/${card.id}`} className={`${btnCls("primary", "sm")} flex-1`}>
                打开详情
              </Link>
            )}
            <Link href="/agents" className={`${btnCls("secondary", "sm")} flex-1`}>
              查看 Agent
            </Link>
            <button onClick={notReady} className={`${btnCls("secondary", "sm")} flex-1`}>
              释放/转派
            </button>
          </div>
          <button onClick={notReady} className={`${btnCls("danger", "sm")} w-full`}>
            标记阻塞
          </button>
        </div>
      </aside>
    </>
  );
}

export function Board({ cards: realCards }: { cards: BoardCard[] }) {
  // MOCK 回退:库中尚无需求时用示例卡片填满看板(真实需求出现后自动切换)
  const isMockBoard = realCards.length === 0;
  const cards = isMockBoard ? MOCK_BOARD : realCards;
  const router = useRouter();
  const [q, setQ] = useState("");
  const [project, setProject] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [complexity, setComplexity] = useState("");
  const [agent, setAgent] = useState("");
  const [branchType, setBranchType] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const projects = useMemo(() => uniq(cards.map((c) => c.project)), [cards]);
  const agents = useMemo(() => uniq(cards.flatMap((c) => [c.devAgent, c.testAgent])), [cards]);

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return cards.filter(
      (c) =>
        (!kw || c.title.toLowerCase().includes(kw) || `req-${c.seq}`.includes(kw) || String(c.seq).includes(kw)) &&
        (!project || c.project === project) &&
        (!status || c.status === status) &&
        (!priority || c.priority === priority) &&
        (!complexity || c.complexity === complexity) &&
        (!agent || c.devAgent === agent || c.testAgent === agent) &&
        (!branchType || (c.featureBranch ?? `feature/REQ-${c.seq}`).startsWith(branchType)),
    );
  }, [cards, q, project, status, priority, complexity, agent, branchType]);

  const selected = selectedId ? cards.find((c) => c.id === selectedId) ?? null : null;

  const colCards = (key: string) => {
    const col = COLUMNS.find((c) => c.key === key)!;
    return filtered.filter((c) => col.statuses.includes(c.status));
  };
  const ready = colCards("READY");
  const developing = colCards("DEVELOPING");
  const pendingTest = colCards("PENDING_TEST");
  const testing = colCards("TESTING");
  const pendingAccept = colCards("PENDING_ACCEPT");
  const timeouts = filtered.filter((c) => c.timedOutHours != null).length;
  const conflicts = filtered.filter((c) => c.conflict).length;
  const readyP0 = ready.filter((c) => c.priority === "P0").length;
  const withReport = testing.filter((c) => c.passRate != null);
  const realFailRate =
    withReport.length > 0
      ? `${Math.round((withReport.filter((c) => c.conclusion === "FAIL" || (c.passRate ?? 1) < 0.9).length / withReport.length) * 100)}%`
      : null;

  // 统计行：真实计数优先，告警小字缺数据时回退 MOCK
  const stats: { label: string; value: React.ReactNode; sub: React.ReactNode }[] = [
    { label: "需求总数", value: filtered.length, sub: <span className="text-slate-400">{MOCK.deltaYesterday}</span> },
    { label: "待开发", value: ready.length, sub: <span className="text-red-500">P0 {readyP0 || MOCK.readyP0}</span> },
    { label: "开发中", value: developing.length, sub: <span className="text-red-500">超时 {timeouts || MOCK.devTimeout}</span> },
    { label: "待测试", value: pendingTest.length, sub: <span className="text-red-500">阻塞 {MOCK.testBlocked}</span> },
    { label: "测试中", value: testing.length, sub: <span className="text-red-500">失败率 {realFailRate ?? MOCK.failRate}</span> },
    { label: "待验收", value: pendingAccept.length, sub: <span className="text-red-500">逾期 {MOCK.acceptOverdue}</span> },
    {
      label: "风险总览",
      value: (
        <span className="flex items-center gap-3 text-[15px]">
          <span className="text-red-500">🕒 {timeouts || MOCK.devTimeout}</span>
          <span className="text-amber-600">⛔ {MOCK.testBlocked}</span>
          <span className="text-red-500">⚠ {conflicts || MOCK.riskConflict}</span>
        </span>
      ),
      sub: <span className="text-slate-400">超时 · 阻塞 · 冲突</span>,
    },
  ];

  return (
    <PageShell>
      <PageHeader
        title="项目执行中心"
        subtitle="看板与任务池"
        actions={
          <>
            <div className="relative hidden md:block">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="搜索需求 ID / 标题 / 关键字"
                className="w-64 rounded-lg border border-slate-300 bg-white py-1.5 pl-3 pr-10 text-[12px] text-slate-700 outline-none placeholder:text-slate-400 focus:border-blue-400 lg:w-80"
              />
              <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-slate-200 bg-slate-50 px-1 text-[10px] text-slate-400">
                ⌘K
              </kbd>
            </div>
            <button onClick={notReady} className={btnCls("ghost", "sm")}>
              ✦ AI 助手
            </button>
            <button onClick={notReady} className={`${btnCls("ghost", "sm")} relative`} title="通知">
              🔔
              <span className="absolute -right-0.5 -top-0.5 rounded-full bg-red-500 px-1 text-[9px] font-medium leading-3 text-white tabular-nums">
                {MOCK.bellCount}
              </span>
            </button>
            <button onClick={notReady} className={btnCls("ghost", "sm")} title="帮助">
              ?
            </button>
            <button
              onClick={notReady}
              className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-[12px] font-semibold text-white"
              title={MOCK.currentUser}
            >
              {MOCK.currentUser.slice(0, 1)}
            </button>
          </>
        }
      />

      {/* 移动端搜索框 */}
      <div className="mb-3 md:hidden">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜索需求 ID / 标题 / 关键字"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[12px] text-slate-700 outline-none placeholder:text-slate-400 focus:border-blue-400"
        />
      </div>

      {/* 筛选条 */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {/* 项目切换（参考图左上深色块） */}
        <select
          value={project}
          onChange={(e) => setProject(e.target.value)}
          className="rounded-lg bg-slate-900 px-2.5 py-1.5 text-[12px] font-medium text-white outline-none"
        >
          <option value="">全部项目</option>
          {projects.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={selectCls}>
          <option value="">状态</option>
          {COLUMNS.flatMap((c) => c.statuses).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s] ?? s}
            </option>
          ))}
        </select>
        <select value={priority} onChange={(e) => setPriority(e.target.value)} className={selectCls}>
          <option value="">优先级</option>
          {["P0", "P1", "P2", "P3"].map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select value={complexity} onChange={(e) => setComplexity(e.target.value)} className={selectCls}>
          <option value="">复杂度</option>
          {["L", "M", "S"].map((c) => (
            <option key={c} value={c}>
              {CPLX_DISPLAY[c]}（{c}）
            </option>
          ))}
        </select>
        <select value={agent} onChange={(e) => setAgent(e.target.value)} className={selectCls}>
          <option value="">Agent</option>
          {agents.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <select value={branchType} onChange={(e) => setBranchType(e.target.value)} className={selectCls}>
          <option value="">分支类型</option>
          <option value="feature/">feature</option>
          <option value="daily/">daily</option>
        </select>
        <button onClick={notReady} className={btnCls("secondary", "sm")}>
          更多筛选 ⚙
        </button>

        <span className="ml-auto flex flex-wrap items-center gap-2">
          <label className="flex cursor-pointer items-center gap-1.5 text-[12px] text-slate-600">
            <input type="checkbox" checked={false} onChange={notReady} className="rounded border-slate-300" />
            仅看我负责
          </label>
          <button onClick={notReady} className={btnCls("secondary", "sm")}>
            ☰ 视图设置
          </button>
          <button onClick={notReady} className={btnCls("primary", "sm")}>
            ✦ AI 重排
          </button>
          <button onClick={() => router.refresh()} className={btnCls("ghost", "sm")} title="刷新">
            ↻
          </button>
          <button onClick={notReady} className={btnCls("ghost", "sm")} title="更多">
            ⋯
          </button>
        </span>
      </div>

      {/* 统计行（7 格） */}
      <Panel pad={false} className="mb-4">
        <div className="grid grid-cols-2 divide-slate-100 sm:grid-cols-4 xl:grid-cols-7 xl:divide-x">
          {stats.map((s) => (
            <div key={s.label} className="p-4">
              <p className="text-[12px] text-slate-500">{s.label}</p>
              <p className="mt-1 text-[24px] font-bold leading-none tabular-nums tracking-tight text-slate-900">{s.value}</p>
              <p className="mt-1.5 text-[11px]">{s.sub}</p>
            </div>
          ))}
        </div>
      </Panel>

      {/* 看板主体：五列均分满宽(参考图比例),窄屏下限最小列宽横向滚动 */}
      <div className="grid grid-cols-[repeat(5,minmax(250px,1fr))] gap-3 overflow-x-auto pb-2">
        {COLUMNS.map((col) => {
          const list = filtered.filter((c) => col.statuses.includes(c.status));
          return (
            <div key={col.key} className="flex min-w-0 flex-col self-start rounded-xl bg-slate-100/70 p-2">
              <div className="mb-2 flex items-center gap-2 px-1 pt-1">
                <span className={`h-3.5 w-1 rounded-full ${col.bar}`} />
                <span className="text-[13px] font-semibold text-slate-800">{col.label}</span>
                <span className="text-[12px] tabular-nums text-slate-400">{list.length}</span>
                <span className="ml-auto flex items-center">
                  <button onClick={notReady} className="rounded px-1 text-[13px] text-slate-400 hover:bg-slate-200" title="添加需求">
                    ＋
                  </button>
                  <button onClick={notReady} className="rounded px-1 text-[13px] text-slate-400 hover:bg-slate-200" title="更多">
                    ⋯
                  </button>
                </span>
              </div>
              <div className="space-y-2">
                {list.map((card) => (
                  <Card key={card.id} card={card} active={card.id === selectedId} onSelect={() => setSelectedId(card.id)} />
                ))}
                {list.length === 0 && <p className="py-6 text-center text-[11px] text-slate-400">暂无需求</p>}
              </div>
              <button
                onClick={notReady}
                className="mt-2 w-full rounded-lg py-1.5 text-center text-[12px] text-slate-400 hover:bg-slate-200 hover:text-slate-600"
              >
                ＋ 添加需求
              </button>
            </div>
          );
        })}
      </div>

      {selected && <Drawer card={selected} onClose={() => setSelectedId(null)} />}
    </PageShell>
  );
}
