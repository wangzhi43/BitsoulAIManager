import { prisma } from "@/lib/db";
import { SettingsUI } from "./ui";
import { WechatSection } from "./ui-wechat";
import { PageShell, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [projects, providers, roleConfigs, bindings, botSeen] = await Promise.all([
    prisma.project.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.llmProvider.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.agentRoleModelConfig.findMany(),
    prisma.wechatBinding.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.systemConfig.findUnique({ where: { key: "wechatBotLastSeen" } }),
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
          }))}
          projects={projects.filter((p) => p.active).map((p) => ({ id: p.id, name: p.name }))}
          botLastSeen={botSeen?.value ?? null}
        />
      </div>
      </div>
    </PageShell>
  );
}
