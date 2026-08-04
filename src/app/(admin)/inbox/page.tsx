import { prisma } from "@/lib/db";
import { isDemoMode, DEMO } from "@/lib/demo";
import { ImportForm } from "./ui";

export const dynamic = "force-dynamic";

interface ConvRow {
  convId: string;
  convName: string | null;
  count: number;
}
interface SourceRow {
  id: string;
  channel: string;
  who: string;
  createdAt: Date;
  requirements: { seq: number; title: string; status: string }[];
}

export default async function InboxPage() {
  const demo = await isDemoMode();

  let convs: ConvRow[];
  let sources: SourceRow[];

  if (demo) {
    convs = DEMO.inbox.pendingConvs.map((c) => ({ convId: c.convId, convName: c.convName, count: c.count }));
    sources = DEMO.inbox.sources.map((s) => ({
      id: s.id,
      channel: s.channel,
      who: s.who,
      createdAt: s.createdAt,
      requirements: s.requirements,
    }));
  } else {
    const [pendingByConv, recentSources] = await Promise.all([
      prisma.inboxMessage.groupBy({
        by: ["convId", "convName"],
        where: { threadedAt: null },
        _count: true,
      }),
      prisma.requirementSource.findMany({
        include: { requirements: { select: { seq: true, title: true, status: true } } },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
    ]);
    convs = pendingByConv.map((c) => ({ convId: c.convId, convName: c.convName, count: c._count }));
    sources = recentSources.map((s) => ({
      id: s.id,
      channel: s.channel,
      who: s.customerName ?? s.senderName ?? "未知来源",
      createdAt: s.createdAt,
      requirements: s.requirements,
    }));
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-5 sm:px-6">
      <section>
        <h1 className="mb-3 text-2xl font-semibold tracking-tight">手动导入需求</h1>
        <ImportForm />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium text-zinc-500">聚合中的微信消息</h2>
        {convs.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-zinc-300 py-6 text-center text-sm text-zinc-400 dark:border-zinc-700">
            暂无待聚合消息
          </p>
        ) : (
          <ul className="space-y-2">
            {convs.map((c) => (
              <li
                key={c.convId}
                className="flex items-center justify-between rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
              >
                <span className="font-medium">{c.convName ?? c.convId}</span>
                <span className="text-xs text-zinc-400">{c.count} 条消息等待窗口关闭</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium text-zinc-500">最近需求线索</h2>
        <ul className="space-y-2">
          {sources.map((s) => (
            <li
              key={s.id}
              className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="flex items-center justify-between">
                <span className="text-zinc-600 dark:text-zinc-300">
                  <span
                    className={`mr-1.5 rounded-md px-1.5 py-0.5 text-[11px] ${
                      s.channel === "WECHAT"
                        ? "bg-green-100 text-green-700 dark:bg-green-950/60 dark:text-green-400"
                        : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                    }`}
                  >
                    {s.channel === "WECHAT" ? "微信" : "手动"}
                  </span>
                  {s.who}
                </span>
                <span className="text-xs text-zinc-400">{s.createdAt.toLocaleString("zh-CN")}</span>
              </div>
              {s.requirements.length === 0 ? (
                <p className="mt-1.5 text-xs text-zinc-400">拆解中…（worker 处理后生成需求单）</p>
              ) : (
                <ul className="mt-1.5 space-y-0.5">
                  {s.requirements.map((r) => (
                    <li key={r.seq} className="text-xs text-zinc-500">
                      <span className="font-mono text-zinc-400">REQ-{r.seq}</span> {r.title}
                      <span className="ml-1.5 rounded bg-zinc-100 px-1 py-px text-[10px] text-zinc-400 dark:bg-zinc-800">
                        {r.status}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
          {sources.length === 0 && (
            <p className="rounded-2xl border border-dashed border-zinc-300 py-6 text-center text-sm text-zinc-400 dark:border-zinc-700">
              暂无线索
            </p>
          )}
        </ul>
      </section>
    </main>
  );
}
