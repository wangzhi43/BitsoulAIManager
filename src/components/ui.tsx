// 页面布局共享组件：满屏容器 / 页头 / 面板 / KPI 条（参考 BI 系统排版）

export function PageShell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto w-full max-w-[1720px] px-4 py-5 sm:px-6 xl:px-8">{children}</main>;
}

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
    <header className="mb-4 flex flex-wrap items-end justify-between gap-2">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-xs text-zinc-400">{subtitle}</p>}
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
  title?: string;
  extra?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  pad?: boolean;
}) {
  return (
    <section
      className={`rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900 ${pad ? "p-4" : ""} ${className}`}
    >
      {title && (
        <div className={`flex items-center justify-between ${pad ? "mb-3" : "border-b border-zinc-100 p-4 pb-3 dark:border-zinc-800"}`}>
          <h2 className="flex items-center gap-1.5 text-[13px] font-semibold">
            <span className="h-3.5 w-1 rounded-full bg-indigo-500" />
            {title}
          </h2>
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
  items: { label: string; value: React.ReactNode; sub?: string; tone?: "default" | "indigo" | "green" | "amber" | "red" }[];
}) {
  const tones: Record<string, string> = {
    default: "",
    indigo: "bg-indigo-50/70 dark:bg-indigo-950/30",
    green: "bg-green-50/70 dark:bg-green-950/30",
    amber: "bg-amber-50/70 dark:bg-amber-950/30",
    red: "bg-red-50/70 dark:bg-red-950/30",
  };
  return (
    <div className={`mb-4 grid gap-3 ${items.length <= 3 ? "grid-cols-3" : "grid-cols-2 lg:grid-cols-4"}`}>
      {items.map((it) => (
        <div
          key={it.label}
          className={`rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 ${tones[it.tone ?? "default"]}`}
        >
          <p className="text-xs text-zinc-400">{it.label}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">{it.value}</p>
          {it.sub && <p className="mt-0.5 text-[10px] text-zinc-300 dark:text-zinc-600">{it.sub}</p>}
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
          <tr className="text-left text-[11px] text-zinc-400">
            {head.map((h, i) => (
              <th key={i} className={`pb-2 font-normal ${i === head.length - 1 ? "text-right" : ""}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">{children}</tbody>
      </table>
    </div>
  );
}
