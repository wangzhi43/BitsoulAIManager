import Link from "next/link";
import { prisma } from "@/lib/db";
import { isDemoMode, DEMO_REQ_LIST } from "@/lib/demo";
import { StatusChip, PriorityChip, STATUS_LABEL } from "@/components/status";
import { PageShell, PageHeader, Panel, Table, Chip } from "@/components/ui";
import type { ReqStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

const FILTERS: { key: string; label: string }[] = [
  { key: "", label: "全部" },
  { key: "PENDING_CONFIRM", label: "待确认" },
  { key: "READY", label: "待开发" },
  { key: "DEVELOPING", label: "开发中" },
  { key: "TESTING", label: "测试" },
  { key: "PENDING_ACCEPT", label: "待验收" },
  { key: "ACCEPTED", label: "已验收" },
  { key: "CLOSED", label: "已关闭" },
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
  updatedAt: Date;
}

export default async function RequirementsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const demo = await isDemoMode();

  let rows: Row[];
  if (demo) {
    rows = DEMO_REQ_LIST.filter((r) => !status || r.status === status || (status === "TESTING" && ["PENDING_TEST", "TESTING"].includes(r.status)));
  } else {
    const where =
      status === "TESTING"
        ? { status: { in: ["PENDING_TEST", "TESTING"] as ReqStatus[] } }
        : status
          ? { status: status as ReqStatus }
          : {};
    const reqs = await prisma.requirement.findMany({
      where,
      include: {
        project: { select: { name: true } },
        source: { select: { customerName: true, senderName: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
    });
    rows = reqs.map((r) => ({
      id: r.id,
      seq: r.seq,
      title: r.title,
      project: r.project?.name ?? null,
      status: r.status,
      priority: r.priority,
      complexity: r.complexity,
      customer: r.source.customerName ?? r.source.senderName,
      updatedAt: r.updatedAt,
    }));
  }

  return (
    <PageShell>
      <PageHeader title="需求列表" subtitle="全部需求的状态检索；点击标题进入详情（时间线/验收操作）" />

      <div className="mb-4 inline-flex flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        {FILTERS.map((f) => {
          const active = (status ?? "") === f.key;
          return (
            <Link
              key={f.key}
              href={f.key ? `/requirements?status=${f.key}` : "/requirements"}
              className={`rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors ${
                active ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              }`}
            >
              {f.label}
            </Link>
          );
        })}
      </div>

      <Panel
        title={status ? `「${STATUS_LABEL[status] ?? FILTERS.find((f) => f.key === status)?.label ?? status}」需求` : "全部需求"}
        extra={<span className="text-[11px] text-slate-400">{rows.length} 条</span>}
      >
        <Table head={["编号", "需求", "项目 / 来源", "复杂度", "优先级", "状态", "更新时间"]}>
          {rows.map((r) => (
            <tr key={r.id} className="transition-colors hover:bg-slate-50">
              <td className="py-2.5 pr-3 font-mono text-[11px] text-slate-400">REQ-{r.seq}</td>
              <td className="max-w-[360px] py-2.5 pr-3">
                <Link
                  href={`/requirements/${r.id}`}
                  className="block truncate text-[13px] font-medium text-slate-700 hover:text-blue-600 hover:underline"
                >
                  {r.title}
                </Link>
              </td>
              <td className="py-2.5 pr-3 text-[12px] text-slate-500">
                {r.project ?? <span className="text-slate-400">未指定项目</span>}
                {r.customer && <span className="text-slate-400"> · {r.customer}</span>}
              </td>
              <td className="py-2.5 pr-3">
                <Chip tone="slate">{r.complexity}</Chip>
              </td>
              <td className="py-2.5 pr-3">
                <PriorityChip priority={r.priority} />
              </td>
              <td className="py-2.5 pr-3">
                <StatusChip status={r.status} />
              </td>
              <td className="py-2.5 text-right text-[12px] tabular-nums text-slate-400">
                {r.updatedAt.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={7} className="py-10 text-center text-[13px] text-slate-400">
                {status ? `没有「${STATUS_LABEL[status] ?? status}」状态的需求` : "暂无需求"}
              </td>
            </tr>
          )}
        </Table>
      </Panel>
    </PageShell>
  );
}
