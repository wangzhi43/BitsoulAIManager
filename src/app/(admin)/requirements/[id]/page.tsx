import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { isDemoMode, DEMO_REQ_DETAIL } from "@/lib/demo";
import { StatusChip, PriorityChip } from "@/components/status";
import { AcceptActions, ManageActions } from "./ui";

export const dynamic = "force-dynamic";

interface Detail {
  id: string;
  seq: number;
  title: string;
  status: string;
  priority: string | null;
  complexity: string;
  project: string | null;
  userStory: string;
  acceptance: string[];
  clarifications: { question: string; answer: string | null }[];
  featureBranch: string | null;
  dailyBranch: string | null;
  customer: string | null;
  submitNote: string | null;
  agent: string | null;
  report: { conclusion: string; passRate: number; cases: number } | null;
  events: { at: Date; actor: string; note: string; to: string }[];
}

export default async function RequirementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const demo = await isDemoMode();

  let d: Detail;
  if (demo) {
    d = { ...DEMO_REQ_DETAIL, id } as Detail;
  } else {
    const r = await prisma.requirement.findUnique({
      where: { id },
      include: {
        project: { select: { name: true } },
        source: { select: { customerName: true, senderName: true, channel: true } },
        dailyBranch: { select: { name: true } },
        devTask: { select: { submitNote: true, claimedBy: { select: { username: true } } } },
        testTasks: { include: { report: true } },
        events: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!r) notFound();
    const report = r.testTasks.map((t) => t.report).filter(Boolean).at(-1);
    d = {
      id: r.id,
      seq: r.seq,
      title: r.title,
      status: r.status,
      priority: r.priority,
      complexity: r.complexity,
      project: r.project?.name ?? null,
      userStory: r.userStory,
      acceptance: r.acceptance as string[],
      clarifications: (r.clarifications as { question: string; answer: string | null }[] | null) ?? [],
      featureBranch: r.featureBranch,
      dailyBranch: r.dailyBranch?.name ?? null,
      customer: r.source.customerName ?? r.source.senderName,
      submitNote: r.devTask?.submitNote ?? null,
      agent: r.devTask?.claimedBy?.username ?? null,
      report: report
        ? { conclusion: report.conclusion, passRate: report.passRate, cases: (r.testTasks.at(-1)?.cases as unknown[])?.length ?? 0 }
        : null,
      events: r.events.map((e) => ({ at: e.createdAt, actor: e.actor, note: e.note ?? "", to: e.toStatus })),
    };
  }

  const box = "rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900";

  return (
    <main className="mx-auto w-full max-w-[1720px] px-4 py-5 sm:px-6 xl:px-8">
      <header className="mb-4">
        <p className="font-mono text-xs text-zinc-400">REQ-{d.seq}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight">{d.title}</h1>
          <PriorityChip priority={d.priority} />
          <StatusChip status={d.status} />
        </div>
        <p className="mt-1 text-xs text-zinc-400">
          {d.project ?? "未指定项目"} · 复杂度 {d.complexity}
          {d.customer ? ` · 来源：${d.customer}` : ""}
        </p>
      </header>

      <div className="grid gap-3 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <section className={box}>
            <h2 className="mb-2 text-[13px] font-semibold">用户故事</h2>
            <p className="whitespace-pre-wrap text-sm text-zinc-600 dark:text-zinc-300">{d.userStory}</p>
            <h2 className="mb-2 mt-4 text-[13px] font-semibold">验收标准</h2>
            <ul className="space-y-1.5 text-sm">
              {d.acceptance.map((a, i) => (
                <li key={i} className="flex gap-2 text-zinc-600 dark:text-zinc-300">
                  <span className="text-zinc-300">☐</span>
                  {a}
                </li>
              ))}
            </ul>
            {d.clarifications.length > 0 && (
              <div className="mt-4 rounded-xl bg-amber-50 p-3 text-sm dark:bg-amber-950/40">
                <p className="mb-1 text-xs font-medium text-amber-700 dark:text-amber-300">待澄清问题</p>
                {d.clarifications.map((c, i) => (
                  <p key={i} className="text-amber-800 dark:text-amber-200">
                    · {c.question}
                    {c.answer && <span className="text-amber-600"> — {c.answer}</span>}
                  </p>
                ))}
              </div>
            )}
          </section>

          <section className={box}>
            <h2 className="mb-3 text-[13px] font-semibold">流转时间线</h2>
            <ol className="relative space-y-3 border-l border-zinc-200 pl-4 dark:border-zinc-800">
              {d.events.map((e, i) => (
                <li key={i} className="relative">
                  <span className="absolute -left-[21.5px] top-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-indigo-400 dark:border-zinc-900" />
                  <p className="text-sm">
                    <StatusChip status={e.to} /> <span className="ml-1 text-zinc-600 dark:text-zinc-300">{e.note}</span>
                  </p>
                  <p className="mt-0.5 text-[11px] text-zinc-400">
                    {new Date(e.at).toLocaleString("zh-CN")} · {e.actor}
                  </p>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <div className="space-y-3">
          <AcceptActions id={d.id} status={d.status} demo={demo} />
          <ManageActions id={d.id} status={d.status} demo={demo} />

          <section className={box}>
            <h2 className="mb-2 text-[13px] font-semibold">交付信息</h2>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-[11px] text-zinc-400">Feature 分支</dt>
                <dd className="font-mono text-xs">{d.featureBranch ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-[11px] text-zinc-400">所在日分支</dt>
                <dd className="font-mono text-xs">{d.dailyBranch ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-[11px] text-zinc-400">开发 Agent</dt>
                <dd>{d.agent ?? "—"}</dd>
              </div>
              {d.submitNote && (
                <div>
                  <dt className="text-[11px] text-zinc-400">提交说明</dt>
                  <dd className="text-zinc-600 dark:text-zinc-300">{d.submitNote}</dd>
                </div>
              )}
              {d.report && (
                <div>
                  <dt className="text-[11px] text-zinc-400">测试报告</dt>
                  <dd>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        d.report.conclusion === "PASS"
                          ? "bg-green-100 text-green-700 dark:bg-green-950/60 dark:text-green-400"
                          : "bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400"
                      }`}
                    >
                      {d.report.conclusion === "PASS" ? "✓" : "✗"} {d.report.conclusion} · 通过率{" "}
                      {Math.round(d.report.passRate * 100)}% · {d.report.cases} 条用例
                    </span>
                  </dd>
                </div>
              )}
            </dl>
          </section>
        </div>
      </div>
    </main>
  );
}
