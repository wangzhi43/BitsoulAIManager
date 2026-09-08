"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./icons";

// 手机端底部导航：5 个入口（设计规则 6）

const TABS: { href: string; label: string; icon: IconName; group?: string[] }[] = [
  { href: "/dashboard", label: "工作台", icon: "grid" },
  { href: "/confirm", label: "待确认", icon: "check" },
  { href: "/pools", label: "看板", icon: "kanban" },
  { href: "/branches", label: "审查", icon: "branch" },
  { href: "/more", label: "更多", icon: "more", group: ["/inbox", "/requirements", "/agents", "/reports", "/settings"] },
];

export function BottomNav({ confirmCount = 0 }: { confirmCount?: number }) {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
      <div className="flex">
        {TABS.map((t) => {
          const active = pathname === t.href || pathname.startsWith(t.href + "/") || (t.group?.some((g) => pathname.startsWith(g)) ?? false);
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`relative flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 text-[10px] ${active ? "font-medium text-accent" : "text-ink-3"}`}
            >
              <Icon name={t.icon} size={20} />
              {t.label}
              {t.href === "/confirm" && confirmCount > 0 && (
                <span className="num absolute right-[calc(50%-20px)] top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-medium text-white">
                  {confirmCount > 99 ? "99+" : confirmCount}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
