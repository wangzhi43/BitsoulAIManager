import { prisma } from "@/lib/db";
import { isDemoMode, DEMO } from "@/lib/demo";
import { InboxWorkbench, type ConvView, type SourceView } from "./ui";
import { PageShell } from "@/components/ui";

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

  const convViews: ConvView[] = convs;
  const sourceViews: SourceView[] = sources.map((s) => ({
    id: s.id,
    channel: s.channel,
    who: s.who,
    createdAtText: s.createdAt.toLocaleString("zh-CN", { hour12: false }),
    requirements: s.requirements,
  }));

  return (
    <PageShell>
      <InboxWorkbench convs={convViews} sources={sourceViews} />
    </PageShell>
  );
}
