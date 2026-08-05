import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { isDemoMode, DEMO_REQ_DETAIL, DEMO } from "@/lib/demo";
import { PageShell, PageHeader, Panel, Chip } from "@/components/ui";
import { StatusChip, PriorityChip } from "@/components/status";
import { AcceptActions, ManageActions, ClarifyCard, ConfirmActionBar, RefreshButton, TodoAction } from "./ui";

export const dynamic = "force-dynamic";

// 需求详情页：严格按 docs/ui_design/VPQ4C0eC3FBpC4bO.png 布局
// 主列 = 用户故事 / 验收标准 / 复杂度+涉及模块并排 / 原始消息摘要 / 流转时间线
// 右列 = AI 置信信息 / 澄清问题 / 关联需求 / 验收与管理操作 / 交付信息
// 待确认状态追加底部固定操作条（编辑 / 拆开需求 / 合并 / 驳回重拆 / 确认进入待开发）

// MOCK 数据：真实链路未接入时的界面填充，后续替换
// - confidence：数据库无置信度字段，整卡使用 mock
// - estimateDays：无预估人天字段，按复杂度映射
// - modules / clarifications / rawMessage：优先真实数据，为空时回退 mock 保证视觉与参考图一致
const MOCK = {
  confidence: {
    score: 85,
    advice: "需求可确认",
    metrics: [
      { label: "需求完整性", value: 80 },
      { label: "需求清晰度", value: 85 },
      { label: "实现可行性", value: 90 },
    ],
  },
  estimateDays: { S: 1, M: 3, L: 5 } as Record<string, number>,
  modules: ["报表中心", "用户管理"],
  clarifications: [
    { question: "是否需要支持子部门的汇总统计？", answer: null },
    { question: "除了使用时长，是否还需要统计使用次数或其他指标？", answer: null },
  ],
  rawMessage: "我们想看下各个部门的使用时长，现在的报表只能看到整体，没法按部门看，能加个按部门统计的功能吗？",
};

interface Detail {
  id: string;
  seq: number;
  title: string;
  status: string;
  priority: string | null;
  complexity: string;
  moduleGuess: string | null;
  project: string | null;
  projectId: string | null;
  sourceChannel: string;
  userStory: string;
  acceptance: string[];
  clarifications: { question: string; answer: string | null }[];
  featureBranch: string | null;
  dailyBranch: string | null;
  customer: string | null;
  createdAt: Date | null;
  rawMessages: { sender: string; ts: string | null; text: string }[];
  related: { id: string; seq: number; title: string; status: string; kind: "parent" | "defect" }[];
  submitNote: string | null;
  agent: string | null;
  report: { conclusion: string; passRate: number; cases: number } | null;
  events: { at: Date; actor: string; note: string; to: string }[];
}

const COMPLEXITY: Record<string, { label: string; tone: "green" | "amber" | "red" }> = {
  S: { label: "简单", tone: "green" },
  M: { label: "中等", tone: "amber" },
  L: { label: "复杂", tone: "red" },
};

function fmtRawTs(ts: unknown): string | null {
  let date: Date | null = null;
  if (typeof ts === "number") date = new Date(ts < 1e12 ? ts * 1000 : ts);
  else if (typeof ts === "string" && ts) {
    const parsed = new Date(ts);
    if (!Number.isNaN(parsed.getTime())) date = parsed;
  }
  return date ? date.toLocaleString("zh-CN", { hour12: false }) : null;
}

