import { prisma } from "@/lib/db";
import { ConfirmList } from "./ui";

export const dynamic = "force-dynamic";

// 待确认队列：管理员手机端主战场
export default async function ConfirmPage() {
  const [requirements, projects] = await Promise.all([
    prisma.requirement.findMany({
      where: { status: "PENDING_CONFIRM" },
      include: {
        project: { select: { id: true, name: true } },
        source: { select: { channel: true, senderName: true, customerName: true } },
      },
      orderBy: { seq: "asc" },
    }),
    prisma.project.findMany({ where: { active: true }, select: { id: true, name: true } }),
  ]);

  const items = requirements.map((r) => ({
    id: r.id,
    seq: r.seq,
    title: r.title,
    userStory: r.userStory,
    acceptance: r.acceptance as string[],
    complexity: r.complexity,
    projectId: r.projectId,
    projectName: r.project?.name ?? null,
    clarifications: (r.clarifications as { question: string; answer: string | null }[] | null) ?? [],
    source: {
      channel: r.source.channel,
      sender: r.source.senderName,
      customer: r.source.customerName,
    },
  }));

  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-6">
      <h1 className="mb-4 text-xl font-semibold">
        待确认 <span className="text-base font-normal opacity-50">（{items.length}）</span>
      </h1>
      <ConfirmList items={items} projects={projects} />
    </main>
  );
}
