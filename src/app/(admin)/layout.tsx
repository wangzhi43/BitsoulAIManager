import { redirect } from "next/navigation";
import { currentAdmin } from "@/lib/auth";
import { isDemoMode } from "@/lib/demo";
import { AutoRefresh } from "@/components/AutoRefresh";
import { BottomNav } from "@/components/BottomNav";
import { DemoBanner } from "@/components/DemoControls";

export const dynamic = "force-dynamic";

// 管理端外壳：鉴权 + 底部导航（手机优先，管理员高频用手机审批）
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await currentAdmin();
  if (!admin) redirect("/login");
  const demo = await isDemoMode();

  return (
    <div className={`min-h-dvh bg-zinc-100/70 pb-20 dark:bg-zinc-950 ${demo ? "pt-8" : ""}`}>
      <AutoRefresh />
      {demo && <DemoBanner />}
      {children}
      <BottomNav />
    </div>
  );
}
