import Link from "next/link";

export const dynamic = "force-dynamic";

export default function MorePage() {
  const links = [
    { href: "/inbox", label: "采集箱与手动导入", desc: "微信消息聚合状态、粘贴/上传导入需求" },
    { href: "/agents", label: "Agent 看板与账号", desc: "各 Agent 当前任务、账号创建与启停" },
    { href: "/reports", label: "每日进度报告", desc: "按项目的每日日报" },
    { href: "/settings", label: "设置", desc: "项目、LLM 供应商、专家模型配置" },
  ];
  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-6">
      <h1 className="mb-4 text-xl font-semibold">更多</h1>
      <ul className="space-y-2">
        {links.map((l) => (
          <li key={l.href}>
            <Link
              href={l.href}
              className="block rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <p className="font-medium">{l.label}</p>
              <p className="text-sm opacity-60">{l.desc}</p>
            </Link>
          </li>
        ))}
      </ul>
      <form action="/api/admin/logout" method="post" className="mt-6">
        <button className="w-full rounded-xl border border-zinc-300 py-2.5 text-sm dark:border-zinc-700">
          退出登录
        </button>
      </form>
    </main>
  );
}
