import { prisma } from "@/lib/db";
import { SettingsUI } from "./ui";
import { WechatSection } from "./ui-wechat";
import { PageShell, PageHeader, Panel, Chip } from "@/components/ui";
import { SystemConfigPanel, ContextEditor } from "./ui-system";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [projects, providers, roleConfigs, bindings, botSeen, sysRows, auditLogs] = await Promise.all([
    prisma.project.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.llmProvider.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.agentRoleModelConfig.findMany(),
    prisma.wechatBinding.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.systemConfig.findUnique({ where: { key: "wechatBotLastSeen" } }),
    prisma.systemConfig.findMany({ where: { key: { in: ["dailyTokenLimit", "aggWindowMinutes", "claimTimeoutHours"] } } }),
    prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 30 }),
  ]);

  return (
    <PageShell>
      <PageHeader title="设置" subtitle="项目、LLM 供应商与专家模型、微信采集配置" />
      <div className="grid items-start gap-4 xl:grid-cols-2">
      <SettingsUI
        projects={projects.map((p) => ({
          id: p.id,
          name: p.name,
          repoUrl: p.repoUrl,
          active: p.active,
          description: p.description,
        }))}
        providers={providers.map((p) => ({
          id: p.id,
          name: p.name,
          kind: p.kind,
          baseUrl: p.baseUrl,
          models: p.models as string[],
          enabled: p.enabled,
        }))}
        roleConfigs={roleConfigs.map((c) => ({
          role: c.role,
          providerId: c.providerId,
          model: c.model,
          effort: c.effort,
        }))}
      />
      <div>
        <WechatSection
          bindings={bindings.map((b) => ({
            id: b.id,
            convId: b.convId,
            convName: b.convName,
            projectId: b.projectId,
            customerName: b.customerName,
            captureMode: b.captureMode,
            paused: b.paused,
            pushDailyReport: b.pushDailyReport,
          }))}
          projects={projects.filter((p) => p.active).map((p) => ({ id: p.id, name: p.name }))}
          botLastSeen={botSeen?.value ?? null}
        />
      </div>
      <ContextEditor projects={projects.filter((p) => p.active).map((p) => ({ id: p.id, name: p.name }))} />
      <SystemConfigPanel config={Object.fromEntries(sysRows.map((r) => [r.key, r.value]))} />
      <Panel title="操作审计" extra={<span className="text-[11px] text-slate-400">最近 30 条</span>} className="xl:col-span-2">
        <ul className="divide-y divide-slate-100">
          {auditLogs.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-2 py-2 transition-colors hover:bg-slate-50">
              <span className="text-[11px] tabular-nums text-slate-400">{a.createdAt.toLocaleString("zh-CN")}</span>
              <Chip tone="slate">{a.action}</Chip>
              {a.target && <span className="font-mono text-[12px] text-slate-500">{a.target}</span>}
              {a.detail && <span className="text-[12px] text-slate-400">{a.detail}</span>}
              <span className="ml-auto text-[11px] text-slate-300">{a.actor}</span>
            </li>
          ))}
          {auditLogs.length === 0 && <li className="py-4 text-center text-[12px] text-slate-400">暂无记录</li>}
        </ul>
      </Panel>
      </div>
    </PageShell>
  );
}
