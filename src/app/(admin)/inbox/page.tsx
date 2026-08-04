import { prisma } from "@/lib/db";
import { ImportForm } from "./ui";

export const dynamic = "force-dynamic";

// 采集箱：待聚合消息 + 最近需求线索 + 手动导入
export default async function InboxPage() {
  const [pendingByConv, recentSources] = await Promise.all([
    prisma.inboxMessage.groupBy({
      by: ["convId", "convName"],
      where: { threadedAt: null },
      _count: true,
      _max: { ts: true },
    }),
    prisma.requirementSource.findMany({
      include: { requirements: { select: { seq: true, title: true, status: true } } },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <section>
        <h1 className="mb-3 text-xl font-semibold">手动导入需求</h1>
        <ImportForm />
      </section>

      <section>
        <h2 className="mb-2 font-medium">聚合中的微信消息</h2>
        {pendingByConv.length === 0 ? (
          <p className="text-sm opacity-50">暂无待聚合消息</p>
        ) : (
          <ul className="space-y-2">
            {pendingByConv.map((c) => (
              <li
                key={c.convId}
                className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-900"
              >
                <span>{c.convName ?? c.convId}</span>
                <span className="opacity-60">{c._count} 条消息等待窗口关闭</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 font-medium">最近需求线索</h2>
        <ul className="space-y-2">
          {recentSources.map((s) => (
            <li
              key={s.id}
              className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="flex items-center justify-between">
                <span className="opacity-70">
                  {s.channel === "WECHAT" ? "微信" : "手动"} · {s.customerName ?? s.senderName ?? "未知来源"}
                </span>
                <span className="text-xs opacity-50">{s.createdAt.toLocaleString("zh-CN")}</span>
              </div>
              {s.requirements.length === 0 ? (
                <p className="mt-1 text-xs opacity-50">拆解中…（worker 处理后生成需求单）</p>
              ) : (
                <ul className="mt-1 space-y-0.5">
                  {s.requirements.map((r) => (
                    <li key={r.seq} className="text-xs">
                      <span className="font-mono opacity-50">REQ-{r.seq}</span> {r.title}
                      <span className="ml-1 opacity-50">[{r.status}]</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
          {recentSources.length === 0 && <p className="text-sm opacity-50">暂无线索</p>}
        </ul>
      </section>
    </main>
  );
}
