// 页面布局共享组件：白色顶栏 / 满屏容器 / 卡片面板 / KPI 条 / 徽标（参考 docs/ui_design 设计稿）

export function PageShell({ children }: { children: React.ReactNode }) {
  return <main className="w-full px-4 py-5 sm:px-6 xl:px-7">{children}</main>;
}

/** 参考图顶栏：白色横条通栏，左标题+行内灰色副题，右操作区 */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="-mx-4 -mt-5 mb-5 flex min-h-[64px] flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-slate-200 bg-white px-4 py-3 sm:-mx-6 sm:px-6 xl:-mx-7 xl:px-7">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <h1 className="text-[19px] font-bold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="text-[12px] text-slate-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Panel({
  title,
  extra,
  children,
  className = "",
  pad = true,
}: {
  title?: React.ReactNode;
  extra?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  pad?: boolean;
}) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${pad ? "p-4" : ""} ${className}`}>
      {title && (
        <div className={`flex items-center justify-between gap-2 ${pad ? "mb-3" : "border-b border-slate-100 p-4 pb-3"}`}>
          <h2 className="text-[14px] font-semibold text-slate-800">{title}</h2>
          {extra}
        </div>
      )}
      {children}
    </section>
  );
}

/** 页面顶部 KPI 条：一排小统计卡 */
export function StatStrip({
  items,
}: {
  items: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: "default" | "indigo" | "green" | "amber" | "red" | "blue" }[];
}) {
  const tones: Record<string, string> = {
    default: "border-slate-200 bg-white",
    indigo: "border-indigo-100 bg-indigo-50/60",
    blue: "border-blue-100 bg-blue-50/60",
    green: "border-green-100 bg-green-50/60",
    amber: "border-amber-100 bg-amber-50/60",
    red: "border-red-100 bg-red-50/60",
  };
  return (
    <div className={`mb-4 grid gap-3 ${items.length <= 3 ? "grid-cols-3" : items.length === 4 ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-2 md:grid-cols-3 xl:grid-cols-6"}`}>
      {items.map((it) => (
        <div key={String(it.label)} className={`rounded-xl border p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${tones[it.tone ?? "default"]}`}>
          <p className="text-[12px] text-slate-500">{it.label}</p>
          <p className="mt-1 text-[26px] font-bold leading-none tabular-nums tracking-tight text-slate-900">{it.value}</p>
          {it.sub && <p className="mt-1.5 text-[11px] text-slate-400">{it.sub}</p>}
        </div>
      ))}
    </div>
  );
}

/** 密度化表格外壳 */
export function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-left text-[11px] text-slate-400">
            {head.map((h, i) => (
              <th key={i} className={`pb-2 font-normal ${i === head.length - 1 ? "text-right" : ""}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
    </div>
  );
}

/** 状态/优先级徽标（参考图小圆角标签） */
export function Chip({
  children,
  tone = "slate",
  solid = false,
}: {
  children: React.ReactNode;
  tone?: "slate" | "blue" | "green" | "amber" | "red" | "indigo" | "violet";
  solid?: boolean;
}) {
  const soft: Record<string, string> = {
    slate: "bg-slate-100 text-slate-600",
    blue: "bg-blue-50 text-blue-600",
    green: "bg-green-50 text-green-600",
    amber: "bg-amber-50 text-amber-600",
    red: "bg-red-50 text-red-600",
    indigo: "bg-indigo-50 text-indigo-600",
    violet: "bg-violet-50 text-violet-600",
  };
  const strong: Record<string, string> = {
    slate: "bg-slate-500 text-white",
    blue: "bg-blue-600 text-white",
    green: "bg-green-600 text-white",
    amber: "bg-amber-500 text-white",
    red: "bg-red-500 text-white",
    indigo: "bg-indigo-600 text-white",
    violet: "bg-violet-600 text-white",
  };
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium ${solid ? strong[tone] : soft[tone]}`}>
      {children}
    </span>
  );
}

/** 主按钮 / 次按钮 / 危险按钮 */
export function btnCls(kind: "primary" | "secondary" | "danger" | "ghost" = "primary", size: "sm" | "md" = "md") {
  const base = "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";
  const sizes = { sm: "px-2.5 py-1.5 text-[12px]", md: "px-4 py-2 text-[13px]" };
  const kinds = {
    primary: "bg-blue-600 text-white hover:bg-blue-700",
    secondary: "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
    danger: "border border-red-200 bg-red-50 text-red-600 hover:bg-red-100",
    ghost: "text-slate-500 hover:bg-slate-100 hover:text-slate-800",
  };
  return `${base} ${sizes[size]} ${kinds[kind]}`;
}
