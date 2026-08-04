// 纯 SVG 图表组件（服务端组件可用，零依赖）。
// 遵循 dataviz 规范：2px 线、柱端 4px 圆角贴基线、留白分隔、数值直接标注、
// 网格线弱化、文字用墨色而非系列色。配色已通过 validate_palette 六项检查。

export const CHART_COLORS = ["#6366F1", "#14B8A6", "#F59E0B", "#F43F5E", "#0EA5E9"];

function areaPath(values: number[], w: number, h: number, max: number, pad = 2): { line: string; area: string } {
  const n = values.length;
  if (n === 0) return { line: "", area: "" };
  const stepX = n > 1 ? (w - pad * 2) / (n - 1) : 0;
  const y = (v: number) => h - pad - (max > 0 ? (v / max) * (h - pad * 2) : 0);
  const pts = values.map((v, i) => `${(pad + i * stepX).toFixed(1)},${y(v).toFixed(1)}`);
  const line = `M${pts.join(" L")}`;
  const area = `${line} L${(pad + (n - 1) * stepX).toFixed(1)},${h - pad} L${pad},${h - pad} Z`;
  return { line, area };
}

/** 迷你趋势线（KPI 卡片内） */
export function Sparkline({ values, color = CHART_COLORS[0], width = 96, height = 28 }: { values: number[]; color?: string; width?: number; height?: number }) {
  const max = Math.max(...values, 1);
  const { line, area } = areaPath(values, width, height, max);
  const gid = `sp-${color.replace("#", "")}`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible" aria-hidden>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** 双系列面积趋势图（14 天吞吐等） */
export function AreaTrend({
  series,
  labels,
  height = 150,
}: {
  series: { name: string; values: number[]; color?: string }[];
  labels: string[];
  height?: number;
}) {
  const w = 560;
  const max = Math.max(...series.flatMap((s) => s.values), 1);
  const gridYs = [0.25, 0.5, 0.75];
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${height}`} className="w-full" role="img">
        {gridYs.map((g) => (
          <line key={g} x1="0" x2={w} y1={height * g} y2={height * g} stroke="currentColor" strokeOpacity="0.07" strokeWidth="1" />
        ))}
        {series.map((s, i) => {
          const color = s.color ?? CHART_COLORS[i % CHART_COLORS.length];
          const { line, area } = areaPath(s.values, w, height, max);
          const gid = `at-${i}-${color.replace("#", "")}`;
          return (
            <g key={s.name}>
              <defs>
                <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity="0.18" />
                  <stop offset="100%" stopColor={color} stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={area} fill={`url(#${gid})`} />
              <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex items-center justify-between">
        <div className="flex gap-3">
          {series.map((s, i) => (
            <span key={s.name} className="inline-flex items-center gap-1.5 text-[11px] text-zinc-500">
              <span className="h-2 w-2 rounded-full" style={{ background: s.color ?? CHART_COLORS[i % CHART_COLORS.length] }} />
              {s.name}
            </span>
          ))}
        </div>
        <span className="text-[10px] text-zinc-400">
          {labels[0]} — {labels[labels.length - 1]}
        </span>
      </div>
    </div>
  );
}

/** 环形图（状态/角色分布），中心放合计 */
export function Donut({
  data,
  centerLabel,
  size = 132,
}: {
  data: { name: string; value: number; color?: string }[];
  centerLabel: string;
  size?: number;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const r = size / 2 - 8;
  const cx = size / 2;
  const stroke = 14;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img">
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="currentColor" strokeOpacity="0.06" strokeWidth={stroke} />
        {data.map((d, i) => {
          const frac = total > 0 ? d.value / total : 0;
          const dash = Math.max(frac * circ - 2, 0); // 2px 留白分隔
          const el = (
            <circle
              key={d.name}
              cx={cx}
              cy={cx}
              r={r}
              fill="none"
              stroke={d.color ?? CHART_COLORS[i % CHART_COLORS.length]}
              strokeWidth={stroke}
              strokeDasharray={`${dash} ${circ - dash}`}
              strokeDashoffset={-offset * circ + circ / 4}
              strokeLinecap="butt"
            />
          );
          offset += frac;
          return el;
        })}
        <text x={cx} y={cx - 4} textAnchor="middle" className="fill-current text-xl font-semibold" style={{ fontSize: 22 }}>
          {total}
        </text>
        <text x={cx} y={cx + 14} textAnchor="middle" className="fill-current opacity-50" style={{ fontSize: 10 }}>
          {centerLabel}
        </text>
      </svg>
      <ul className="min-w-0 flex-1 space-y-1.5">
        {data.map((d, i) => (
          <li key={d.name} className="flex items-center justify-between gap-2 text-[12px]">
            <span className="inline-flex min-w-0 items-center gap-1.5 text-zinc-500">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: d.color ?? CHART_COLORS[i % CHART_COLORS.length] }} />
              <span className="truncate">{d.name}</span>
            </span>
            <span className="font-medium tabular-nums">{d.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 纵向柱状图（7 天 LLM 消耗等），柱端圆角贴基线 */
export function VBars({
  data,
  height = 120,
  color = CHART_COLORS[0],
  valueLabel,
}: {
  data: { label: string; value: number }[];
  height?: number;
  color?: string;
  valueLabel?: (v: number) => string;
}) {
  const w = 260;
  const n = data.length;
  const gap = 6;
  const barW = Math.max((w - gap * (n + 1)) / n, 4);
  const max = Math.max(...data.map((d) => d.value), 1);
  const chartH = height - 16;
  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="w-full" role="img">
      {data.map((d, i) => {
        const h = Math.max((d.value / max) * (chartH - 14), d.value > 0 ? 3 : 1);
        const x = gap + i * (barW + gap);
        const y = chartH - h;
        return (
          <g key={i}>
            <path
              d={`M${x},${chartH} L${x},${y + 4} Q${x},${y} ${x + 4},${y} L${x + barW - 4},${y} Q${x + barW},${y} ${x + barW},${y + 4} L${x + barW},${chartH} Z`}
              fill={color}
              opacity={0.85}
            />
            {valueLabel && d.value > 0 && (
              <text x={x + barW / 2} y={y - 3} textAnchor="middle" className="fill-current opacity-60" style={{ fontSize: 8.5 }}>
                {valueLabel(d.value)}
              </text>
            )}
            <text x={x + barW / 2} y={height - 3} textAnchor="middle" className="fill-current opacity-40" style={{ fontSize: 8.5 }}>
              {d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** 横向排行条（Agent 完成数等），带数值 */
export function HBarList({ data, color = CHART_COLORS[0] }: { data: { label: string; value: number; hint?: string }[]; color?: string }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <ul className="space-y-2">
      {data.map((d) => (
        <li key={d.label} className="text-[12px]">
          <div className="mb-0.5 flex items-center justify-between gap-2">
            <span className="truncate text-zinc-500">
              {d.label}
              {d.hint && <span className="ml-1 text-zinc-300 dark:text-zinc-600">{d.hint}</span>}
            </span>
            <span className="font-medium tabular-nums">{d.value}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
            <div className="h-full rounded-full" style={{ width: `${(d.value / max) * 100}%`, background: color }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
