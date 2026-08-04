"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const GROUPS: { title: string; items: { href: string; label: string; icon: string }[] }[] = [
  {
    title: "工作台",
    items: [
      { href: "/dashboard", label: "全局看板", icon: "▦" },
      { href: "/confirm", label: "需求确认", icon: "✓" },
      { href: "/requirements", label: "需求列表", icon: "≔" },
    ],
  },
  {
    title: "执行",
    items: [
      { href: "/pools", label: "任务池", icon: "≡" },
      { href: "/branches", label: "分支审查", icon: "⑂" },
      { href: "/agents", label: "Agent", icon: "⚙" },
    ],
  },
  {
    title: "洞察",
    items: [
      { href: "/reports", label: "每日报告", icon: "▤" },
      { href: "/inbox", label: "采集箱", icon: "⇩" },
    ],
  },
  {
    title: "系统",
    items: [{ href: "/settings", label: "设置", icon: "☼" }],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="sticky top-0 hidden h-dvh w-52 shrink-0 flex-col border-r border-zinc-200 bg-white lg:flex dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">B</span>
        <div className="leading-tight">
          <p className="text-[13px] font-semibold">BitSoul PM</p>
          <p className="text-[10px] text-zinc-400">AI Manager</p>
        </div>
      </div>
      <nav className="flex-1 space-y-4 overflow-y-auto px-3 pb-4">
        {GROUPS.map((g) => (
          <div key={g.title}>
            <p className="px-2 pb-1 text-[10px] font-medium uppercase tracking-wider text-zinc-400">{g.title}</p>
            <ul className="space-y-0.5">
              {g.items.map((it) => {
                const active = pathname === it.href || pathname.startsWith(it.href + "/");
                return (
                  <li key={it.href}>
                    <Link
                      href={it.href}
                      className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-colors ${
                        active
                          ? "bg-indigo-50 font-medium text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300"
                          : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-800 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-200"
                      }`}
                    >
                      <span className="w-4 text-center">{it.icon}</span>
                      {it.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <form action="/api/admin/logout" method="post" className="border-t border-zinc-100 p-3 dark:border-zinc-800">
        <button className="w-full rounded-lg px-2.5 py-2 text-left text-[13px] text-zinc-400 hover:bg-zinc-50 hover:text-zinc-700 dark:hover:bg-zinc-800/60">
          ⎋ 退出登录
        </button>
      </form>
    </aside>
  );
}
