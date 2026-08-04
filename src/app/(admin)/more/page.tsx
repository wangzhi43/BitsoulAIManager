import Link from "next/link";
import { isDemoMode } from "@/lib/demo";
import { DemoToggle } from "@/components/DemoControls";
import { ChangePasswordForm } from "./ui";

export const dynamic = "force-dynamic";

export default async function MorePage() {
  const demo = await isDemoMode();
  const links = [
    { href: "/requirements", label: "需求列表", desc: "全部需求的状态筛选、详情与验收操作", icon: "≔" },
    { href: "/inbox", label: "采集箱与手动导入", desc: "微信消息聚合状态、粘贴/上传导入需求", icon: "⇩" },
    { href: "/agents", label: "Agent 看板与账号", desc: "各 Agent 当前任务、账号创建与启停", icon: "🤖" },
    { href: "/reports", label: "每日进度报告", desc: "按项目的每日日报", icon: "📋" },
    { href: "/settings", label: "设置", desc: "项目、LLM 供应商、专家模型、微信采集", icon: "⚙" },
  ];
  return (
    <main className="mx-auto max-w-3xl px-4 py-5 sm:px-6">
      <h1 className="mb-4 text-2xl font-semibold tracking-tight">更多</h1>
      <div className="space-y-3">
        <DemoToggle on={demo} />
        <ul className="space-y-2.5">
          {links.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800/60"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-100 text-lg dark:bg-zinc-800">
                  {l.icon}
                </span>
                <span>
                  <p className="font-medium">{l.label}</p>
                  <p className="text-sm text-zinc-400">{l.desc}</p>
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <ChangePasswordForm />
        <form action="/api/admin/logout" method="post" className="pt-2">
          <button className="w-full rounded-2xl border border-zinc-300 py-2.5 text-sm text-zinc-500 dark:border-zinc-700">
            退出登录
          </button>
        </form>
      </div>
    </main>
  );
}
