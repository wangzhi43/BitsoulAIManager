import Link from "next/link";
import { prisma } from "@/lib/db";
import { isDemoMode, DEMO_REQ_LIST, DEMO } from "@/lib/demo";
import { StatusChip, PriorityChip, ComplexityChip, STATUS_LABEL, CHANNEL_LABEL } from "@/components/status";
import { PageShell, PageHeader, Panel, Table, EmptyRow, Tabs, fmtDateTime, DemoNote, LinkButton } from "@/components/ui";
import { Icon } from "@/components/icons";
import type { ReqStatus, Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

// 需求列表：状态页签 + 项目/关键词筛选 + 表格。点击标题进详情。

const FILTERS: { key: string; label: string; statuses?: ReqStatus[] }[] = [
  { key: "", label: "全部" },
  { key: "PENDING_CONFIRM", label: "待确认" },
  { key: "READY", label: "待开发" },
  { key: "DEVELOPING", label: "开发中" },
  { key: "TESTING", label: "测试", statuses: ["PENDING_TEST", "TESTING"] },
  { key: "REVIEWING", label: "待裁决" },
  { key: "PENDING_ACCEPT", label: "待验收" },
  { key: "ACCEPTED", label: "已验收" },
  { key: "CLOSED", label: "已关闭", statuses: ["CLOSED", "ON_HOLD"] },
];

interface Row {
  id: string;
  seq: number;
  title: string;
  project: string | null;
  status: string;
  priority: string | null;
  complexity: string;
  customer: string | null;
  channel: string;
  agent: string | null;
  updatedAt: Date;
}

export default async function RequirementsPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; project?: string }> }) {
  const { status = "", q = "", project = "" } = await searchParams;
  const demo = await isDemoMode();
  const filter = FILTERS.find((f) => f.key === status) ?? FILTERS[0];

  let rows: Row[];
  let projects: { id: string; name: string }[];
  let counts: Record<string, number> = {};

  if (demo) {
    rows = DEMO_REQ_LIST.filter((r) => !status || r.status === status || filter.statuses?.includes(r.status as ReqStatus)).map((r) => ({ ...r, channel: r.customer ? "WECHAT" : "MANUAL", agent: null }));
    projects = DEMO.dashboard.projects.map((p) => ({ id: p.id, name: p.name }));
    counts = { PENDING_CONFIRM: 2, DEVELOPING: 1, READY: 1, PENDING_ACCEPT: 1, ACCEPTED: 2 };
  } else {
    const seqMatch = q.match(/REQ-?(\d+)/i);
    const where: Prisma.RequirementWhereInput = {
      ...(filter.key ? { status: { in: filter.statuses ?? [filter.key as ReqStatus] } } : {}),
      ...(project ? { projectId: project } : {}),
      ...(q
        ? seqMatch
          ? { seq: Number(seqMatch[1]) }
          : { OR: [{ title: { contains: q, mode: "insensitive" } }, { userStory: { contains: q, mode: "insensitive" } }] }
        : {}),
    };
    const [reqs, dbProjects, grouped] = await Promise.all([
      prisma.requirement.findMany({
        where,
        include: {
          project: { select: { name: true } },
          source: { select: { customerName: true, senderName: true, channel: true } },
          devTask: { select: { claimedBy: { select: { username: true } } } },
        },
        orderBy: { updatedAt: "desc" },
        take: 200,
      }),
      prisma.project.findMany({ select: { id: true, name: true }, orderBy: { createdAt: "asc" } }),
      prisma.requirement.groupBy({ by: ["status"], _count: true, where: project ? { projectId: project } : undefined }),
    ]);
    rows = reqs.map((r) => ({
      id: r.id,
      seq: r.seq,
      title: r.title,
      project: r.project?.name ?? null,
      status: r.status,
      priority: r.priority,
      complexity: r.complexity,
      customer: r.source.customerName ?? r.source.senderName,
      channel: r.source.channel,
      agent: r.devTask?.claimedBy?.username ?? null,
      updatedAt: r.updatedAt,
    }));
    projects = dbProjects;
    counts = Object.fromEntries(grouped.map((g) => [g.status, g._count]));
  }

  const countFor = (f: (typeof FILTERS)[number]) => (f.key ? (f.statuses ?? [f.key]).reduce((a, s) => a + (counts[s] ?? 0), 0) : Object.values(counts).reduce((a, b) => a + b, 0));
  const qs = (patch: Record<string, string>) => {
    const p = new URLSearchParams({ status, q, project, ...patch });
    for (const [k, v] of [...p.entries()]) if (!v) p.delete(k);
    const str = p.toString();
    return `/requirements${str ? `?${str}` : ""}`;
  };

  return (
    <PageShell>
      <PageHeader
        title="需求列表"
        subtitle="全部需求的状态检索"
        actions={
          <LinkButton href="/inbox#import" icon="plus" kind="primary">
            手动导入
          </LinkButton>
        }
      />
      {demo && <DemoNote />}

      <Panel pad={false}>
        <Tabs items={FILTERS.map((f) => ({ href: qs({ status: f.key }), label: f.label, active: f.key === status, count: countFor(f) }))} className="px-2" />
        <form className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5" action="/requirements" method="get">
          {status && <input type="hidden" name="status" value={status} />}
          <select name="project" defaultValue={project} className="ctl ctl-sm w-auto min-w-[140px]">
            <option value="">全部项目</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <div className="relative">
            <Icon name="search" size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
            <input name="q" defaultValue={q} placeholder="编号（REQ-12）或标题关键词" className="ctl ctl-sm w-[240px] pl-7" />
          </div>
          <button className="h-7 rounded-md border border-line-strong bg-surface px-2.5 text-[12px] text-ink hover:bg-surface-2">筛选</button>
          {(q || project) && (
            <Link href={qs({ q: "", project: "" })} className="text-[12px] text-ink-3 hover:text-ink">
              清除
            </Link>
          )}
          <span className="num ml-auto text-[12px] text-ink-3">{rows.length} 条</span>
        </form>
        <Table head={["编号", "需求", "项目 / 来源", "复杂度", "优先级", "状态", "开发 Agent", { label: "更新时间", align: "right" }]}>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="font-mono text-[12px] text-ink-3">REQ-{r.seq}</td>
              <td className="max-w-[380px]">
                <Link href={`/requirements/${r.id}`} className="block truncate text-[13px] font-medium text-ink hover:text-accent hover:underline">
                  {r.title}
                </Link>
              </td>
              <td className="text-[12px] text-ink-2">
                {r.project ?? <span className="text-danger">未指定项目</span>}
                <span className="text-ink-3">
                  {" "}
                  · {CHANNEL_LABEL[r.channel] ?? r.channel}
                  {r.customer ? ` · ${r.customer}` : ""}
                </span>
              </td>
              <td>
                <ComplexityChip complexity={r.complexity} />
              </td>
              <td>
                <PriorityChip priority={r.priority} />
              </td>
              <td>
                <StatusChip status={r.status} />
              </td>
              <td className="font-mono text-[12px] text-ink-2">{r.agent ?? <span className="text-ink-3">—</span>}</td>
              <td className="num text-right text-[12px] text-ink-3">{fmtDateTime(r.updatedAt)}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <EmptyRow colSpan={8}>
              {q ? `没有匹配「${q}」的需求` : status ? `没有「${STATUS_LABEL[status] ?? filter.label}」状态的需求` : "还没有需求。从采集箱手动导入，或让客户在微信里描述需求。"}
            </EmptyRow>
          )}
        </Table>
      </Panel>
    </PageShell>
  );
}
