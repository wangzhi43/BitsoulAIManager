// 需求状态与优先级的统一展示（标签文案 + 状态色，状态色带文字不裸用颜色）

export const STATUS_LABEL: Record<string, string> = {
  INBOX: "采集箱",
  PARSING: "拆解中",
  PENDING_CONFIRM: "待确认",
  READY: "待开发",
  DEVELOPING: "开发中",
  PENDING_TEST: "待测试",
  TESTING: "测试中",
  TESTED: "测试完成",
  REVIEWING: "待裁决",
  PENDING_ACCEPT: "待验收",
  ACCEPTED: "已验收",
  CLOSED: "已关闭",
  ON_HOLD: "挂起",
};

const STATUS_STYLE: Record<string, string> = {
  PENDING_CONFIRM: "bg-indigo-50 text-indigo-600",
  READY: "bg-slate-100 text-slate-600",
  DEVELOPING: "bg-blue-50 text-blue-600",
  PENDING_TEST: "bg-teal-50 text-teal-600",
  TESTING: "bg-teal-50 text-teal-600",
  REVIEWING: "bg-amber-50 text-amber-600",
  PENDING_ACCEPT: "bg-amber-50 text-amber-600",
  ACCEPTED: "bg-green-50 text-green-600",
  CLOSED: "bg-slate-100 text-slate-400",
  ON_HOLD: "bg-slate-100 text-slate-400",
};

export function StatusChip({ status }: { status: string }) {
  return (
    <span className={`whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium ${STATUS_STYLE[status] ?? "bg-slate-100 text-slate-500"}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

const PRIORITY_STYLE: Record<string, string> = {
  P0: "bg-red-500 text-white",
  P1: "bg-amber-100 text-amber-700",
  P2: "bg-slate-100 text-slate-600",
  P3: "bg-slate-100 text-slate-400",
};

export function PriorityChip({ priority }: { priority: string | null }) {
  if (!priority) return null;
  return (
    <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${PRIORITY_STYLE[priority] ?? ""}`}>
      {priority}
    </span>
  );
}
