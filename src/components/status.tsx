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
  PENDING_CONFIRM: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300",
  READY: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
  DEVELOPING: "bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-400",
  PENDING_TEST: "bg-teal-100 text-teal-700 dark:bg-teal-950/60 dark:text-teal-400",
  TESTING: "bg-teal-100 text-teal-700 dark:bg-teal-950/60 dark:text-teal-400",
  REVIEWING: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400",
  PENDING_ACCEPT: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400",
  ACCEPTED: "bg-green-100 text-green-700 dark:bg-green-950/60 dark:text-green-400",
  CLOSED: "bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500",
  ON_HOLD: "bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500",
};

export function StatusChip({ status }: { status: string }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLE[status] ?? "bg-zinc-100 text-zinc-500 dark:bg-zinc-800"}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

const PRIORITY_STYLE: Record<string, string> = {
  P0: "bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400",
  P1: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400",
  P2: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
  P3: "bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500",
};

export function PriorityChip({ priority }: { priority: string | null }) {
  if (!priority) return null;
  return (
    <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${PRIORITY_STYLE[priority] ?? ""}`}>
      {priority}
    </span>
  );
}
