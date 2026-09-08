"use client";

import { useEffect, useState } from "react";
import { Panel, Chip, Label, Notice, btnCls, EmptyState } from "@/components/ui";
import { Icon } from "@/components/icons";
import { api, CopyButton, useAction, useToast } from "@/components/ui-client";

// 系统参数（运行参数 / 定时任务 / 其它 / Web 表单入口）+ 项目共享上下文

interface Snapshot {
  numbers: Record<string, number>;
  crons: Record<string, string>;
  strings: Record<string, string>;
  overridden: string[];
}

const NUMBER_FIELDS = [
  { key: "aggWindowMinutes", label: "微信聚合窗口（分钟）", hint: "会话静默该时长后合并为一条需求线索" },
  { key: "claimTimeoutHours", label: "认领心跳超时（小时）", hint: "超时未心跳的任务自动释放回池" },
  { key: "dailyTokenLimit", label: "LLM 日消耗上限（tokens）", hint: "0 = 不限；超限次日在工作台告警" },
  { key: "botHeartbeatAlertMinutes", label: "Bot 心跳告警阈值（分钟）", hint: "超过则工作台系统状态标红" },
];
const CRON_FIELDS = [
  { key: "cronDailyBranch", label: "每日分支创建" },
  { key: "cronRankPools", label: "待开发池重排" },
  { key: "cronDailyReport", label: "日报生成" },
  { key: "cronUsageRollup", label: "用量汇总与告警" },
];

export function SystemTab() {
  const toast = useToast();
  const { run, busy } = useAction();
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [loadErr, setLoadErr] = useState("");

  async function load() {
    const r = await api<{ snapshot: Snapshot }>("/api/admin/system-config");
    if (r.ok) {
      const snapshot = r.data.snapshot;
      setSnap(snapshot);
      const d: Record<string, string> = {};
      for (const [k, v] of Object.entries(snapshot.numbers)) d[k] = String(v);
      for (const [k, v] of Object.entries(snapshot.crons)) d[k] = v;
      for (const [k, v] of Object.entries(snapshot.strings)) d[k] = v;
      setDraft(d);
    } else setLoadErr(r.message);
  }
  useEffect(() => {
    load();
  }, []);

  async function save(key: string, value: string, okText = "已保存") {
    const r = await run(`save-${key}`, "/api/admin/system-config", { method: "PUT", body: { key, value } }, okText);
    if (r.ok) await load();
  }
  const overridden = (k: string) => snap?.overridden.includes(k);

  if (loadErr) return <Notice tone="danger">读取系统参数失败：{loadErr}</Notice>;
  if (!snap) return <Panel><EmptyState compact title="加载中…" /></Panel>;

  const Row = ({ k, label, hint, mono = false, type = "text" }: { k: string; label: string; hint?: string; mono?: boolean; type?: string }) => (
    <div className="flex flex-wrap items-center gap-3 border-b border-line py-3 last:border-b-0">
      <div className="min-w-[220px] flex-1">
        <p className="flex items-center gap-2 text-[13px] text-ink">
          {label}
          {overridden(k) && <Chip tone="blue">已覆盖默认</Chip>}
        </p>
        {hint && <p className="text-[12px] text-ink-3">{hint}</p>}
      </div>
      <input type={type} className={`ctl ctl-sm w-[220px] ${mono ? "font-mono" : "num"}`} value={draft[k] ?? ""} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} />
      <button className={btnCls("secondary", "sm")} disabled={busy === `save-${k}`} onClick={() => save(k, draft[k] ?? "")}>
        保存
      </button>
      {overridden(k) && (
        <button className={btnCls("ghost", "sm")} onClick={() => save(k, "", "已恢复默认")}>
          恢复默认
        </button>
      )}
    </div>
  );

  const webUrl = snap.strings.webFormToken ? `${typeof window !== "undefined" ? window.location.origin : ""}/submit?token=${snap.strings.webFormToken}` : "";

  return (
    <>
      <Panel title="运行参数">
        {NUMBER_FIELDS.map((f) => (
          <Row key={f.key} k={f.key} label={f.label} hint={f.hint} type="number" />
        ))}
        <div className="flex flex-wrap items-center gap-3 py-3">
          <div className="min-w-[220px] flex-1">
            <p className="flex items-center gap-2 text-[13px] text-ink">
              开发 / 测试互斥
              {overridden("devTestExclusive") && <Chip tone="blue">已覆盖默认</Chip>}
            </p>
            <p className="text-[12px] text-ink-3">同一需求的开发 Agent 不能认领它的测试任务</p>
          </div>
          <label className="flex items-center gap-2 text-[13px] text-ink">
            <input type="checkbox" className="chk" checked={snap.numbers.devTestExclusive === 1} onChange={(e) => save("devTestExclusive", e.target.checked ? "1" : "0", e.target.checked ? "已开启互斥" : "已关闭互斥")} />
            {snap.numbers.devTestExclusive === 1 ? "开启" : "关闭"}
          </label>
        </div>
      </Panel>

      <Panel title="定时任务" extra={<span className="text-[12px] text-ink-3">5 段 cron · 上海时区 · 保存后 5 分钟内生效</span>}>
        {CRON_FIELDS.map((f) => (
          <Row key={f.key} k={f.key} label={f.label} mono />
        ))}
      </Panel>

      <Panel title="其它">
        <Row k="wechatBotName" label="微信机器人昵称" hint="采集模式为「@ 触发」时匹配 @昵称；留空则任意 @ 触发" />
        <div className="flex flex-col gap-2 py-3">
          <div className="flex items-center gap-2">
            <p className="text-[13px] text-ink">LLM 单价表（JSON）</p>
            {overridden("llmPrices") && <Chip tone="blue">已覆盖默认</Chip>}
          </div>
          <p className="text-[12px] text-ink-3">每百万 token 美元，用于工作台成本估算。示例：{`{"deepseek-v4-flash":{"input":0.14,"output":0.28}}`}</p>
          <textarea className="ctl font-mono" rows={3} value={draft.llmPrices ?? ""} onChange={(e) => setDraft({ ...draft, llmPrices: e.target.value })} placeholder='{"model":{"input":0,"output":0}}' />
          <div className="flex gap-2">
            <button className={btnCls("secondary", "sm")} disabled={busy === "save-llmPrices"} onClick={() => save("llmPrices", draft.llmPrices ?? "")}>
              保存
            </button>
            {overridden("llmPrices") && (
              <button className={btnCls("ghost", "sm")} onClick={() => save("llmPrices", "", "已清空")}>
                清空
              </button>
            )}
          </div>
        </div>
      </Panel>

      <Panel title="Web 表单入口" extra={snap.strings.webFormToken ? <Chip tone="green">已开放</Chip> : <Chip tone="slate">未开放</Chip>}>
        <p className="mb-3 text-[12px] leading-relaxed text-ink-2">给客户或团队成员一个不需登录的需求提交页（PRD 入口 C）。链接带令牌，重新生成后旧链接失效。</p>
        {snap.strings.webFormToken && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-line bg-surface-2 px-3 py-2">
            <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink">{webUrl}</span>
            <CopyButton text={webUrl} label="复制链接" />
            <a href={`/submit?token=${snap.strings.webFormToken}`} target="_blank" rel="noreferrer" className={btnCls("ghost", "sm")}>
              <Icon name="external" size={13} />
              打开
            </a>
          </div>
        )}
        <div className="flex gap-2">
          <button className={btnCls(snap.strings.webFormToken ? "secondary" : "primary", "sm")} disabled={busy === "token"} onClick={async () => { const r = await run("token", "/api/admin/system-config/web-form-token", { method: "POST", body: {} }, snap.strings.webFormToken ? "已重新生成，旧链接失效" : "入口已开放"); if (r.ok) await load(); }}>
            {snap.strings.webFormToken ? "重新生成令牌" : "开放入口"}
          </button>
          {snap.strings.webFormToken && (
            <button className={btnCls("danger", "sm")} onClick={() => { void save("webFormToken", "", "入口已关闭"); }}>
              关闭入口
            </button>
          )}
        </div>
      </Panel>
    </>
  );
}

