import { redirect } from "next/navigation";
import { currentAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isDemoMode } from "@/lib/demo";
import { AutoRefresh } from "@/components/AutoRefresh";
import { BottomNav } from "@/components/BottomNav";
import { Sidebar } from "@/components/Sidebar";
import { DemoBanner } from "@/components/DemoControls";

export const dynamic = "force-dynamic";

// 管理端外壳：桌面深色侧边栏（带待办徽标）+ 移动端底部导航
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
    <div className={`min-h-dvh ${demo ? "pt-8" : ""}`}>
      <AutoRefresh />
      {demo && <DemoBanner />}
      <div className="flex">
        <Sidebar adminName={admin.displayName ?? "管理员"} badges={badges} />
        <div className="min-w-0 flex-1 pb-20 lg:pb-0">{children}</div>
      </div>
      <div className="lg:hidden">
        <BottomNav />
      </div>
    </div>
  );
}
