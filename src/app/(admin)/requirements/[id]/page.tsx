import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { isDemoMode, DEMO_REQ_DETAIL, DEMO } from "@/lib/demo";
import { PageShell, PageHeader, Panel, Chip, KV, Stepper, Timeline, Notice, DemoNote, fmtDateTime, ago } from "@/components/ui";
import { StatusChip, PriorityChip, ComplexityChip, STATUS_FLOW, STATUS_LABEL, CHANNEL_LABEL, actorLabel } from "@/components/status";
import { Icon } from "@/components/icons";
import { ActionPanel, ClarifyPanel, CasesTable, RefreshButton, type DetailData } from "./ui";

export const dynamic = "force-dynamic";

// 需求详情（设计画布「需求详情」画板）：状态进度条 + 主列内容 + 右栏「当前动作 / 属性」。
// 真实模式全部来自数据库；无澄清 / 无原始消息 / 无报告的区块直接不渲染。

interface RawMsg {
  text?: string;
  ts?: string | number;
  sender?: string;
  attachmentId?: string;
}

const FLOW_LABEL: Record<string, string> = {
  PENDING_CONFIRM: "待确认",
  READY: "待开发",
  DEVELOPING: "开发中",
  PENDING_TEST: "待测试",
  TESTING: "测试中",
  PENDING_ACCEPT: "待验收",
  ACCEPTED: "已验收",
};

function flowIndex(status: string): number {
  if (status === "REVIEWING") return STATUS_FLOW.indexOf("TESTING");
  const i = STATUS_FLOW.indexOf(status as (typeof STATUS_FLOW)[number]);
  return i;
}