export function ContextEditor({ projects }: { projects: { id: string; name: string }[] }) {
  const toast = useToast();
  const [openId, setOpenId] = useState("");
  const [content, setContent] = useState("");
  const [readable, setReadable] = useState(true);
  const [loading, setLoading] = useState(false);

  async function open(id: string) {
    setOpenId(id);
    if (!id) return;
    setLoading(true);
    const r = await api<{ content: string | null; readable: boolean }>(`/api/admin/projects/${id}/context`);
    if (r.ok) {
      setContent(r.data.content ?? "# 项目共享上下文\n\n（写给开发/测试 Agent 的项目要点：架构、约定、当前迭代重点）\n");
      setReadable(r.data.readable);
    } else toast("error", r.message);
    setLoading(false);
  }
  async function save() {
    setLoading(true);
    const r = await api(`/api/admin/projects/${openId}/context`, { method: "PUT", body: { content } });
    setLoading(false);
    if (r.ok) toast("ok", "已提交，将 commit 到仓库 docs/agent-context.md");
    else toast("error", r.message);
  }

  return (
    <Panel title="项目共享上下文" extra={<span className="font-mono text-[12px] text-ink-3">docs/agent-context.md</span>}>
      <p className="mb-3 text-[12px] leading-relaxed text-ink-2">每个开发 / 测试 Agent 认领任务时都会读到这份内容（架构要点、约定、当前迭代重点）。保存后由 worker commit 到当日分支，随晚间合并进 main。</p>
      <div className="flex flex-col gap-3">
        <select className="ctl w-auto min-w-[200px]" value={openId} onChange={(e) => open(e.target.value)}>
          <option value="">选择项目</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        {openId && (
          <>
            {!readable && <Notice tone="warn">仓库不可达：检查 GITHUB_BOT_PAT 与仓库地址。保存会排队，等仓库可用后写入。</Notice>}
            <textarea className="ctl min-h-[220px] font-mono text-[12px]" value={content} onChange={(e) => setContent(e.target.value)} disabled={loading} />
            <div>
              <button className={btnCls("primary", "sm")} disabled={loading} onClick={save}>
                {loading ? "处理中…" : "保存并提交入仓"}
              </button>
            </div>
          </>
        )}
      </div>
    </Panel>
  );
}
