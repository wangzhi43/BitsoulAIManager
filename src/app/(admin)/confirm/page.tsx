import { prisma } from "@/lib/db";
import { isDemoMode, DEMO } from "@/lib/demo";
import { PageShell, PageHeader, DemoNote, LinkButton } from "@/components/ui";
import { ConfirmWorkbench, type ConfirmItem } from "./ui";

export const dynamic = "force-dynamic";

// 待确认：主从布局（设计画布「待确认」画板）。左列队列可多选合并，右侧直接确认 / 编辑 / 拆分 / 驳回 / 发澄清。

interface RawMsg {
  msgId?: string;
  type?: string;
  text?: string;
  attachmentId?: string;
  ts?: string;
  sender?: string;
}

export default async function ConfirmPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id: preselect } = await searchParams;
  const demo = await isDemoMode();

  let items: ConfirmItem[];
  let projects: { id: string; name: string }[];

  if (demo) {
    items = DEMO.confirmItems.map((i, idx) => ({
      id: i.id,
      seq: i.seq,
      title: i.title,
      userStory: i.userStory,
      acceptance: i.acceptance,
      complexity: i.complexity,
      moduleGuess: idx === 0 ? "报表中心" : null,
      projectId: i.projectId,
      projectName: i.projectName,
      clarifications: i.clarifications,
      source: { channel: i.source.channel, sender: i.source.sender, customer: i.source.customer, wechat: i.source.channel === "WECHAT" },
      rawMessages: [{ sender: i.source.sender ?? "客户", ts: new Date(Date.now() - 7200_000).toISOString(), text: i.userStory.replace(/^作为.*?，我想/, "我们想") }],
      attachments: [],
      siblings: DEMO.confirmItems.filter((o) => o.id !== i.id && o.source.customer === i.source.customer && i.source.customer).map((o) => ({ id: o.id, seq: o.seq, status: "PENDING_CONFIRM" })),
      createdAtIso: new Date(Date.now() - (idx + 1) * 3600_000).toISOString(),
    }));
    projects = DEMO.dashboard.projects.map((p) => ({ id: p.id, name: p.name }));
  } else {
    const [reqs, dbProjects] = await Promise.all([
      prisma.requirement.findMany({
        where: { status: "PENDING_CONFIRM" },
        include: {
          project: { select: { id: true, name: true } },
          source: { include: { attachments: { select: { id: true, filename: true, mime: true } } } },
        },
        orderBy: { seq: "asc" },
      }),
      prisma.project.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { createdAt: "asc" } }),
    ]);
    const sourceIds = [...new Set(reqs.map((r) => r.sourceId))];
    const siblingsAll = sourceIds.length
      ? await prisma.requirement.findMany({ where: { sourceId: { in: sourceIds } }, select: { id: true, seq: true, status: true, sourceId: true } })
      : [];
    items = reqs.map((r) => {
      const msgs = (r.source.rawMessages as unknown as RawMsg[] | null) ?? [];
      const attById = new Map(r.source.attachments.map((a) => [a.id, a]));
      return {
        id: r.id,
        seq: r.seq,
        title: r.title,
        userStory: r.userStory,
        acceptance: (r.acceptance as string[]) ?? [],
        complexity: r.complexity,
        moduleGuess: r.moduleGuess,
        projectId: r.projectId,
        projectName: r.project?.name ?? null,
        clarifications: ((r.clarifications as { question: string; answer: string | null }[] | null) ?? []).filter((c) => c && c.question),
        source: {
          channel: r.source.channel,
          sender: r.source.senderName,
          customer: r.source.customerName,
          wechat: r.source.channel === "WECHAT" && !!r.source.wechatConvId,
        },
        rawMessages: msgs
          .filter((m) => m.text || m.attachmentId)
          .map((m) => ({
            sender: m.sender ?? r.source.senderName ?? "—",
            ts: m.ts ?? null,
            text: m.text ?? (m.attachmentId ? `［附件：${attById.get(m.attachmentId)?.filename ?? m.attachmentId}］` : ""),
          })),
        attachments: r.source.attachments.map((a) => ({ name: a.filename, mime: a.mime })),
        siblings: siblingsAll.filter((s) => s.sourceId === r.sourceId && s.id !== r.id).map((s) => ({ id: s.id, seq: s.seq, status: s.status })),
        createdAtIso: r.createdAt.toISOString(),
      };
    });
    projects = dbProjects;
  }

  return (
    <PageShell>
      <PageHeader
        title="待确认"
        subtitle="产品专家拆解结果 · 确认后进入待开发池"
        actions={
          <LinkButton href="/inbox#import" icon="plus" kind="primary">
            手动导入
          </LinkButton>
        }
      />
      {demo && <DemoNote />}
      <ConfirmWorkbench items={items} projects={projects} demo={demo} preselect={preselect ?? null} />
    </PageShell>
  );
}
