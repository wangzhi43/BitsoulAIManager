import { prisma } from "@/lib/db";
import { isDemoMode, DEMO } from "@/lib/demo";
import { dailyBranchName } from "@/lib/git";
import { parseBranchSummary, type BranchSummary } from "@/lib/branch-summary";
import { PageShell, PageHeader, DemoNote } from "@/components/ui";
import { ReviewCenter, RefreshDiffButton, type BranchOption, type BranchDetail, type ReqRow } from "./ui";
import type { BuildsProps } from "./builds";

export const dynamic = "force-dynamic";

// 分支审查（设计画布「分支审查」画板）：真实 diff（DailyBranch.reviewSummary）+ 合并条件清单 + 待验收 + 冲突处理

export default async function BranchesPage({ searchParams }: { searchParams: Promise<{ branch?: string }> }) {
  const { branch: branchParam } = await searchParams;
  const demo = await isDemoMode();

  let options: BranchOption[];
  let detail: BranchDetail | null = null;
  let missingToday: { id: string; name: string }[] = [];
  let builds: BuildsProps | null = null;

  if (demo) {
    const today = `daily/${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`;
    options = DEMO.branches.map((b) => ({ id: b.id, project: b.project, name: b.name, mergedToMain: b.mergedToMain, date: new Date().toISOString() }));
    const sel = DEMO.branches.find((b) => b.id === branchParam) ?? DEMO.branches[0];
    const summary: BranchSummary = {
      refreshedAt: new Date(Date.now() - 600_000).toISOString(),
      baseCommit: "a1b2c3d",
      headCommit: "e7f3a9b",
      totals: { commits: 7, files: 7, insertions: 235, deletions: 36 },
      commits: [
        { sha: "e7f3a9b", message: "feat(list): paginate customers by 20 with infinite scroll", author: "dev-agent-1", date: new Date(Date.now() - 2 * 3600_000).toISOString(), reqSeq: 95 },
        { sha: "9c1d4ef", message: "fix(upload): normalize EXIF orientation before preview", author: "dev-agent-1", date: new Date(Date.now() - 3 * 3600_000).toISOString(), reqSeq: 96 },
        { sha: "3b2a7c1", message: "docs: update dev-log.md", author: "bitsoul-pm-bot", date: new Date(Date.now() - 3.5 * 3600_000).toISOString(), reqSeq: null },
      ],
      perRequirement: sel.requirements.map((r, i) => ({ seq: r.seq, featureBranch: `feature/REQ-${r.seq}`, mergeSha: r.conflict ? null : `m${r.seq}f${i}`, files: r.conflict ? 0 : 4 - i, insertions: r.conflict ? 0 : 182 - i * 70, deletions: r.conflict ? 0 : 23 - i * 7, changedFiles: r.conflict ? [] : ["src/app/customers/page.tsx", "src/lib/api.ts"] })),
    };
    builds = {
      projectId: "demo-p1",
      projectName: sel.project,
      branch: sel.name,
      buildCommand: "npm ci && npm run build && cp -r dist $BUILD_OUT/",
      builds: [{ id: "demo-build-1", status: "SUCCESS", branch: sel.name, createdAt: new Date(Date.now() - 3600_000).toISOString(), finishedAt: new Date(Date.now() - 3000_000).toISOString(), artifactName: `${sel.project}-${sel.name.replace("/", "_")}-e7f3a9b.tar.gz`, artifactSize: 18_400_000, hasArtifact: true, requirementSeqs: [95, 96], sentTo: [] }],
      requirementIds: sel.requirements.map((r) => r.id),
      bindings: [{ convId: "wxid_demo_88", convName: "王总（民生理财）", customerName: "民生理财" }],
      demo: true,
    };
    detail = {
      id: sel.id,
      project: sel.project,
      name: sel.name === today ? today : sel.name,
      mergedToMain: sel.mergedToMain,
      mergedAt: sel.mergedAt ? sel.mergedAt.toISOString() : null,
      createdAt: new Date(Date.now() - 10 * 3600_000).toISOString(),
      summary,
      requirements: sel.requirements.map(
        (r): ReqRow => ({
          id: r.id,
          seq: r.seq,
          title: r.title,
          status: r.status,
          agent: r.agent,
          featureBranch: `feature/REQ-${r.seq}`,
          devStatus: r.conflict ? "CONFLICT" : "MERGED",
          submitNote: r.submitNote,
          report: r.reports[0] ? { conclusion: r.reports[0].conclusion, passRate: r.reports[0].passRate } : null,
          conflictFiles: r.conflict ? ["audio/recorder.ts"] : [],
        }),
      ),
    };
  } else {
    const [branches, projects] = await Promise.all([
      prisma.dailyBranch.findMany({ include: { project: { select: { id: true, name: true, active: true } } }, orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 14 }),
      prisma.project.findMany({ where: { active: true }, select: { id: true, name: true } }),
    ]);
    options = branches.map((b) => ({ id: b.id, project: b.project.name, name: b.name, mergedToMain: b.mergedToMain, date: b.date.toISOString() }));
    const todayName = dailyBranchName(new Date());
    missingToday = projects.filter((p) => !branches.some((b) => b.projectId === p.id && b.name === todayName));

    const sel = branches.find((b) => b.id === branchParam) ?? branches.find((b) => !b.mergedToMain) ?? branches[0] ?? null;
    if (sel) {
      const reqs = await prisma.requirement.findMany({
        where: { dailyBranchId: sel.id },
        include: {
          devTask: { select: { status: true, submitNote: true, claimedBy: { select: { username: true } } } },
          testTasks: { include: { report: { select: { conclusion: true, passRate: true, createdAt: true } } }, orderBy: { createdAt: "asc" } },
          events: { where: { note: { contains: "合并冲突" } }, orderBy: { createdAt: "desc" }, take: 1, select: { note: true } },
        },
        orderBy: { seq: "asc" },
      });
      const [runs, bindings] = await Promise.all([
        prisma.buildRun.findMany({ where: { projectId: sel.projectId, branch: sel.name }, orderBy: { createdAt: "desc" }, take: 10 }),
        prisma.wechatBinding.findMany({ where: { paused: false, OR: [{ projectId: sel.projectId }, { projectId: null }] }, select: { convId: true, convName: true, customerName: true } }),
      ]);
      const seqById = new Map(reqs.map((r) => [r.id, r.seq]));
      builds = {
        projectId: sel.projectId,
        projectName: sel.project.name,
        branch: sel.name,
        buildCommand: (await prisma.project.findUnique({ where: { id: sel.projectId }, select: { buildCommand: true } }))?.buildCommand ?? null,
        builds: runs.map((b) => ({
          id: b.id,
          status: b.status,
          branch: b.branch,
          createdAt: b.createdAt.toISOString(),
          finishedAt: b.finishedAt?.toISOString() ?? null,
          artifactName: b.artifactName,
          artifactSize: b.artifactSize,
          hasArtifact: !!b.artifactPath,
          requirementSeqs: b.requirementIds.map((id) => seqById.get(id)).filter((x): x is number => x != null),
          sentTo: ((b.sentTo as { convId: string; at: string }[] | null) ?? []),
        })),
        requirementIds: reqs.filter((r) => r.devTask?.status === "MERGED").map((r) => r.id),
        bindings,
        demo: false,
      };
      detail = {
        id: sel.id,
        project: sel.project.name,
        name: sel.name,
        mergedToMain: sel.mergedToMain,
        mergedAt: sel.mergedAt?.toISOString() ?? null,
        createdAt: sel.createdAt.toISOString(),
        summary: parseBranchSummary(sel.reviewSummary),
        requirements: reqs.map((r): ReqRow => {
          const rep = [...r.testTasks].reverse().map((t) => t.report).find(Boolean) ?? null;
          const conflictNote = r.devTask?.status === "CONFLICT" ? r.events[0]?.note ?? "" : "";
          return {
            id: r.id,
            seq: r.seq,
            title: r.title,
            status: r.status,
            agent: r.devTask?.claimedBy?.username ?? null,
            featureBranch: r.featureBranch,
            devStatus: r.devTask?.status ?? null,
            submitNote: r.devTask?.submitNote ?? null,
            report: rep ? { conclusion: rep.conclusion, passRate: rep.passRate } : null,
            conflictFiles: conflictNote.replace(/^.*?：/, "").split(/,\s*/).filter(Boolean),
          };
        }),
      };
    }
  }

  return (
    <PageShell>
      <PageHeader title="分支审查" subtitle="每晚：核对变更 → 验收 → 合并 main" actions={detail && <RefreshDiffButton branchId={detail.id} demo={demo} />} />
      {demo && <DemoNote />}
      <ReviewCenter options={options} detail={detail} missingToday={missingToday} demo={demo} builds={builds} />
    </PageShell>
  );
}
