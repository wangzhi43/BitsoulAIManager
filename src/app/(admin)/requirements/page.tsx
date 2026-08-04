import Link from "next/link";
import { prisma } from "@/lib/db";
import { isDemoMode, DEMO_REQ_LIST } from "@/lib/demo";
import { StatusChip, PriorityChip, STATUS_LABEL } from "@/components/status";
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
    <main className="mx-auto max-w-5xl px-4 py-5 sm:px-6">
      <h1 className="mb-3 text-xl font-semibold tracking-tight">需求列表</h1>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => {
          const active = (status ?? "") === f.key;
          return (
            <Link
              key={f.key}
              href={f.key ? `/requirements?status=${f.key}` : "/requirements"}
              className={`rounded-full px-3 py-1.5 text-xs transition-colors ${
                active
                  ? "bg-indigo-600 font-medium text-white"
                  : "border border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900"
              }`}
            >
              {f.label}
            </Link>
          );
        })}
      </div>

      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {rows.map((r) => (
            <li key={r.id}>
              <Link
                href={`/requirements/${r.id}`}
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
              >
                <span className="w-16 shrink-0 font-mono text-xs text-zinc-400">REQ-{r.seq}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{r.title}</span>
                  <span className="mt-0.5 block text-[11px] text-zinc-400">
                    {r.project ?? "未指定项目"}
                    {r.customer ? ` · ${r.customer}` : ""} · {r.complexity} ·{" "}
                    {r.updatedAt.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </span>
                <PriorityChip priority={r.priority} />
                <StatusChip status={r.status} />
              </Link>
            </li>
          ))}
          {rows.length === 0 && (
            <li className="py-10 text-center text-sm text-zinc-400">
              {status ? `没有「${STATUS_LABEL[status] ?? status}」状态的需求` : "暂无需求"}
            </li>
          )}
        </ul>
      </div>
    </main>
  );
}
