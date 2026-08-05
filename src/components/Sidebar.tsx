"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// 线性图标（参考图为细线图标风格）
function Icon({ d, filled }: { d: string; filled?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-[17px] w-[17px] shrink-0"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  );
}

const ICONS: Record<string, string> = {
  overview: "M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z",
  inbox: "M22 12h-6l-2 3h-4l-2-3H2M5.5 5h13l3.5 7v7H2v-7z",
  confirm: "M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11",
  requirements: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  pools: "M4 4h5v16H4zM10 4h5v10h-5zM16 4h5v7h-5z",
  branches: "M21 12.8A9 9 0 1111.2 3 7 7 0 0021 12.8z",
  agents: "M12 8V4m0 0H8m4 0h4M5 8h14a1 1 0 011 1v9a2 2 0 01-2 2H6a2 2 0 01-2-2V9a1 1 0 011-1zM9 13h.01M15 13h.01",
  reports: "M18 20V10M12 20V4M6 20v-6",
  settings:
    "M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33h0a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51h0a1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82v0a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z",
  more: "M5 12h.01M12 12h.01M19 12h.01",
};

export type SidebarBadges = { confirm?: number; branches?: number };

const NAV: { href: string; label: string; icon: string; badgeKey?: keyof SidebarBadges }[] = [
  { href: "/dashboard", label: "全局总览", icon: "overview" },
  { href: "/inbox", label: "需求采集", icon: "inbox" },
  { href: "/confirm", label: "待确认", icon: "confirm", badgeKey: "confirm" },
  { href: "/requirements", label: "需求管理", icon: "requirements" },
  { href: "/pools", label: "项目执行中心", icon: "pools" },
  { href: "/branches", label: "晚间审查与验收", icon: "branches", badgeKey: "branches" },
  { href: "/agents", label: "智能体管理", icon: "agents" },
  { href: "/reports", label: "数据与报表", icon: "reports" },
  { href: "/settings", label: "系统设置", icon: "settings" },
  { href: "/more", label: "更多", icon: "more" },
];

export function Sidebar({
  adminName = "管理员",
  badges = {},
}: {
  adminName?: string;
  badges?: SidebarBadges;
}) {
  const pathname = usePathname();
  return (
    <aside className="sticky top-0 hidden h-dvh w-[218px] shrink-0 flex-col bg-[#0b1526] text-white lg:flex">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 pb-5 pt-6">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 text-sm font-bold">
          B
        </span>
        <div className="leading-tight">
          <p className="text-[14px] font-semibold tracking-wide">AI 项目平台</p>
          <p className="text-[10px] text-white/40">BitSoul PM</p>
        </div>
      </div>

      {/* 导航 */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
        {NAV.map((it) => {
          const active = pathname === it.href || pathname.startsWith(it.href + "/");
          const badge = it.badgeKey ? badges[it.badgeKey] : undefined;
          return (
            <Link
              key={it.href}
              href={it.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] transition-colors ${
                active
                  ? "bg-blue-600 font-medium text-white shadow-sm shadow-blue-900/40"
                  : "text-white/60 hover:bg-white/[0.07] hover:text-white"
              }`}
            >
              <Icon d={ICONS[it.icon]} />
              <span className="flex-1">{it.label}</span>
              {badge != null && badge > 0 && (
                <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-none">
                  {badge > 99 ? "99+" : badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* 底部用户卡 */}
      <div className="border-t border-white/10 px-4 py-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 to-indigo-500 text-[13px] font-semibold">
            {adminName.slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-[13px] font-medium">{adminName}</p>
            <p className="text-[10px] text-white/40">系统管理员</p>
          </div>
          <form action="/api/admin/logout" method="post">
            <button
              title="退出登录"
              className="rounded-md p-1.5 text-white/40 transition-colors hover:bg-white/10 hover:text-white"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
              </svg>
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
