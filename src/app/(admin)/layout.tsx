import { redirect } from "next/navigation";
import { currentAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isDemoMode } from "@/lib/demo";
import { AutoRefresh } from "@/components/AutoRefresh";
import { BottomNav } from "@/components/BottomNav";
import { Sidebar } from "@/components/Sidebar";
import { DemoBanner } from "@/components/DemoControls";
import { ToastProvider } from "@/components/ui-client";

export const dynamic = "force-dynamic";

// 管理端外壳：桌面藏青侧栏（分组导航 + 徽标）+ 手机底部导航 + Toast + SSE 刷新

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await currentAdmin();
  if (!admin) redirect("/login");
  const demo = await isDemoMode();

  let badges = { confirm: 0, branches: 0 };
  if (demo) {
    badges = { confirm: 4, branches: 1 };
  } else {
    const [confirm, branches] = await Promise.all([
      prisma.requirement.count({ where: { status: "PENDING_CONFIRM" } }),
      prisma.devTask.count({ where: { status: "CONFLICT" } }),
    ]);
    badges = { confirm, branches };
  }

  return (
    <ToastProvider>
      <div className={`min-h-dvh ${demo ? "pt-8" : ""}`}>
        <AutoRefresh />
        {demo && <DemoBanner />}
        <div className="flex">
          <Sidebar adminName={admin.displayName ?? "管理员"} username={admin.username} badges={badges} />
          <div className="min-w-0 flex-1 pb-20 lg:pb-0">{children}</div>
        </div>
        <BottomNav confirmCount={badges.confirm} />
      </div>
    </ToastProvider>
  );
}
