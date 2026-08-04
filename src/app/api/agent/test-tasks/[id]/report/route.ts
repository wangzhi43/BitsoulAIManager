import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiError, apiOk } from "@/lib/api";
import { authenticateAgent } from "@/lib/auth";
import { getQueues } from "@/lib/queue";
import type { Priority } from "@prisma/client";

export const dynamic = "force-dynamic";

// 测试报告提交 + 平台自动审核（TECH_DESIGN §6.3）：
// - 全部通过 → PENDING_ACCEPT（待验收）
// - FAIL/BLOCKED → 需求回 READY、DevTask 回池（复用原 feature 分支），优先级提一级
// - PASS 但未全过（部分通过）→ REVIEWING，留给管理员人工裁决
// 报告同时排队写入仓库 docs/test-reports/

const Body = z.object({
  results: z
    .array(z.object({ caseIdx: z.number().int().min(0), pass: z.boolean(), note: z.string().optional() }))
    .min(1),
  conclusion: z.enum(["PASS", "FAIL", "BLOCKED"]),
  defects: z.array(z.object({ desc: z.string(), caseIdx: z.number().int().optional() })).default([]),
});

function bumpPriority(p: Priority | null): Priority {
  if (p === "P0" || p === "P1") return "P0";
  if (p === "P2") return "P1";
  return "P2";
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const agent = await authenticateAgent(req);
  if (!agent) return apiError("unauthorized", "invalid token");
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("bad_request", parsed.error.message);
  const d = parsed.data;

  const task = await prisma.testTask.findUnique({
    where: { id },
    include: { requirement: { include: { project: true, dailyBranch: true } } },
  });
  if (!task) return apiError("not_found", "test task not found");
  if (task.claimedById !== agent.id) return apiError("forbidden", "task not claimed by you");
  if (task.status !== "CLAIMED") return apiError("conflict", `task is ${task.status}`);

  const caseCount = (task.cases as unknown[]).length;
  const passCount = d.results.filter((r) => r.pass).length;
  const passRate = Math.round((passCount / Math.max(d.results.length, 1)) * 100) / 100;
  const allPass = d.conclusion === "PASS" && passCount === d.results.length && d.results.length >= caseCount;
  const failed = d.conclusion === "FAIL" || d.conclusion === "BLOCKED";
  const requirement = task.requirement;

  const reportPath = `test-reports/REQ-${requirement.seq}-${task.id.slice(-6)}.md`;

  await prisma.$transaction(async (tx) => {
    await tx.testReport.create({
      data: {
        testTaskId: id,
        results: d.results,
        passRate,
        conclusion: d.conclusion,
        defects: d.defects,
        repoFilePath: requirement.project ? `${requirement.project.docsDir}/${reportPath}` : null,
      },
    });
    await tx.testTask.update({ where: { id }, data: { status: "DONE" } });

    if (allPass) {
      await tx.requirement.update({ where: { id: requirement.id }, data: { status: "PENDING_ACCEPT" } });
      await tx.reqEvent.create({
        data: {
          requirementId: requirement.id,
          fromStatus: "TESTING",
          toStatus: "PENDING_ACCEPT",
          actor: "system",
          note: `测试全部通过（${passCount}/${d.results.length}），自动审核通过`,
        },
      });
    } else if (failed) {
      await tx.requirement.update({
        where: { id: requirement.id },
        data: { status: "READY", priority: bumpPriority(requirement.priority) },
      });
      await tx.devTask.update({
        where: { requirementId: requirement.id },
        data: { status: "POOL", claimedById: null, claimedAt: null, lastHeartbeat: null, submittedAt: null },
      });
      await tx.reqEvent.create({
        data: {
          requirementId: requirement.id,
          fromStatus: "TESTING",
          toStatus: "READY",
          actor: "system",
          note: `测试${d.conclusion === "BLOCKED" ? "受阻" : "不通过"}（${passCount}/${d.results.length}），回待开发池并提升优先级。缺陷：${d.defects.map((x) => x.desc).join("；").slice(0, 400)}`,
        },
      });
    } else {
      await tx.requirement.update({ where: { id: requirement.id }, data: { status: "REVIEWING" } });
      await tx.reqEvent.create({
        data: {
          requirementId: requirement.id,
          fromStatus: "TESTING",
          toStatus: "REVIEWING",
          actor: "system",
          note: `部分通过（${passCount}/${d.results.length}），待管理员裁决`,
        },
      });
    }
  });

  // 报告入仓（异步）
  if (requirement.project) {
    const cases = task.cases as { step: string; expected: string; tag: string }[];
    const md = `# 测试报告 REQ-${requirement.seq}：${requirement.title}

- 结论：**${d.conclusion}**（通过率 ${(passRate * 100).toFixed(0)}%）
- 测试 Agent：${agent.username}
- 时间：${new Date().toISOString()}

| # | 用例 | 预期 | 结果 | 备注 |
|---|---|---|---|---|
${d.results
  .map((r) => {
    const c = cases[r.caseIdx];
    return `| ${r.caseIdx + 1} | ${c?.step ?? "?"} | ${c?.expected ?? "?"} | ${r.pass ? "✅" : "❌"} | ${r.note ?? ""} |`;
  })
  .join("\n")}
${d.defects.length ? `\n## 缺陷\n${d.defects.map((x) => `- ${x.desc}`).join("\n")}` : ""}
`;
    await getQueues().git.add(
      "append-docs-log",
      { kind: "append-docs-log", projectId: requirement.project.id, file: reportPath, content: md },
      { attempts: 3, backoff: { type: "exponential", delay: 20_000 } },
    );
  }

  return apiOk({
    ok: true,
    verdict: allPass ? "PENDING_ACCEPT" : failed ? "BACK_TO_POOL" : "MANUAL_REVIEW",
  });
}
