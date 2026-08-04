import { prisma } from "@/lib/db";
import { isDemoMode, DEMO } from "@/lib/demo";
import { PageShell, PageHeader, StatStrip, Panel } from "@/components/ui";
import { Donut, VBars, CHART_COLORS } from "@/components/charts";
import { ConfirmList } from "./ui";

export const dynamic = "force-dynamic";

// 待确认队列：满屏布局 = 左侧确认卡片区（2/3）+ 右侧统计栏（1/3）
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

  // 派生统计
  const withClarify = items.filter((i) => i.clarifications.length > 0).length;
  const fromWechat = items.filter((i) => i.source.channel === "WECHAT").length;
  const unassigned = items.filter((i) => !i.projectId).length;
  const byComplexity = ["S", "M", "L"].map((c) => ({
    label: c,
    value: items.filter((i) => i.complexity === c).length,
  }));
  const byCustomer = new Map<string, number>();
  items.forEach((i) => {
    const k = i.source.customer ?? (i.source.channel === "WECHAT" ? "微信客户" : "内部");
    byCustomer.set(k, (byCustomer.get(k) ?? 0) + 1);
  });

  return (
    <PageShell>
      <PageHeader
        title={<>需求确认 <span className="text-base font-normal text-zinc-400">（{items.length}）</span></>}
        subtitle="产品专家拆解后的需求单在此确认后进入待开发池"
      />
      <StatStrip
        items={[
          { label: "待确认需求", value: items.length, tone: items.length > 0 ? "indigo" : "default", sub: "确认后进入待开发池" },
          { label: "带澄清问题", value: withClarify, tone: withClarify > 0 ? "amber" : "default", sub: "建议先向客户确认" },
          { label: "微信来源", value: fromWechat, sub: `手动导入 ${items.length - fromWechat}` },
          { label: "未指定项目", value: unassigned, tone: unassigned > 0 ? "red" : "default", sub: "确认时必须选择项目" },
        ]}
      />

      <div className="grid gap-3 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <ConfirmList items={items} projects={projects} />
        </div>
        <div className="space-y-3">
          <Panel title="来源分布">
            {items.length > 0 ? (
              <Donut
                data={[...byCustomer.entries()].map(([name, value], i) => ({
                  name,
                  value,
                  color: CHART_COLORS[i % CHART_COLORS.length],
                }))}
                centerLabel="待确认"
                size={116}
              />
            ) : (
              <p className="py-4 text-center text-xs text-zinc-400">暂无数据</p>
            )}
          </Panel>
          <Panel title="复杂度分布">
            <VBars data={byComplexity} color={CHART_COLORS[0]} valueLabel={(v) => String(v)} height={110} />
          </Panel>
          <Panel title="操作说明">
            <ul className="space-y-2 text-xs text-zinc-500">
              <li className="flex gap-2"><span className="text-green-600">确认</span>需求进入待开发池，项管 Agent 自动排优先级</li>
              <li className="flex gap-2"><span className="text-zinc-600 dark:text-zinc-300">编辑</span>调整标题、用户故事与验收标准后再确认</li>
              <li className="flex gap-2"><span className="text-red-500">驳回</span>关闭本单；「驳回重拆」会把整个线索连同原因交回产品专家重新拆分</li>
              <li className="flex gap-2"><span className="text-indigo-600">多选合并</span>把多个相关单合成一个（第一个所选为目标）</li>
            </ul>
          </Panel>
        </div>
      </div>
    </PageShell>
  );
}
