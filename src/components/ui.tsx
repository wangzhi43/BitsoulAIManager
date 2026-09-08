import Link from "next/link";
import { Icon, type IconName } from "./icons";

// 页面骨架与基础组件（设计系统见 docs/UI_REDESIGN.md §1；画布「设计系统」画板）。
// 全部为服务端可用的无状态组件；需要交互的在 ui-client.tsx。

export function PageShell({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <main className={`flex w-full flex-col gap-4 px-4 py-4 sm:px-6 sm:py-5 ${className}`}>{children}</main>;
}

/** 顶栏：标题 + 灰色副题 + 右侧操作区（白底通栏） */
export function PageHeader({
  title,
  subtitle,
  actions,
  back,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  back?: { href: string; label?: string };
}) {
  return (
    <header className="-mx-4 -mt-4 mb-1 flex min-h-[56px] flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line bg-surface px-4 py-2.5 sm:-mx-6 sm:-mt-5 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        {back && (
          <Link href={back.href} className="flex h-7 w-7 items-center justify-center rounded-md text-ink-2 hover:bg-bg" title={back.label ?? "返回"}>
            <Icon name="arrowLeft" />
          </Link>
        )}
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <h1 className="truncate text-[17px] font-semibold tracking-[-0.01em] text-ink">{title}</h1>
          {subtitle && <p className="text-[12px] text-ink-3">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Panel({
  title,
  extra,
  children,
  className = "",
  pad = true,
  id,
}: {
  title?: React.ReactNode;
  extra?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  pad?: boolean;
  id?: string;
}) {
  return (
    <section id={id} className={`rounded-lg border border-line bg-surface ${className}`}>
      {title !== undefined && (
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 className="text-[14px] font-semibold text-ink">{title}</h2>
          {extra && <div className="flex items-center gap-2">{extra}</div>}
        </div>
      )}
      {pad ? <div className="p-4">{children}</div> : children}
    </section>
  );
}

/** KPI 数字块。tone=alert 红数字红边，warn 琥珀数字 */
export function KpiTile({
  label,
  value,
  sub,
  tone = "default",
  href,
  hrefLabel = "处理",
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "default" | "warn" | "alert" | "ok";
  href?: string;
  hrefLabel?: string;
}) {
  const num = { default: "text-ink", warn: "text-warn", alert: "text-danger", ok: "text-ok" }[tone];
  const border = tone === "alert" ? "border-danger-line" : "border-line";
  return (
    <div className={`flex flex-col gap-1.5 rounded-lg border bg-surface px-4 py-3.5 ${border}`}>
      <div className="flex items-center justify-between gap-2 text-[12px] text-ink-2">
        <span>{label}</span>
        {href && (
          <Link href={href} className="flex items-center gap-0.5 text-accent hover:underline">
            {hrefLabel}
            <Icon name="chevronRight" size={12} />
          </Link>
        )}
      </div>
      <div className={`num text-[26px] font-semibold leading-[1.1] tracking-[-0.01em] ${num}`}>{value}</div>
      {sub !== undefined && <div className="min-h-[18px] text-[12px] text-ink-3">{sub}</div>}
    </div>
  );
}

/** 响应式 KPI 行 */
export function KpiRow({ children, cols = 4 }: { children: React.ReactNode; cols?: 2 | 3 | 4 | 5 | 6 }) {
  const cls = {
    2: "grid-cols-2",
    3: "grid-cols-2 md:grid-cols-3",
    4: "grid-cols-2 xl:grid-cols-4",
    5: "grid-cols-2 md:grid-cols-3 xl:grid-cols-5",
    6: "grid-cols-2 md:grid-cols-3 xl:grid-cols-6",
  }[cols];
  return <div className={`grid gap-3 ${cls}`}>{children}</div>;
}

/** 表格外壳：灰底表头、1px 分隔线、行 hover */
export function Table({
  head,
  children,
  className = "",
  dense = false,
}: {
  head: (string | { label: string; align?: "left" | "right"; width?: string })[];
  children: React.ReactNode;
  className?: string;
  dense?: boolean;
}) {
  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="w-full text-[13px]">
        <thead>
          <tr className="bg-surface-2 text-left text-[12px] font-medium text-ink-3">
            {head.map((h, i) => {
              const o = typeof h === "string" ? { label: h } : h;
              return (
                <th
                  key={i}
                  style={o.width ? { width: o.width } : undefined}
                  className={`whitespace-nowrap border-b border-line px-3 py-2 font-medium ${o.align === "right" ? "text-right" : ""}`}
                >
                  {o.label}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className={`divide-y divide-line ${dense ? "[&_td]:py-1.5" : "[&_td]:py-2.5"} [&_td]:px-3 [&_td]:align-middle [&_tr:hover]:bg-surface-2`}>
          {children}
        </tbody>
      </table>
    </div>
  );
}

export function EmptyRow({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="py-10 text-center text-[13px] text-ink-3">
        {children}
      </td>
    </tr>
  );
}

export type ChipTone = "slate" | "blue" | "green" | "amber" | "red" | "outline";

const CHIP: Record<ChipTone, string> = {
  slate: "bg-[#eef0f3] text-ink-2",
  blue: "bg-accent-soft text-accent",
  green: "bg-ok-soft text-ok",
  amber: "bg-warn-soft text-warn",
  red: "bg-danger-soft text-danger",
  outline: "border border-line-strong bg-surface text-ink-2",
};

export function Chip({ children, tone = "slate", className = "", title }: { children: React.ReactNode; tone?: ChipTone; className?: string; title?: string }) {
  return (
    <span title={title} className={`inline-flex h-5 items-center gap-1 whitespace-nowrap rounded px-[7px] text-[11px] font-medium ${CHIP[tone]} ${className}`}>
      {children}
    </span>
  );
}

/** 小计数徽标（侧栏、页签） */
export function Count({ n, tone = "slate" }: { n: number; tone?: "slate" | "red" | "blue" }) {
  const cls = { slate: "bg-[#eef0f3] text-ink-2", red: "bg-danger text-white", blue: "bg-accent-soft text-accent" }[tone];
  return <span className={`num inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 text-[11px] font-medium ${cls}`}>{n > 99 ? "99+" : n}</span>;
}

/** 按钮类名（服务端/客户端通用） */
export function btnCls(kind: "primary" | "secondary" | "danger" | "ghost" = "secondary", size: "sm" | "md" = "md", extra = "") {
  const base = "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";
  const sizes = { sm: "h-7 px-2.5 text-[12px]", md: "h-8 px-3.5 text-[13px]" };
  const kinds = {
    primary: "bg-accent text-white hover:bg-accent-hover",
    secondary: "border border-line-strong bg-surface text-ink hover:bg-surface-2",
    danger: "border border-danger-line bg-surface text-danger hover:bg-danger-soft",
    ghost: "text-ink-2 hover:bg-bg hover:text-ink",
  };
  return `${base} ${sizes[size]} ${kinds[kind]} ${extra}`;
}

export function LinkButton({
  href,
  children,
  kind = "secondary",
  size = "md",
  icon,
  className = "",
}: {
  href: string;
  children: React.ReactNode;
  kind?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md";
  icon?: IconName;
  className?: string;
}) {
  return (
    <Link href={href} className={btnCls(kind, size, className)}>
      {icon && <Icon name={icon} size={size === "sm" ? 13 : 14} />}
      {children}
    </Link>
  );
}

/** 小写字距标签（字段名） */
export function Label({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <span className={`text-[11px] font-medium uppercase tracking-[0.04em] text-ink-3 ${className}`}>{children}</span>;
}

export function Field({ label, children, hint, className = "" }: { label: React.ReactNode; children: React.ReactNode; hint?: React.ReactNode; className?: string }) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <Label>{label}</Label>
      {children}
      {hint && <span className="text-[12px] text-ink-3">{hint}</span>}
    </label>
  );
}

/** 键值列表（详情页属性栏） */
export function KV({ items, className = "" }: { items: { k: React.ReactNode; v: React.ReactNode }[]; className?: string }) {
  return (
    <dl className={`divide-y divide-line ${className}`}>
      {items.map((it, i) => (
        <div key={i} className="flex items-start justify-between gap-3 py-2 text-[13px]">
          <dt className="shrink-0 text-ink-3">{it.k}</dt>
          <dd className="min-w-0 text-right text-ink">{it.v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** 页签（链接式） */
export function Tabs({ items, className = "" }: { items: { href: string; label: React.ReactNode; active: boolean; count?: number }[]; className?: string }) {
  return (
    <nav className={`flex gap-0.5 overflow-x-auto border-b border-line ${className}`}>
      {items.map((t, i) => (
        <Link
          key={i}
          href={t.href}
          className={`-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3.5 py-2.5 text-[13px] transition-colors ${
            t.active ? "border-accent font-medium text-accent" : "border-transparent text-ink-2 hover:text-ink"
          }`}
        >
          {t.label}
          {t.count != null && <Count n={t.count} tone={t.active ? "blue" : "slate"} />}
        </Link>
      ))}
    </nav>
  );
}

/** 空态：一句话 + 可选下一步 */
export function EmptyState({
  title,
  desc,
  action,
  icon = "inbox",
  compact = false,
}: {
  title: React.ReactNode;
  desc?: React.ReactNode;
  action?: React.ReactNode;
  icon?: IconName;
  compact?: boolean;
}) {
  return (
    <div className={`flex flex-col items-center justify-center gap-2 text-center ${compact ? "py-6" : "py-12"}`}>
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-bg text-ink-3">
        <Icon name={icon} size={18} />
      </span>
      <p className="text-[13px] font-medium text-ink-2">{title}</p>
      {desc && <p className="max-w-md text-[12px] leading-relaxed text-ink-3">{desc}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

/** 提示条（页面内） */
export function Notice({ tone = "info", children, className = "" }: { tone?: "info" | "warn" | "danger" | "ok"; children: React.ReactNode; className?: string }) {
  const cls = {
    info: "border-line bg-surface-2 text-ink-2",
    warn: "border-warn-line bg-warn-soft text-warn",
    danger: "border-danger-line bg-danger-soft text-danger",
    ok: "border-[#bfe3cf] bg-ok-soft text-ok",
  }[tone];
  const icon: IconName = tone === "ok" ? "checkSimple" : tone === "info" ? "info" : "alert";
  return (
    <div className={`flex items-start gap-2 rounded-md border px-3 py-2 text-[12px] leading-relaxed ${cls} ${className}`}>
      <Icon name={icon} size={14} className="mt-0.5" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** 状态进度条（详情页顶部） */
export function Stepper({ steps, current }: { steps: { key: string; label: string }[]; current: number }) {
  return (
    <div className="flex items-start overflow-x-auto rounded-lg border border-line bg-surface px-5 pb-2.5 pt-3.5">
      {steps.map((s, i) => {
        const done = i < current;
        const now = i === current;
        const dot = done ? "bg-ok" : now ? "bg-accent ring-[3px] ring-accent-soft" : "bg-line-strong";
        return (
          <div key={s.key} className={`flex items-center ${i === steps.length - 1 ? "" : "flex-1"}`}>
            <div className="flex w-14 shrink-0 flex-col items-center gap-1">
              <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
              <span className={`whitespace-nowrap text-[11px] ${now ? "font-semibold text-ink" : done ? "text-ink-2" : "text-ink-3"}`}>{s.label}</span>
            </div>
            {i !== steps.length - 1 && <span className={`-mx-5 mb-[18px] h-0.5 flex-1 ${done ? "bg-ok" : "bg-line"}`} />}
          </div>
        );
      })}
    </div>
  );
}

/** 时间线（流转记录） */
export function Timeline({ items }: { items: { time: string; actor: React.ReactNode; note: React.ReactNode; badge?: React.ReactNode; tone?: "default" | "current" | "danger" }[] }) {
  return (
    <ol className="flex flex-col">
      {items.map((it, i) => {
        const last = i === items.length - 1;
        const dot = it.tone === "current" ? "bg-accent" : it.tone === "danger" ? "bg-danger" : "bg-line-strong";
        return (
          <li key={i} className="flex gap-3 py-2">
            <span className="num w-[82px] shrink-0 pt-0.5 font-mono text-[11px] text-ink-3">{it.time}</span>
            <div className="flex w-2.5 shrink-0 flex-col items-center">
              <span className={`mt-1.5 h-2 w-2 rounded-full ${dot}`} />
              {!last && <span className="mt-1 w-px flex-1 bg-line" />}
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-[13px] text-ink">
                <span className="font-mono text-[12px] text-ink-2">{it.actor}</span> · {it.note}
              </span>
              {it.badge && <span>{it.badge}</span>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** 相对时间（服务端渲染安全） */
export function ago(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const t = typeof d === "string" ? new Date(d).getTime() : d.getTime();
  const m = Math.max(0, Math.floor((Date.now() - t) / 60000));
  if (m < 1) return "刚刚";
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days} 天前`;
  return fmtDate(d);
}

export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const x = typeof d === "string" ? new Date(d) : d;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`;
}

export function fmtDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const x = typeof d === "string" ? new Date(d) : d;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(x.getMonth() + 1)}-${p(x.getDate())} ${p(x.getHours())}:${p(x.getMinutes())}`;
}

export function fmtTokens(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)} M`;
  if (v >= 10_000) return `${(v / 10_000).toFixed(1)} 万`;
  return v.toLocaleString("zh-CN");
}

/** 展示模式说明条 */
export function DemoNote() {
  return (
    <Notice tone="warn" className="mb-1">
      展示模式：本页为示例数据，写操作不会生效。在「更多」页关闭。
    </Notice>
  );
}
