// 需求状态 / 优先级 / 复杂度的统一展示（文字标签 + 语义色，不裸用颜色）

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

/** 状态机顺序（详情页进度条） */
export const STATUS_FLOW = [
  "PENDING_CONFIRM",
  "READY",
  "DEVELOPING",
  "PENDING_TEST",
  "TESTING",
  "PENDING_ACCEPT",
  "ACCEPTED",
] as const;

export type Tone = "slate" | "blue" | "green" | "amber" | "red";

export const STATUS_TONE: Record<string, Tone> = {
  INBOX: "slate",
  PARSING: "blue",
  PENDING_CONFIRM: "blue",
  READY: "slate",
  DEVELOPING: "blue",
  PENDING_TEST: "amber",
  TESTING: "amber",
  TESTED: "amber",
  REVIEWING: "amber",
  PENDING_ACCEPT: "amber",
  ACCEPTED: "green",
  CLOSED: "slate",
  ON_HOLD: "slate",
};

const TONE_CLS: Record<Tone, string> = {
  slate: "bg-[#eef0f3] text-ink-2",
  blue: "bg-accent-soft text-accent",
  green: "bg-ok-soft text-ok",
  amber: "bg-warn-soft text-warn",
  red: "bg-danger-soft text-danger",
};

export function toneCls(t: Tone): string {
  return TONE_CLS[t];
}

export function StatusChip({ status, className = "" }: { status: string; className?: string }) {
  return (
    <span
      className={`inline-flex h-5 items-center whitespace-nowrap rounded px-[7px] text-[11px] font-medium ${TONE_CLS[STATUS_TONE[status] ?? "slate"]} ${className}`}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

const PRIORITY_CLS: Record<string, string> = {
  P0: "bg-danger text-white",
  P1: "bg-warn-soft text-warn",
  P2: "bg-[#eef0f3] text-ink-2",
  P3: "bg-[#eef0f3] text-ink-3",
};

export function PriorityChip({ priority, className = "" }: { priority: string | null | undefined; className?: string }) {
  if (!priority) return null;
  return (
    <span
      className={`inline-flex h-5 items-center rounded px-[7px] text-[11px] font-semibold ${PRIORITY_CLS[priority] ?? PRIORITY_CLS.P2} ${className}`}
    >
      {priority}
    </span>
  );
}

export function ComplexityChip({ complexity, className = "" }: { complexity: string; className?: string }) {
  return (
    <span
      className={`inline-flex h-5 items-center rounded border border-line-strong bg-surface px-[7px] text-[11px] font-medium text-ink-2 ${className}`}
      title="复杂度"
    >
      {complexity}
    </span>
  );
}

export const CHANNEL_LABEL: Record<string, string> = {
  WECHAT: "微信",
  MANUAL: "手动导入",
  WEB_FORM: "Web 表单",
  REALTIME: "实时",
};

/** actor 字段（admin:<id> / agent:<name> / system / expert:<role>）→ 可读文案 */
export function actorLabel(actor: string): string {
  if (actor === "system") return "系统";
  if (actor.startsWith("admin")) return "管理员";
  if (actor.startsWith("agent:")) return actor.slice(6);
  if (actor.startsWith("expert:")) {
    const r = actor.slice(7);
    return r === "PRODUCT" ? "产品专家" : r === "PM" ? "项管专家" : r === "TEST" ? "测试专家" : r;
  }
  return actor;
}