export default async function RequirementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const demo = await isDemoMode();

  let d: DetailData;
  let projects: { id: string; name: string }[] = [];

  if (demo) {
    const c = DEMO.confirmItems.find((x) => x.id === id);
    const base = DEMO_REQ_DETAIL;
    d = c
      ? {
          id: c.id,
          seq: c.seq,
          title: c.title,
          status: "PENDING_CONFIRM",
          priority: null,
          priorityReason: null,
          priorityLocked: false,
          complexity: c.complexity,
          moduleGuess: null,
          projectId: c.projectId,
          projectName: c.projectName,
          source: { channel: c.source.channel, sender: c.source.sender, customer: c.source.customer, wechat: c.source.channel === "WECHAT" },
          userStory: c.userStory,
          acceptance: c.acceptance,
          clarifications: c.clarifications,
          featureBranch: null,
          daily: null,
          devTask: null,
          testTask: null,
          report: null,
          rawMessages: [{ sender: c.source.sender ?? "客户", ts: new Date(Date.now() - 7200_000).toISOString(), text: c.userStory }],
          attachments: [],
          parent: null,
          defects: [],
          siblings: [],
          createdAt: new Date(Date.now() - 7200_000).toISOString(),
          updatedAt: new Date(Date.now() - 3600_000).toISOString(),
          events: [{ at: new Date(Date.now() - 7200_000).toISOString(), actor: "expert:PRODUCT", note: "自动拆解", from: null, to: "PENDING_CONFIRM" }],
        }
      : {
          id,
          seq: base.seq,
          title: base.title,
          status: base.status,
          priority: base.priority,
          priorityReason: "客户高频反馈，工作量适中",
          priorityLocked: true,
          complexity: base.complexity,
          moduleGuess: "客户管理",
          projectId: "demo-p2",
          projectName: base.project,
          source: { channel: "WECHAT", sender: "李经理", customer: "比灵科技", wechat: true },
          userStory: base.userStory,
          acceptance: base.acceptance,
          clarifications: [],
          featureBranch: base.featureBranch,
          daily: { id: "demo-b1", name: base.dailyBranch, mergedToMain: false },
          devTask: { id: "demo-dt", status: "MERGED", agent: base.agent, submitNote: base.submitNote, selfTest: "验收 1-3 逐条通过", commits: ["e7f3a9b"], submittedAt: new Date(Date.now() - 6 * 3600_000).toISOString(), claimedAt: new Date(Date.now() - 20 * 3600_000).toISOString(), lastHeartbeat: null },
          testTask: { id: "demo-tt", status: "DONE", agent: "test-agent-1", caseCount: 8, cases: [
            { step: "列表首屏加载 20 条", expected: "展示 20 条并显示总数", tag: "功能" },
            { step: "滚动到底自动加载第二页", expected: "追加 20 条，无重复", tag: "功能" },
            { step: "总数为 0 时显示空态", expected: "显示「暂无客户」", tag: "边界" },
          ] },
          report: { conclusion: "PASS", passRate: 1, agent: "test-agent-1", createdAt: new Date(Date.now() - 1800_000).toISOString(), repoFilePath: "docs/test-reports/REQ-95.md", results: [{ caseIdx: 0, pass: true }, { caseIdx: 1, pass: true }, { caseIdx: 2, pass: true }], defects: [] },
          rawMessages: [{ sender: "李经理", ts: new Date(Date.now() - 26 * 3600_000).toISOString(), text: "客户列表现在一次全加载太卡了，能不能分页？" }],
          attachments: [],
          parent: null,
          defects: [],
          siblings: [],
          createdAt: base.events[0].at.toISOString(),
          updatedAt: base.events.at(-1)!.at.toISOString(),
          events: base.events.map((e, i, arr) => ({ at: e.at.toISOString(), actor: e.actor, note: e.note, from: arr[i - 1]?.to ?? null, to: e.to })),
        };
    projects = DEMO.dashboard.projects.map((p) => ({ id: p.id, name: p.name }));
  } else {
    const r = await prisma.requirement.findUnique({
      where: { id },
      include: {
        project: { select: { id: true, name: true } },
        source: { include: { attachments: { select: { id: true, filename: true, mime: true } } } },
        dailyBranch: { select: { id: true, name: true, mergedToMain: true } },
        devTask: { include: { claimedBy: { select: { username: true } } } },
        testTasks: { include: { report: true, claimedBy: { select: { username: true } } }, orderBy: { createdAt: "asc" } },
        events: { orderBy: { createdAt: "asc" } },
        parent: { select: { id: true, seq: true, title: true, status: true } },
        defects: { select: { id: true, seq: true, title: true, status: true } },
      },
    });
    if (!r) notFound();
    const [siblings, dbProjects] = await Promise.all([
      prisma.requirement.findMany({ where: { sourceId: r.sourceId, id: { not: r.id } }, select: { id: true, seq: true, title: true, status: true }, orderBy: { seq: "asc" } }),
      prisma.project.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { createdAt: "asc" } }),
    ]);
    const lastTest = r.testTasks.at(-1) ?? null;
    const lastReport = [...r.testTasks].reverse().map((t) => t.report).find(Boolean) ?? null;
    const attById = new Map(r.source.attachments.map((a) => [a.id, a]));
    const raw = (r.source.rawMessages as unknown as RawMsg[] | null) ?? [];
    d = {
      id: r.id,
      seq: r.seq,
      title: r.title,
      status: r.status,
      priority: r.priority,
      priorityReason: r.priorityReason,
      priorityLocked: r.priorityLocked,
      complexity: r.complexity,
      moduleGuess: r.moduleGuess,
      projectId: r.projectId,
      projectName: r.project?.name ?? null,
      source: { channel: r.source.channel, sender: r.source.senderName, customer: r.source.customerName, wechat: r.source.channel === "WECHAT" && !!r.source.wechatConvId },
      userStory: r.userStory,
      acceptance: (r.acceptance as string[]) ?? [],
      clarifications: ((r.clarifications as { question: string; answer: string | null }[] | null) ?? []).filter((c) => c && c.question),
      featureBranch: r.featureBranch,
      daily: r.dailyBranch ? { id: r.dailyBranch.id, name: r.dailyBranch.name, mergedToMain: r.dailyBranch.mergedToMain } : null,
      devTask: r.devTask
        ? {
            id: r.devTask.id,
            status: r.devTask.status,
            agent: r.devTask.claimedBy?.username ?? null,
            submitNote: r.devTask.submitNote,
            selfTest: r.devTask.selfTest,
            commits: (r.devTask.commits as string[] | null) ?? [],
            submittedAt: r.devTask.submittedAt?.toISOString() ?? null,
            claimedAt: r.devTask.claimedAt?.toISOString() ?? null,
            lastHeartbeat: r.devTask.lastHeartbeat?.toISOString() ?? null,
          }
        : null,
      testTask: lastTest
        ? {
            id: lastTest.id,
            status: lastTest.status,
            agent: lastTest.claimedBy?.username ?? null,
            caseCount: ((lastTest.cases as unknown[]) ?? []).length,
            cases: ((lastTest.cases as { step: string; expected: string; tag: string }[]) ?? []),
          }
        : null,
      report: lastReport
        ? {
            conclusion: lastReport.conclusion,
            passRate: lastReport.passRate,
            agent: r.testTasks.find((t) => t.report?.id === lastReport.id)?.claimedBy?.username ?? null,
            createdAt: lastReport.createdAt.toISOString(),
            repoFilePath: lastReport.repoFilePath,
            results: ((lastReport.results as { caseIdx: number; pass: boolean; note?: string }[]) ?? []),
            defects: ((lastReport.defects as { desc: string }[] | null) ?? []),
          }
        : null,
      rawMessages: raw
        .filter((m) => m.text || m.attachmentId)
        .map((m) => ({
          sender: m.sender ?? r.source.senderName ?? r.source.customerName ?? "—",
          ts: m.ts == null ? null : typeof m.ts === "number" ? new Date(m.ts * (m.ts < 1e12 ? 1000 : 1)).toISOString() : String(m.ts),
          text: m.text ?? (m.attachmentId ? `［附件：${attById.get(m.attachmentId)?.filename ?? m.attachmentId}］` : ""),
        })),
      attachments: r.source.attachments.map((a) => ({ name: a.filename, mime: a.mime })),
      parent: r.parent,
      defects: r.defects,
      siblings,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      events: r.events.map((e) => ({ at: e.createdAt.toISOString(), actor: e.actor, note: e.note ?? "", from: e.fromStatus, to: e.toStatus })),
    };
    projects = dbProjects;
  }

  const terminal = d.status === "CLOSED" || d.status === "ON_HOLD";
  // 终态：按流转记录找最后到达的流程状态
  const lastFlow = terminal ? [...d.events].reverse().find((e) => flowIndex(e.from ?? "") >= 0)?.from ?? "PENDING_CONFIRM" : d.status;
  const current = Math.max(0, flowIndex(lastFlow));
  const isReviewing = d.status === "REVIEWING";
  const backHref = d.status === "PENDING_CONFIRM" ? "/confirm" : "/requirements";

  const caseRows = d.testTask?.cases.map((c, i) => ({ idx: i, step: c.step, expected: c.expected, tag: c.tag, pass: d.report?.results.find((x) => x.caseIdx === i)?.pass ?? null, note: d.report?.results.find((x) => x.caseIdx === i)?.note ?? null })) ?? [];

  return (
    <PageShell>
      <PageHeader
        back={{ href: backHref }}
        title={
          <span className="flex items-center gap-2.5">
            <span className="font-mono text-[13px] font-normal text-ink-3">REQ-{d.seq}</span>
            <span className="truncate">{d.title}</span>
          </span>
        }
        actions={<RefreshButton />}
      />
      {demo && <DemoNote />}
      {terminal && (
        <Notice tone="warn">
          该需求已{STATUS_LABEL[d.status]}。{d.events.at(-1)?.note ? `原因：${d.events.at(-1)?.note}` : ""}可在右侧「当前动作」恢复。
        </Notice>
      )}
      {isReviewing && <Notice tone="warn">测试部分通过，等待管理员裁决：放行进入待验收，或退回开发池重做。</Notice>}
      {d.devTask?.status === "CONFLICT" && <Notice tone="danger">feature 分支合并到当日分支时发生冲突。请在本地解决冲突并 push 后「重试合并」，或将本需求剔除回待开发。</Notice>}

      <Stepper steps={STATUS_FLOW.map((k) => ({ key: k, label: FLOW_LABEL[k] }))} current={current} />

      <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
        {/* 手机端把动作放最前面 */}
        <div className="flex w-full shrink-0 flex-col gap-4 xl:order-2 xl:w-[340px]">
          <ActionPanel d={d} projects={projects} demo={demo} />
          <Panel title="属性" pad={false}>
            <div className="px-4">
              <KV
                items={[
                  { k: "状态", v: <StatusChip status={d.status} /> },
                  {
                    k: "优先级",
                    v: d.priority ? (
                      <span className="inline-flex items-center gap-1.5">
                        <PriorityChip priority={d.priority} />
                        {d.priorityLocked && <Icon name="lock" size={12} className="text-ink-3" />}
                        {d.priorityReason && <span className="max-w-[180px] truncate text-[12px] text-ink-3" title={d.priorityReason}>{d.priorityReason}</span>}
                      </span>
                    ) : (
                      <span className="text-ink-3">项管专家待排序</span>
                    ),
                  },
                  { k: "复杂度", v: <ComplexityChip complexity={d.complexity} /> },
                  { k: "项目", v: d.projectName ?? <span className="text-danger">未指定</span> },
                  { k: "涉及模块", v: d.moduleGuess ?? <span className="text-ink-3">—</span> },
                  { k: "来源", v: [CHANNEL_LABEL[d.source.channel] ?? d.source.channel, d.source.customer, d.source.sender !== d.source.customer ? d.source.sender : null].filter(Boolean).join(" · ") },
                  { k: "开发 Agent", v: d.devTask?.agent ? <span className="font-mono text-[12px]">{d.devTask.agent}</span> : <span className="text-ink-3">—</span> },
                  { k: "测试 Agent", v: d.testTask?.agent ? <span className="font-mono text-[12px]">{d.testTask.agent}</span> : <span className="text-ink-3">—</span> },
                  { k: "feature 分支", v: d.featureBranch ? <span className="font-mono text-[12px] text-accent">{d.featureBranch}</span> : <span className="text-ink-3">认领后创建</span> },
                  {
                    k: "所在 daily",
                    v: d.daily ? (
                      <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
                        <Link href={`/branches?branch=${d.daily.id}`} className="font-mono text-[12px] text-accent hover:underline">
                          {d.daily.name}
                        </Link>
                        {d.daily.mergedToMain ? <Chip tone="green">已合并 main</Chip> : <Chip tone="amber">未合并</Chip>}
                      </span>
                    ) : (
                      <span className="text-ink-3">—</span>
                    ),
                  },
                  {
                    k: "关联",
                    v:
                      d.parent || d.defects.length ? (
                        <span className="flex flex-col items-end gap-1">
                          {d.parent && (
                            <Link href={`/requirements/${d.parent.id}`} className="text-accent hover:underline">
                              缺陷来源 REQ-{d.parent.seq}
                            </Link>
                          )}
                          {d.defects.map((x) => (
                            <Link key={x.id} href={`/requirements/${x.id}`} className="text-accent hover:underline">
                              派生缺陷 REQ-{x.seq} <StatusChip status={x.status} />
                            </Link>
                          ))}
                        </span>
                      ) : (
                        <span className="text-ink-3">无</span>
                      ),
                  },
                  { k: "创建", v: <span className="num text-[12px]">{fmtDateTime(d.createdAt)}</span> },
                  { k: "更新", v: <span className="num text-[12px]">{ago(d.updatedAt)}</span> },
                ]}
              />
            </div>
          </Panel>
          {d.siblings.length > 0 && (
            <Panel title="同线索需求" pad={false}>
              <ul className="divide-y divide-line">
                {d.siblings.map((s) => (
                  <li key={s.id} className="flex items-center gap-2 px-4 py-2 text-[13px]">
                    <span className="font-mono text-[12px] text-ink-3">REQ-{s.seq}</span>
                    <Link href={`/requirements/${s.id}`} className="min-w-0 flex-1 truncate text-ink hover:text-accent">
                      {s.title}
                    </Link>
                    <StatusChip status={s.status} />
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-4 xl:order-1">
          <Panel title="用户故事">
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink">{d.userStory}</p>
          </Panel>
          <Panel title={`验收标准（${d.acceptance.length}）`} pad={false}>
            <ol className="divide-y divide-line px-4">
              {d.acceptance.map((a, i) => (
                <li key={i} className="flex items-center gap-3 py-2 text-[13px] text-ink">
                  <span className="num w-4 shrink-0 font-mono text-[12px] text-ink-3">{i + 1}</span>
                  <span className="flex-1">{a}</span>
                </li>
              ))}
            </ol>
          </Panel>
          {d.clarifications.length > 0 && <ClarifyPanel d={d} demo={demo} />}
          {d.devTask?.submitNote && (
            <Panel title="开发提交">
              <div className="flex flex-col gap-2 text-[13px]">
                <p className="whitespace-pre-wrap text-ink">{d.devTask.submitNote}</p>
                {d.devTask.selfTest && (
                  <div className="rounded-md border border-line bg-surface-2 px-3 py-2">
                    <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.04em] text-ink-3">自测结果</p>
                    <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-ink-2">{d.devTask.selfTest}</p>
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-ink-3">
                  {d.devTask.commits.map((c) => (
                    <Chip key={c} tone="outline" className="font-mono">
                      {c.slice(0, 8)}
                    </Chip>
                  ))}
                  <span className="ml-auto">
                    <span className="font-mono">{d.devTask.agent}</span> · {fmtDateTime(d.devTask.submittedAt)}
                  </span>
                </div>
              </div>
            </Panel>
          )}
          {(d.report || d.testTask) && (
            <Panel title="测试报告" pad={false}>
              <div className="px-4 pt-3">
                {d.report ? (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink-2">
                    <span className={`text-[20px] font-semibold ${d.report.conclusion === "PASS" ? "text-ok" : d.report.conclusion === "FAIL" ? "text-danger" : "text-warn"}`}>{d.report.conclusion}</span>
                    <span>
                      通过率 {Math.round(d.report.passRate * 100)}%（{d.report.results.filter((x) => x.pass).length}/{d.report.results.length}）
                    </span>
                    {d.report.agent && <span className="font-mono">{d.report.agent}</span>}
                    <span>{fmtDateTime(d.report.createdAt)}</span>
                    {d.report.repoFilePath && <span className="ml-auto font-mono text-accent">{d.report.repoFilePath}</span>}
                  </div>
                ) : (
                  <p className="text-[12px] text-ink-2">
                    测试任务 {d.testTask?.caseCount} 条用例 · {d.testTask?.status === "POOL" ? "待测试 Agent 认领" : d.testTask?.status === "CLAIMED" ? `${d.testTask.agent} 测试中` : STATUS_LABEL[d.status]}
                  </p>
                )}
              </div>
              {caseRows.length > 0 && <CasesTable rows={caseRows} />}
              {d.report && d.report.defects.length > 0 && (
                <div className="border-t border-line px-4 py-3">
                  <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.04em] text-danger">缺陷</p>
                  <ul className="list-disc pl-5 text-[13px] text-ink">
                    {d.report.defects.map((x, i) => (
                      <li key={i}>{x.desc}</li>
                    ))}
                  </ul>
                </div>
              )}
            </Panel>
          )}
          {(d.rawMessages.length > 0 || d.attachments.length > 0) && (
            <Panel title="原始消息">
              <div className="flex flex-col gap-1 text-[12px] leading-relaxed text-ink-2">
                {d.rawMessages.map((m, i) => (
                  <div key={i}>
                    <span className="text-ink-3">
                      {m.sender}
                      {m.ts ? ` ${fmtDateTime(m.ts)}` : ""}{" "}
                    </span>
                    <span className="whitespace-pre-wrap text-ink">{m.text}</span>
                  </div>
                ))}
                {d.attachments.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {d.attachments.map((a, i) => (
                      <Chip key={i} tone="outline" title={a.mime}>
                        <Icon name={a.mime.startsWith("image/") ? "image" : "file"} size={11} />
                        {a.name}
                      </Chip>
                    ))}
                  </div>
                )}
              </div>
            </Panel>
          )}
          <Panel title="流转记录" pad={false}>
            <div className="px-4 py-1">
              <Timeline
                items={d.events.map((e, i) => ({
                  time: fmtDateTime(e.at),
                  actor: actorLabel(e.actor),
                  note: e.note || `${STATUS_LABEL[e.from ?? ""] ?? e.from ?? ""} → ${STATUS_LABEL[e.to] ?? e.to}`,
                  badge: e.to !== e.from ? <StatusChip status={e.to} /> : undefined,
                  tone: /冲突|不通过|受阻|驳回/.test(e.note) ? "danger" : i === d.events.length - 1 ? "current" : "default",
                }))}
              />
            </div>
          </Panel>
        </div>
      </div>
    </PageShell>
  );
}
