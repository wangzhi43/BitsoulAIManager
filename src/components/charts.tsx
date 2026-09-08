// 纯 SVG 图表（服务端组件可用，零依赖）。设计规则：单主色 + 语义色，2px 线，数值直接标注，网格弱化。

export const CHART_COLORS = ["#1f4fa8", "#1a7f4b", "#b7791f", "#c0392b", "#5b6b8c", "#2b6cb0"];

function fmtV(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 10_000) return `${(v / 10_000).toFixed(1)}万`;
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return String(Math.round(v));
}

/** 迷你趋势线 */
export function Sparkline({ values, color = CHART_COLORS[0], width = 96, height = 28 }: { values: number[]; color?: string; width?: number; height?: number }) {
  if (values.length < 2) return <svg width={width} height={height} />;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * (width - 4) + 2;
    const y = height - 2 - ((v - min) / (max - min || 1)) * (height - 4);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block">
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/** 多系列折线图（带 y 轴刻度与 x 标签），宽度自适应容器 */
export function LineChart({
  labels,
  series,
  height = 170,
  width = 700,
  yMax,
}: {
  labels: string[];
  series: { name: string; values: number[]; color?: string }[];
  height?: number;
  width?: number;
  yMax?: number;
}) {
  const padL = 34;
  const padR = 16;
  const padT = 8;
  const padB = 20;
  const iw = width - padL - padR;
  const ih = height - padT - padB;
  const n = labels.length;
  const max = yMax ?? Math.max(1, ...series.flatMap((s) => s.values));
  const pt = (i: number, v: number) => [padL + (n > 1 ? (i * iw) / (n - 1) : iw / 2), padT + ih - (v / max) * ih] as const;
  const ticks = 3;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="block h-auto w-full" style={{ maxHeight: height }}>
      {Array.from({ length: ticks + 1 }, (_, k) => {
        const y = padT + (ih * k) / ticks;
        return (
          <g key={k}>
            <line x1={padL} y1={y} x2={width - padR} y2={y} stroke="#eceff3" strokeWidth={1} />
            <text x={padL - 6} y={y + 3.5} fontSize={10} fill="#8b94a5" textAnchor="end">
              {fmtV((max * (ticks - k)) / ticks)}
            </text>
          </g>
        );
      })}
      {series.map((s, si) => {
        const c = s.color ?? CHART_COLORS[si % CHART_COLORS.length];
        const d = s.values.map((v, i) => `${i === 0 ? "M" : "L"}${pt(i, v)[0].toFixed(1)},${pt(i, v)[1].toFixed(1)}`).join(" ");
        const [lx, ly] = pt(s.values.length - 1, s.values[s.values.length - 1] ?? 0);
        return (
          <g key={s.name}>
            <path d={d} fill="none" stroke={c} strokeWidth={2} strokeLinejoin="round" />
            <circle cx={lx} cy={ly} r={3} fill={c} />
          </g>
        );
      })}
      {labels.map((l, i) => {
        const step = n > 8 ? Math.ceil(n / 7) : 1;
        if (i % step !== 0 && i !== n - 1) return null;
        return (
          <text key={i} x={pt(i, 0)[0]} y={height - 5} fontSize={10} fill="#8b94a5" textAnchor={i === n - 1 ? "end" : i === 0 ? "start" : "middle"}>
            {l}
          </text>
        );
      })}
    </svg>
  );
}

export function Legend({ items }: { items: { name: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap gap-x-3.5 gap-y-1 text-[12px] text-ink-2">
      {items.map((it) => (
        <span key={it.name} className="inline-flex items-center gap-1.5">
          <span className="h-[7px] w-[7px] rounded-full" style={{ background: it.color }} />
          {it.name}
        </span>
      ))}
    </div>
  );
}

/** 纵向柱状图（柱端圆角，数值标注可选） */
export function BarChart({
  data,
  color = CHART_COLORS[0],
  height = 110,
  width = 320,
  showValues = false,
}: {
  data: { label: string; value: number }[];
  color?: string;
  height?: number;
  width?: number;
  showValues?: boolean;
}) {
  const n = data.length || 1;
  const max = Math.max(1, ...data.map((d) => d.value));
  const gap = 6;
  const padB = 16;
  const padT = showValues ? 14 : 4;
  const bw = (width - gap * (n - 1)) / n;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="block h-auto w-full" style={{ maxHeight: height }}>
      {data.map((d, i) => {
        const h = (d.value / max) * (height - padB - padT);
        const x = i * (bw + gap);
        const y = height - padB - h;
        return (
          <g key={i}>
            <rect x={x} y={y} width={bw} height={Math.max(h, d.value > 0 ? 2 : 0)} rx={2} fill={color} />
            {showValues && d.value > 0 && (
              <text x={x + bw / 2} y={y - 3} fontSize={10} fill="#4b5563" textAnchor="middle">
                {fmtV(d.value)}
              </text>
            )}
            <text x={x + bw / 2} y={height - 3} fontSize={10} fill="#8b94a5" textAnchor="middle">
              {d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** 环形图 + 图例 */
export function Donut({ data, size = 112, centerLabel, thickness = 14 }: { data: { name: string; value: number; color?: string }[]; size?: number; centerLabel?: string; thickness?: number }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const r = size / 2 - thickness / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eceff3" strokeWidth={thickness} />
        {total > 0 &&
          data.map((d, i) => {
            const len = (d.value / total) * c;
            const el = (
              <circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={d.color ?? CHART_COLORS[i % CHART_COLORS.length]}
                strokeWidth={thickness}
                strokeDasharray={`${len} ${c - len}`}
                strokeDashoffset={-offset}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
              />
            );
            offset += len;
            return el;
          })}
        <text x={size / 2} y={size / 2 - 2} textAnchor="middle" fontSize={18} fontWeight={600} fill="#16202e">
          {total}
        </text>
        {centerLabel && (
          <text x={size / 2} y={size / 2 + 13} textAnchor="middle" fontSize={10} fill="#8b94a5">
            {centerLabel}
          </text>
        )}
      </svg>
      <ul className="flex min-w-0 flex-1 flex-col gap-1.5 text-[12px]">
        {data.map((d, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: d.color ?? CHART_COLORS[i % CHART_COLORS.length] }} />
            <span className="min-w-0 flex-1 truncate text-ink-2">{d.name}</span>
            <span className="num text-ink">{d.value}</span>
            <span className="num w-9 text-right text-ink-3">{total ? Math.round((d.value / total) * 100) : 0}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 横向排行条 */
export function HBarList({ data, color = CHART_COLORS[0], valueLabel }: { data: { label: string; value: number; hint?: string }[]; color?: string; valueLabel?: (v: number) => string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <ul className="flex flex-col gap-2.5">
      {data.map((d, i) => (
        <li key={i} className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2 text-[12px]">
            <span className="min-w-0 truncate text-ink-2">
              {d.label}
              {d.hint && <span className="ml-1 text-ink-3">· {d.hint}</span>}
            </span>
            <span className="num shrink-0 text-ink">{valueLabel ? valueLabel(d.value) : d.value}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-[#eceff3]">
            <div className="h-full rounded-full" style={{ width: `${(d.value / max) * 100}%`, background: color }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
