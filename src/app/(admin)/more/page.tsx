import Link from "next/link";
import { isDemoMode } from "@/lib/demo";
import { currentAdmin } from "@/lib/auth";
import { DemoToggle } from "@/components/DemoControls";
import { ChangePasswordForm } from "./ui";
import { PageShell, PageHeader, Panel, btnCls } from "@/components/ui";
import { Icon, type IconName } from "@/components/icons";

export const dynamic = "force-dynamic";

// 「更多」：手机端次级入口 + 账号操作 + 展示模式开关（桌面端从侧栏用户区进入）

export default async function MorePage() {
  const demo = await isDemoMode();
  const admin = await currentAdmin();
  const links: { href: string; label: string; desc: string; icon: IconName }[] = [
    { href: "/requirements", label: "需求列表", desc: "全部需求的状态筛选与详情", icon: "list" },
    { href: "/inbox", label: "采集箱", desc: "微信消息聚合状态、手动导入", icon: "inbox" },
    { href: "/agents", label: "智能体", desc: "Agent 账号、当前任务与产出", icon: "bot" },
    { href: "/reports", label: "日报", desc: "各项目每日进度报告", icon: "chart" },
    { href: "/settings", label: "设置", desc: "项目、LLM、微信、系统参数", icon: "settings" },
    { href: "https://github.com/wangzhi43/BitsoulAIManager/blob/main/docs/api/AGENT_GUIDE.md", label: "终端接入指引", desc: "给 Claude Code 等终端的接入说明", icon: "file" },
  ];
  return (
    <PageShell>
      <PageHeader title="更多" subtitle="功能入口 · 账号 · 展示模式" />
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <Panel pad={false}>
          <ul className="divide-y divide-line">
            {links.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-md bg-bg text-ink-2">
                    <Icon name={l.icon} size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-ink">{l.label}</p>
                    <p className="truncate text-[12px] text-ink-3">{l.desc}</p>
                  </span>
                  <Icon name="chevronRight" size={14} className="text-ink-3" />
                </Link>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="账号">
          <div className="mb-3 flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-sidebar text-[13px] font-semibold text-white">{(admin?.displayName ?? "管").slice(0, 1)}</span>
            <div className="leading-tight">
              <p className="text-[13px] font-medium text-ink">{admin?.displayName}</p>
              <p className="font-mono text-[12px] text-ink-3">{admin?.username}</p>
            </div>
          </div>
          <ChangePasswordForm />
        </Panel>

        <DemoToggle on={demo} />

        <form action="/api/admin/logout" method="post">
          <button className={btnCls("secondary", "md", "w-full")}>退出登录</button>
        </form>
      </div>
    </PageShell>
  );
}
