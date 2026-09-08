import Link from "next/link";
import { prisma } from "@/lib/db";
import { PageShell, PageHeader, Panel, Table, EmptyRow, Chip, fmtDateTime } from "@/components/ui";
import { actorLabel } from "@/components/status";
import { ProjectsTab, ProvidersTab, RolesTab } from "./ui";
import { SystemTab, ContextEditor } from "./ui-system";
import { WechatTab } from "./ui-wechat";

export const dynamic = "force-dynamic";

// 设置（设计画布「设置」画板）：左侧页签 = 项目 / LLM 供应商 / 专家模型 / 微信采集 / 系统参数 / 操作审计

const TABS = [
  { key: "projects", label: "项目" },
  { key: "llm", label: "LLM 供应商" },
  { key: "roles", label: "专家模型" },
  { key: "wechat", label: "微信采集" },
  { key: "system", label: "系统参数" },
  { key: "audit", label: "操作审计" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab: tabParam } = await searchParams;
  const tab: TabKey = (TABS.find((t) => t.key === tabParam)?.key ?? "projects") as TabKey;

  const [projects, providers, roleConfigs, bindings, botSeen, auditLogs, reqCounts, branchCounts, outboxPending, outboxFailed] = await Promise.all([
    prisma.project.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.llmProvider.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.agentRoleModelConfig.findMany(),
    prisma.wechatBinding.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.systemConfig.findUnique({ where: { key: "wechatBotLastSeen" } }),
    tab === "audit" ? prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 100 }) : Promise.resolve([]),
    prisma.requirement.groupBy({ by: ["projectId"], _count: true }),
    prisma.dailyBranch.groupBy({ by: ["projectId"], _count: true }),
    tab === "wechat" ? prisma.wechatOutbox.findMany({ where: { sentAt: null, failedAt: null }, orderBy: { createdAt: "asc" }, take: 30 }) : Promise.resolve([]),
    tab === "wechat" ? prisma.wechatOutbox.findMany({ where: { sentAt: null, failedAt: { not: null } }, orderBy: { failedAt: "desc" }, take: 30 }) : Promise.resolve([]),
  ]);
  const reqCount = new Map(reqCounts.map((r) => [r.projectId, r._count]));
  const branchCount = new Map(branchCounts.map((b) => [b.projectId, b._count]));

  const projectViews = projects.map((p) => ({
    id: p.id,
    name: p.name,
    repoUrl: p.repoUrl,
    mainBranch: p.mainBranch,
    docsDir: p.docsDir,
    description: p.description,
    buildCommand: p.buildCommand,
    active: p.active,
    requirements: reqCount.get(p.id) ?? 0,
    branches: branchCount.get(p.id) ?? 0,
  }));
  const providerViews = providers.map((p) => ({ id: p.id, name: p.name, kind: p.kind, baseUrl: p.baseUrl, models: p.models as string[], enabled: p.enabled, createdAt: p.createdAt.toISOString() }));

  return (
    <PageShell>
      <PageHeader title="设置" subtitle="项目 · LLM · 微信 · 系统参数" />
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:gap-5">
        <nav className="flex shrink-0 gap-1 overflow-x-auto xl:w-[180px] xl:flex-col">
          {TABS.map((t) => (
            <Link key={t.key} href={`/settings?tab=${t.key}`} className={`whitespace-nowrap rounded-md px-3 py-2 text-[13px] ${t.key === tab ? "bg-accent-soft font-medium text-accent" : "text-ink-2 hover:bg-surface hover:text-ink"}`}>
              {t.label}
            </Link>
          ))}
        </nav>
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {tab === "projects" && (
            <>
              <ProjectsTab projects={projectViews} />
              <ContextEditor projects={projectViews.filter((p) => p.active).map((p) => ({ id: p.id, name: p.name }))} />
            </>
          )}
          {tab === "llm" && <ProvidersTab providers={providerViews} />}
          {tab === "roles" && <RolesTab providers={providerViews} roleConfigs={roleConfigs.map((c) => ({ role: c.role, providerId: c.providerId, model: c.model, effort: c.effort }))} />}
          {tab === "wechat" && (
            <WechatTab
              bindings={bindings.map((b) => ({ id: b.id, convId: b.convId, convName: b.convName, projectId: b.projectId, customerName: b.customerName, captureMode: b.captureMode, paused: b.paused, pushDailyReport: b.pushDailyReport, createdAt: b.createdAt.toISOString() }))}
              projects={projectViews.filter((p) => p.active).map((p) => ({ id: p.id, name: p.name }))}
              botLastSeen={botSeen?.value ?? null}
              outbox={{
                pending: outboxPending.map((o) => ({ id: o.id, convId: o.convId, content: o.content, createdAt: o.createdAt.toISOString(), attempts: o.attempts, lastError: o.lastError })),
                failed: outboxFailed.map((o) => ({ id: o.id, convId: o.convId, content: o.content, createdAt: o.createdAt.toISOString(), attempts: o.attempts, lastError: o.lastError })),
              }}
            />
          )}
          {tab === "system" && <SystemTab />}
          {tab === "audit" && (
            <Panel title="操作审计" pad={false} extra={<span className="text-[12px] text-ink-3">最近 100 条</span>}>
              <Table head={["时间", "操作人", "动作", "对象", "详情"]} dense>
                {auditLogs.map((a) => (
                  <tr key={a.id}>
                    <td className="num whitespace-nowrap text-[12px] text-ink-3">{fmtDateTime(a.createdAt)}</td>
                    <td className="text-[12px] text-ink-2">{actorLabel(a.actor)}</td>
                    <td>
                      <Chip tone="outline">{a.action}</Chip>
                    </td>
                    <td className="font-mono text-[12px] text-ink-2">{a.target ?? "—"}</td>
                    <td className="max-w-[420px] truncate text-[12px] text-ink-3" title={a.detail ?? undefined}>
                      {a.detail ?? "—"}
                    </td>
                  </tr>
                ))}
                {auditLogs.length === 0 && <EmptyRow colSpan={5}>暂无记录</EmptyRow>}
              </Table>
            </Panel>
          )}
        </div>
      </div>
    </PageShell>
  );
}
