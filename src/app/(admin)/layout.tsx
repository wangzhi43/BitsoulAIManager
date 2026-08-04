import Link from "next/link";
import { redirect } from "next/navigation";
import { currentAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

// 管理端外壳：鉴权 + 底部导航（手机优先，管理员高频用手机审批）
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await currentAdmin();
  if (!admin) redirect("/login");

  const tabs = [
    { href: "/dashboard", label: "看板", icon: "▦" },
    { href: "/confirm", label: "确认", icon: "✓" },
    { href: "/inbox", label: "采集箱", icon: "⇩" },
    { href: "/settings", label: "设置", icon: "⚙" },
  ];

  return (
    <div className="pb-20">
      {children}
      <nav className="fixed inset-x-0 bottom-0 border-t border-zinc-200 bg-white/95 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
        <div className="mx-auto flex max-w-3xl">
          {tabs.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className="flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs opacity-70 hover:opacity-100"
            >
              <span className="text-base leading-none">{t.icon}</span>
              {t.label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
