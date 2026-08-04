import { prisma } from "@/lib/db";
import { SettingsUI } from "./ui";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [projects, providers, roleConfigs] = await Promise.all([
    prisma.project.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.llmProvider.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.agentRoleModelConfig.findMany(),
  ]);

  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-6">
      <h1 className="mb-4 text-xl font-semibold">设置</h1>
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
    </main>
  );
}