export default async function RequirementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const demo = await isDemoMode();

  let d: Detail;
  let projects: { id: string; name: string }[] = [];
  let mergeCandidates: { id: string; seq: number; title: string }[] = [];

  if (demo) {
    // 展示模式：待确认列表里的示例单展示确认阶段视图，其余复用通用示例详情
    const c = DEMO.confirmItems.find((x) => x.id === id);
    if (c) {
      d = {
        id: c.id,
        seq: c.seq,
        title: c.title,
        status: "PENDING_CONFIRM",
        priority: null,
        complexity: c.complexity,
        moduleGuess: null,
        project: c.projectName,
        projectId: c.projectId,
        sourceChannel: c.source.channel,
        userStory: c.userStory,
        acceptance: c.acceptance,
        clarifications: c.clarifications,
        featureBranch: null,
        dailyBranch: null,
        customer: c.source.customer ?? c.source.sender,
        createdAt: new Date(Date.now() - 2 * 3600_000),
        rawMessages: [],
        related: [],
        submitNote: null,
        agent: null,
        report: null,
        events: [{ at: new Date(Date.now() - 2 * 3600_000), actor: "expert:PRODUCT", note: "自动拆解", to: "PENDING_CONFIRM" }],
      };
    } else {
      d = {
        ...DEMO_REQ_DETAIL,
        id,
        moduleGuess: null,
        projectId: null,
        sourceChannel: "WECHAT",
        createdAt: DEMO_REQ_DETAIL.events[0]?.at ?? null,
        rawMessages: [],
        related: [],
      };
    }
    projects = DEMO.dashboard.projects.map((p) => ({ id: p.id, name: p.name }));
    mergeCandidates = DEMO.confirmItems.filter((x) => x.id !== id).map((x) => ({ id: x.id, seq: x.seq, title: x.title }));
  } else {
    const r = await prisma.requirement.findUnique({
      where: { id },
      include: {
        project: { select: { name: true } },
        source: { select: { customerName: true, senderName: true, channel: true, rawMessages: true } },
        dailyBranch: { select: { name: true } },
        devTask: { select: { submitNote: true, claimedBy: { select: { username: true } } } },
        testTasks: { include: { report: true } },
        events: { orderBy: { createdAt: "asc" } },
        parent: { select: { id: true, seq: true, title: true, status: true } },
        defects: { select: { id: true, seq: true, title: true, status: true } },
      },
    });
    if (!r) notFound();
    const report = r.testTasks.map((t) => t.report).filter(Boolean).at(-1);
    const sender = r.source.senderName ?? r.source.customerName ?? "客户";
    const raw = (r.source.rawMessages as { text?: string; ts?: number | string }[] | null) ?? [];
    d = {
      id: r.id,
      seq: r.seq,
      title: r.title,
      status: r.status,
      priority: r.priority,
      complexity: r.complexity,
      moduleGuess: r.moduleGuess,
      project: r.project?.name ?? null,
      projectId: r.projectId,
      sourceChannel: r.source.channel,
      userStory: r.userStory,
      acceptance: r.acceptance as string[],
      clarifications: (r.clarifications as { question: string; answer: string | null }[] | null) ?? [],
      featureBranch: r.featureBranch,
      dailyBranch: r.dailyBranch?.name ?? null,
      customer: r.source.customerName ?? r.source.senderName,
      createdAt: r.createdAt,
      rawMessages: raw.filter((m) => m.text).map((m) => ({ sender, ts: fmtRawTs(m.ts), text: m.text as string })),
      related: [
        ...(r.parent ? [{ ...r.parent, kind: "parent" as const }] : []),
        ...r.defects.map((x) => ({ ...x, kind: "defect" as const })),
      ],
      submitNote: r.devTask?.submitNote ?? null,
      agent: r.devTask?.claimedBy?.username ?? null,
      report: report
        ? { conclusion: report.conclusion, passRate: report.passRate, cases: (r.testTasks.at(-1)?.cases as unknown[])?.length ?? 0 }
        : null,
      events: r.events.map((e) => ({ at: e.createdAt, actor: e.actor, note: e.note ?? "", to: e.toStatus })),
    };
    if (d.status === "PENDING_CONFIRM") {
      const [dbProjects, pending] = await Promise.all([
        prisma.project.findMany({ where: { active: true }, select: { id: true, name: true } }),
        prisma.requirement.findMany({
          where: { status: "PENDING_CONFIRM", id: { not: id } },
          select: { id: true, seq: true, title: true },
          orderBy: { seq: "asc" },
        }),
      ]);
      projects = dbProjects;
      mergeCandidates = pending;
    }
  }

  const isPendingConfirm = d.status === "PENDING_CONFIRM";
  const backHref = isPendingConfirm ? "/confirm" : "/requirements";
  const backLabel = isPendingConfirm ? "需求确认" : "全部需求";
  const cplx = COMPLEXITY[d.complexity] ?? { label: d.complexity, tone: "amber" as const };
  const estimateDays = MOCK.estimateDays[d.complexity] ?? 3;
  const createdAt = d.createdAt ? new Date(d.createdAt) : new Date();
  // 需求ID 展示格式 REQ-yyyymmdd-xxxx，由创建日期 + seq 拼装
  const reqCode = `REQ-${createdAt.toISOString().slice(0, 10).replace(/-/g, "")}-${String(d.seq).padStart(4, "0")}`;
  const hasDelivery = Boolean(d.featureBranch || d.dailyBranch || d.agent || d.submitNote || d.report);

  // 为空时回退 mock，保证与参考图区块一致
  const modules = d.moduleGuess ? d.moduleGuess.split(/[,，、/|\s]+/).filter(Boolean) : MOCK.modules;
  const clarifyMock = d.clarifications.length === 0;
  const clarifications = clarifyMock ? MOCK.clarifications : d.clarifications;
  const rawMessages =
    d.rawMessages.length > 0
      ? d.rawMessages
      : [
          {
            sender: d.customer ?? "客户",
            ts: createdAt.toLocaleString("zh-CN", { hour12: false }),
            text: MOCK.rawMessage,
          },
        ];

  return (
    <PageShell>
      <PageHeader
        title={
          <span className="flex items-center gap-2 text-[14px] font-normal">
            <Link href={backHref} className="text-slate-400 hover:text-slate-600">
              {backLabel}
            </Link>
            <span className="text-slate-300">/</span>
            <span className="font-semibold text-slate-800">需求详情</span>
          </span>
        }
        actions={
          <>
            <TodoAction label="使用帮助" kind="ghost" />
            <RefreshButton />
          </>
        }
      />

      {/* 标题区：返回 + 大标题 + 元信息行，右上需求 ID 与创建时间 */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div className="min-w-0">
          <Link href={backHref} className="text-[12px] font-medium text-blue-600 hover:underline">
            ← 返回列表
          </Link>
          <h1 className="mt-1.5 text-[22px] font-semibold tracking-tight text-slate-800">{d.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-slate-500">
            <span>
              项目：<span className="text-slate-700">{d.project ?? "未指定"}</span>
            </span>
            <span>
              来源：<span className="text-slate-700">{d.sourceChannel === "WECHAT" ? "微信反馈" : "手动导入"}</span>
            </span>
            <span>
              创建人：<span className="text-slate-700">{d.customer ?? "—"}</span>
            </span>
            <span className="flex items-center gap-1">
              优先级：{d.priority ? <PriorityChip priority={d.priority} /> : <span className="text-slate-400">未定</span>}
            </span>
            <StatusChip status={d.status} />
          </div>
        </div>
        <div className="text-right text-[12px] text-slate-400">
          <p>
            需求ID：<span className="font-mono tabular-nums text-slate-700">{reqCode}</span>
          </p>
          <p className="mt-1">
            创建时间：<span className="tabular-nums text-slate-600">{createdAt.toLocaleString("zh-CN", { hour12: false })}</span>
          </p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        {/* 主列 */}
        <div className="min-w-0 space-y-4">
          <Panel title="用户故事">
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-slate-600">{d.userStory}</p>
          </Panel>

          <Panel title="验收标准">
            {d.acceptance.length > 0 ? (
              <ol className="space-y-2">
                {d.acceptance.map((a, i) => (
                  <li key={i} className="flex gap-2 text-[13px] leading-relaxed text-slate-600">
                    <span className="tabular-nums text-slate-400">{i + 1}.</span>
                    <span>{a}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-[12px] text-slate-400">暂无验收标准</p>
            )}
          </Panel>

          {/* 复杂度 + 涉及模块并排 */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Panel title="复杂度">
              <div className="flex items-center gap-2">
                <Chip tone={cplx.tone}>{cplx.label}</Chip>
              </div>
              <p className="mt-2.5 text-[13px] text-slate-600">
                预估：<span className="tabular-nums">{estimateDays}</span> 人天
              </p>
            </Panel>
            <Panel title="涉及模块">
              <div className="flex flex-wrap gap-1.5">
                {modules.map((m) => (
                  <Chip key={m}>{m}</Chip>
                ))}
              </div>
            </Panel>
          </div>

          <Panel title="原始消息摘要">
            <div className="space-y-2.5">
              {rawMessages.map((m, i) => (
                <blockquote key={i} className="rounded-lg bg-slate-50 p-3">
                  <p className="text-[12px] text-slate-400">
                    {m.sender}
                    {m.ts ? `（${m.ts}）` : ""}：
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-slate-600">{m.text}</p>
                </blockquote>
              ))}
            </div>
          </Panel>

          <Panel title="流转时间线">
            {d.events.length > 0 ? (
              <ol className="relative space-y-3.5 border-l border-slate-200 pl-4">
                {d.events.map((e, i) => (
                  <li key={i} className="relative">
                    <span className="absolute -left-[21.5px] top-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-blue-500" />
                    <p className="text-[13px]">
                      <StatusChip status={e.to} /> <span className="ml-1 text-slate-600">{e.note}</span>
                    </p>
                    <p className="mt-0.5 text-[11px] tabular-nums text-slate-400">
                      {new Date(e.at).toLocaleString("zh-CN", { hour12: false })} · {e.actor}
                    </p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-[12px] text-slate-400">暂无流转记录</p>
            )}
          </Panel>
        </div>

        {/* 右列 */}
        <div className="space-y-4">
          {/* AI 置信信息：数据库无置信度字段，整卡为 MOCK 填充 */}
          <Panel title="AI 置信信息">
            <div className="flex items-center justify-between gap-3 rounded-lg bg-blue-50/60 px-3 py-2.5">
              <p>
                <span className="text-[26px] font-bold leading-none tabular-nums text-blue-600">{MOCK.confidence.score}%</span>
                <span className="ml-1.5 text-[12px] text-slate-500">置信度</span>
              </p>
              <p className="text-[12px] text-slate-500">
                建议：<span className="font-medium text-green-600">{MOCK.confidence.advice}</span>
              </p>
            </div>
            <dl className="mt-3.5 space-y-3">
              {MOCK.confidence.metrics.map((m) => (
                <div key={m.label} className="flex items-center gap-3">
                  <dt className="w-[72px] shrink-0 text-[12px] text-slate-500">{m.label}</dt>
                  <dd className="flex min-w-0 flex-1 items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-blue-600" style={{ width: `${m.value}%` }} />
                    </div>
                    <span className="w-9 shrink-0 text-right text-[12px] tabular-nums text-slate-600">{m.value}%</span>
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-3.5 border-t border-slate-100 pt-2.5 text-[11px] text-slate-400">AI 分析仅供参考，请结合实际情况判断</p>
          </Panel>

          <ClarifyCard id={d.id} clarifications={clarifications} demo={demo} mock={clarifyMock} />

          <Panel title="关联需求" extra={<TodoAction label="+ 选择需求" kind="link" />}>
            {d.related.length > 0 ? (
              <ul className="space-y-2">
                {d.related.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2">
                    <Link href={`/requirements/${r.id}`} className="min-w-0 truncate text-[13px] text-slate-600 hover:text-blue-600">
                      <span className="mr-1.5 font-mono text-[11px] tabular-nums text-slate-400">REQ-{r.seq}</span>
                      {r.title}
                    </Link>
                    <span className="flex shrink-0 items-center gap-1">
                      <Chip tone={r.kind === "defect" ? "red" : "slate"}>{r.kind === "defect" ? "缺陷" : "原需求"}</Chip>
                      <StatusChip status={r.status} />
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[12px] text-slate-400">暂无关联需求</p>
            )}
          </Panel>

          <AcceptActions id={d.id} status={d.status} demo={demo} />
          <ManageActions id={d.id} status={d.status} demo={demo} />

          {hasDelivery && (
            <Panel title="交付信息">
              <dl className="space-y-2.5 text-[13px]">
                <div>
                  <dt className="text-[11px] text-slate-400">Feature 分支</dt>
                  <dd className="font-mono text-[12px] text-slate-700">{d.featureBranch ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-slate-400">所在日分支</dt>
                  <dd className="font-mono text-[12px] text-slate-700">{d.dailyBranch ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-slate-400">开发 Agent</dt>
                  <dd className="text-slate-700">{d.agent ?? "—"}</dd>
                </div>
                {d.submitNote && (
                  <div>
                    <dt className="text-[11px] text-slate-400">提交说明</dt>
                    <dd className="text-slate-600">{d.submitNote}</dd>
                  </div>
                )}
                {d.report && (
                  <div>
                    <dt className="text-[11px] text-slate-400">测试报告</dt>
                    <dd className="mt-0.5">
                      <Chip tone={d.report.conclusion === "PASS" ? "green" : "red"}>
                        {d.report.conclusion === "PASS" ? "✓" : "✗"} {d.report.conclusion} · 通过率 {Math.round(d.report.passRate * 100)}% ·{" "}
                        {d.report.cases} 条用例
                      </Chip>
                    </dd>
                  </div>
                )}
              </dl>
            </Panel>
          )}
        </div>
      </div>

      {/* 待确认状态：底部固定操作条 */}
      {isPendingConfirm && (
        <ConfirmActionBar
          id={d.id}
          demo={demo}
          title={d.title}
          userStory={d.userStory}
          acceptance={d.acceptance}
          projectId={d.projectId}
          projects={projects}
          candidates={mergeCandidates}
        />
      )}
    </PageShell>
  );
}
