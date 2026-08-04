import { redirect } from "next/navigation";
import { currentAdmin } from "@/lib/auth";
import { isDemoMode } from "@/lib/demo";
import { AutoRefresh } from "@/components/AutoRefresh";
import { BottomNav } from "@/components/BottomNav";
import { Sidebar } from "@/components/Sidebar";
import { DemoBanner } from "@/components/DemoControls";

export const dynamic = "force-dynamic";

// 管理端外壳：桌面侧边栏 + 移动端底部导航（管理员高频用手机审批、桌面晚间复盘）
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await currentAdmin();
  if (!admin) redirect("/login");
  const demo = await isDemoMode();

  return (
    <div className={`min-h-dvh bg-zinc-100/70 dark:bg-zinc-950 ${demo ? "pt-8" : ""}`}>
      <AutoRefresh />
      {demo && <DemoBanner />}
      <div className="flex">
        <Sidebar />
        <div className="min-w-0 flex-1 pb-20 lg:pb-6">{children}</div>
      </div>
      <div className="lg:hidden">
        <BottomNav />
      </div>
    </div>
  );
}
