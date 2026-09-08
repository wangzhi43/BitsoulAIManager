"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./icons";

// 桌面端侧栏：三组导航 + 徽标（只给需要人处理的项）

export interface SidebarBadges {
  confirm?: number;
  branches?: number;
}

const GROUPS: { label: string; items: { href: string; label: string; icon: IconName; badge?: keyof SidebarBadges }[] }[] = [
  { label: "工作台", items: [{ href: "/dashboard", label: "工作台", icon: "grid" }] },
  {
    label: "需求",
    items: [
      { href: "/confirm", label: "待确认", icon: "check", badge: "confirm" },
      { href: "/requirements", label: "需求列表", icon: "list" },
      { href: "/inbox", label: "采集箱", icon: "inbox" },
    ],
  },
  {
    label: "交付",
    items: [
      { href: "/pools", label: "执行看板", icon: "kanban" },
      { href: "/branches", label: "分支审查", icon: "branch", badge: "branches" },
    ],
  },
  {
    label: "运营",
    items: [
      { href: "/agents", label: "智能体", icon: "bot" },
      { href: "/reports", label: "日报", icon: "chart" },
    ],
  },
  { label: "系统", items: [{ href: "/settings", label: "设置", icon: "settings" }] },
];

export function Sidebar({ adminName = "管理员", username = "admin", badges = {} }: { adminName?: string; username?: string; badges?: SidebarBadges }) {
  const pathname = usePathname();
  return (
    <aside className="sticky top-0 hidden h-dvh w-[212px] shrink-0 flex-col bg-sidebar text-white lg:flex">
      <div className="flex items-center gap-2.5 px-4 pb-3.5 pt-[18px]">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-[13px] font-bold">B</span>
        <div className="leading-[1.2]">
          <p className="text-[13px] font-semibold">BitSoul PM</p>
          <p className="text-[11px] text-sidebar-muted">AI 项目管理平台</p>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-[18px] overflow-y-auto px-3 py-1.5">
        {GROUPS.map((g) => (
          <div key={g.label} className="flex flex-col gap-0.5">
            <p className="mb-1 px-3 text-[11px] tracking-[0.06em] text-sidebar-muted">{g.label}</p>
            {g.items.map((it) => {
              const active = pathname === it.href || pathname.startsWith(it.href + "/");
              const n = it.badge ? badges[it.badge] : undefined;
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  className={`relative flex h-[34px] items-center gap-2.5 rounded-md pl-3 pr-2.5 text-[13px] transition-colors ${
                    active ? "bg-sidebar-active font-medium text-white" : "text-sidebar-text hover:bg-white/[0.06] hover:text-white"
                  }`}
                >
                  {active && <span className="absolute -left-3 top-2 h-[18px] w-[3px] rounded-r-sm bg-accent-line" />}
                  <Icon name={it.icon} size={16} />
                  <span className="flex-1">{it.label}</span>
                  {n != null && n > 0 && (
                    <span className="num flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger px-1.5 text-[11px] font-medium">
                      {n > 99 ? "99+" : n}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="flex items-center gap-2.5 border-t border-sidebar-line px-4 py-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#2a3850] text-[12px] font-semibold">{adminName.slice(0, 1)}</span>
        <div className="min-w-0 flex-1 leading-[1.2]">
          <p className="truncate text-[12px] font-medium">{adminName}</p>
          <p className="truncate text-[11px] text-sidebar-muted">{username}</p>
        </div>
        <Link href="/more" className="rounded-md p-1 text-sidebar-muted hover:bg-white/10 hover:text-white" title="账号与更多">
          <Icon name="settings" size={15} />
        </Link>
        <form action="/api/admin/logout" method="post">
          <button title="退出登录" className="rounded-md p-1 text-sidebar-muted hover:bg-white/10 hover:text-white">
            <Icon name="logout" size={15} />
          </button>
        </form>
      </div>
    </aside>
  );
}
