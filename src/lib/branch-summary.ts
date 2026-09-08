// 分支审查页数据模型（PRD #25）：DailyBranch.reviewSummary 的 JSON 形状与纯函数解析工具。
// 本文件不依赖 git / prisma，服务端组件、API 路由均可直接引用；
// 真实计算在 src/lib/git.ts buildBranchSummary（仅 worker 调用）。

export interface BranchSummaryCommit {
  /** 短 sha */
  sha: string;
  /** 提交标题（首行） */
  message: string;
  author: string;
  /** ISO 时间 */
  date: string;
  /** 从提交信息解析出的 REQ 序号（"REQ-12" / "merge feature/REQ-12"），无则 null */
  reqSeq: number | null;
}

export interface BranchSummaryRequirement {
  seq: number;
  featureBranch: string;
  /** daily 上对应的合并提交（短 sha）；未合入或已被 revert 剔除则 null */
  mergeSha: string | null;
  files: number;
  insertions: number;
  deletions: number;
  /** 变更文件路径（最多 MAX_CHANGED_FILES 条） */
  changedFiles: string[];
}

export interface BranchSummary {
  /** 刷新时间 ISO */
  refreshedAt: string;
  /** 比较基线（merge-base main...daily 的短 sha；daily 已入 main 时为那次合并的第一父提交） */
  baseCommit: string | null;
  /** daily 分支顶端短 sha */
  headCommit: string | null;
  totals: { commits: number; files: number; insertions: number; deletions: number };
  /** 最新在前，最多 MAX_COMMITS 条 */
  commits: BranchSummaryCommit[];
  perRequirement: BranchSummaryRequirement[];
  /** 仓库不可达 / 分支不存在等错误信息；页面据此提示（此时其余字段为上次结果或空） */
  error?: string;
}

export const MAX_COMMITS = 50;
export const MAX_CHANGED_FILES = 200;

export function emptyBranchSummary(error?: string): BranchSummary {
  const s: BranchSummary = {
    refreshedAt: new Date().toISOString(),
    baseCommit: null,
    headCommit: null,
    totals: { commits: 0, files: 0, insertions: 0, deletions: 0 },
    commits: [],
    perRequirement: [],
  };
  if (error) s.error = error;
  return s;
}

/** 从提交信息解析 REQ 序号：匹配 "REQ-12"（不匹配 "REQ-123" 的前缀） */
export function parseReqSeq(message: string): number | null {
  const m = /\bREQ-(\d+)(?!\d)/i.exec(message);
  return m ? Number(m[1]) : null;
}

/** 提交信息是否提及某需求（REQ-<seq> 或其 feature 分支名） */
export function mentionsRequirement(message: string, seq: number, featureBranch?: string | null): boolean {
  if (new RegExp(`\\bREQ-${seq}(?!\\d)`, "i").test(message)) return true;
  if (featureBranch) {
    const escaped = featureBranch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`${escaped}(?![\\w-])`).test(message)) return true;
  }
  return false;
}

/** 解析 `git diff --shortstat` 输出：" 3 files changed, 10 insertions(+), 2 deletions(-)" */
export function parseShortStat(text: string): { files: number; insertions: number; deletions: number } {
  const files = /(\d+) files? changed/.exec(text);
  const ins = /(\d+) insertions?\(\+\)/.exec(text);
  const del = /(\d+) deletions?\(-\)/.exec(text);
  return {
    files: files ? Number(files[1]) : 0,
    insertions: ins ? Number(ins[1]) : 0,
    deletions: del ? Number(del[1]) : 0,
  };
}

/** 解析 `git diff --numstat` 输出：每行 "<ins>\t<del>\t<path>"，二进制文件为 "-\t-\t<path>" */
export function parseNumstat(text: string): {
  files: number;
  insertions: number;
  deletions: number;
  changedFiles: string[];
} {
  let insertions = 0;
  let deletions = 0;
  const changedFiles: string[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const [ins, del, ...rest] = line.split("\t");
    const file = rest.join("\t").trim();
    if (!file) continue;
    if (ins !== "-") insertions += Number(ins) || 0;
    if (del !== "-") deletions += Number(del) || 0;
    changedFiles.push(file);
  }
  return {
    files: changedFiles.length,
    insertions,
    deletions,
    changedFiles: changedFiles.slice(0, MAX_CHANGED_FILES),
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

/** 安全解析 DailyBranch.reviewSummary（旧格式 / 伪造数据 / null 一律返回 null） */
export function parseBranchSummary(json: unknown): BranchSummary | null {
  if (!isRecord(json)) return null;
  if (typeof json.refreshedAt !== "string" || !isRecord(json.totals)) return null;
  const t = json.totals;
  const commits: BranchSummaryCommit[] = Array.isArray(json.commits)
    ? json.commits.filter(isRecord).map((c) => ({
        sha: str(c.sha),
        message: str(c.message),
        author: str(c.author),
        date: str(c.date),
        reqSeq: typeof c.reqSeq === "number" ? c.reqSeq : null,
      }))
    : [];
  const perRequirement: BranchSummaryRequirement[] = Array.isArray(json.perRequirement)
    ? json.perRequirement.filter(isRecord).map((p) => ({
        seq: num(p.seq),
        featureBranch: str(p.featureBranch),
        mergeSha: strOrNull(p.mergeSha),
        files: num(p.files),
        insertions: num(p.insertions),
        deletions: num(p.deletions),
        changedFiles: Array.isArray(p.changedFiles) ? p.changedFiles.filter((f): f is string => typeof f === "string") : [],
      }))
    : [];
  const out: BranchSummary = {
    refreshedAt: json.refreshedAt,
    baseCommit: strOrNull(json.baseCommit),
    headCommit: strOrNull(json.headCommit),
    totals: { commits: num(t.commits), files: num(t.files), insertions: num(t.insertions), deletions: num(t.deletions) },
    commits,
    perRequirement,
  };
  if (typeof json.error === "string" && json.error) out.error = json.error;
  return out;
}
