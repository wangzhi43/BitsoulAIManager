import { redirect } from "next/navigation";
import { currentAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// 全局看板骨架（M5 完善）：项目健康度卡片
export default async function DashboardPage() {
  const admin = await currentAdmin();
  if (!admin) redirect("/login");

  const projects = await prisma.project.findMany({ orderBy: { createdAt: "asc" } });
  const counts = await prisma.requirement.groupBy({
    by: ["projectId", "status"],
    _count: true,
  });

  function count(projectId: string, statuses: string[]) {
    return counts
      .filter((c) => c.projectId === projectId && statuses.includes(c.status))
      .reduce((s, c) => s + c._count, 0);
  }

  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-6">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">全局看板</h1>
          <p className="text-sm opacity-60">你好，{admin.displayName}</p>
        </div>
        <form action="/api/admin/logout" method="post">
          <button className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700">
            退出
          </button>
        </form>
      </header>

      <section className="grid gap-3 sm:grid-cols-2">
        {projects.map((p) => (
          <div
            key={p.id}
            className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-medium">{p.name}</h2>
              <span
                className={`rounded-full px-2 py-0.5 text-xs ${
                  p.active
                    ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                    : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800"
                }`}
              >
                {p.active ? "活跃" : "未启用"}
              </span>
            </div>
            <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
              <div>
                <dt className="opacity-50">待确认</dt>
                <dd className="text-lg font-semibold">{count(p.id, ["PENDING_CONFIRM"])}</dd>
              </div>
              <div>
                <dt className="opacity-50">进行中</dt>
                <dd className="text-lg font-semibold">
                  {count(p.id, ["READY", "DEVELOPING", "PENDING_TEST", "TESTING"])}
                </dd>
              </div>
              <div>
                <dt className="opacity-50">待验收</dt>
                <dd className="text-lg font-semibold">{count(p.id, ["PENDING_ACCEPT"])}</dd>
              </div>
            </dl>
          </div>
        ))}
        {projects.length === 0 && (
          <p className="text-sm opacity-60">尚无项目。运行 `npm run seed` 初始化。</p>
        )}
      </section>
    </main>
  );
}
