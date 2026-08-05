import Link from "next/link";
import { isDemoMode } from "@/lib/demo";
import { DemoToggle } from "@/components/DemoControls";
import { ChangePasswordForm } from "./ui";
import { PageShell, PageHeader, btnCls } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function MorePage() {
  const demo = await isDemoMode();
  const links = [
    { href: "/requirements", label: "需求列表", desc: "全部需求的状态筛选、详情与验收操作", icon: "≔" },
    { href: "/inbox", label: "采集箱与手动导入", desc: "微信消息聚合状态、粘贴/上传导入需求", icon: "⇩" },
    { href: "/agents", label: "智能体管理", desc: "各 Agent 当前任务、账号创建与启停", icon: "🤖" },
    { href: "/reports", label: "数据与报表", desc: "按项目的每日进度报告与产出统计", icon: "📋" },
    { href: "/settings", label: "系统设置", desc: "项目、LLM 供应商、专家模型、微信采集", icon: "⚙" },
  ];
  return (
    <PageShell>
      <PageHeader title="更多" subtitle="功能入口、演示模式与账号操作" />
      <div className="mx-auto max-w-5xl space-y-4">
        <DemoToggle on={demo} />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors hover:border-blue-200 hover:bg-blue-50/30"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-lg text-blue-600">
                {l.icon}
              </span>
              <span className="min-w-0">
                <p className="text-[13px] font-semibold text-slate-800">{l.label}</p>
                <p className="mt-0.5 truncate text-[12px] text-slate-400">{l.desc}</p>
              </span>
            </Link>
          ))}
        </div>
        <ChangePasswordForm />
        <form action="/api/admin/logout" method="post" className="pt-1">
          <button className={`${btnCls("secondary", "md")} w-full`}>退出登录</button>
        </form>
      </div>
    </PageShell>
  );
}
