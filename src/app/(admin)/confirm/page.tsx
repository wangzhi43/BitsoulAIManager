import { prisma } from "@/lib/db";
import { isDemoMode, DEMO } from "@/lib/demo";
import { ConfirmList } from "./ui";

export const dynamic = "force-dynamic";

// 待确认队列：管理员手机端主战场
export default async function ConfirmPage() {
  const demo = await isDemoMode();

  let items;
  let projects: { id: string; name: string }[];

  if (demo) {
    items = DEMO.confirmItems;
    projects = DEMO.dashboard.projects.map((p) => ({ id: p.id, name: p.name }));
  } else {
    const [requirements, dbProjects] = await Promise.all([
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
    items = requirements.map((r) => ({
      id: r.id,
      seq: r.seq,
      title: r.title,
      userStory: r.userStory,
      acceptance: r.acceptance as string[],
      complexity: r.complexity as string,
      projectId: r.projectId,
      projectName: r.project?.name ?? null,
      clarifications: (r.clarifications as { question: string; answer: string | null }[] | null) ?? [],
      source: {
        channel: r.source.channel as string,
        sender: r.source.senderName,
        customer: r.source.customerName,
      },
    }));
    projects = dbProjects;
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-5 sm:px-6">
      <h1 className="mb-4 text-2xl font-semibold tracking-tight">
        待确认 <span className="text-base font-normal text-zinc-400">（{items.length}）</span>
      </h1>
      <ConfirmList items={items} projects={projects} />
    </main>
  );
}
