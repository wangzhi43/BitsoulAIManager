"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Panel, Label, Chip, btnCls } from "@/components/ui";
import { Icon } from "@/components/icons";
import { Modal, ConfirmDialog, CopyButton, useAction, useToast } from "@/components/ui-client";

export interface DetailData {
  id: string;
  seq: number;
  title: string;
  status: string;
  priority: string | null;
  priorityReason: string | null;
  priorityLocked: boolean;
  complexity: string;
  moduleGuess: string | null;
  projectId: string | null;
  projectName: string | null;
  source: { channel: string; sender: string | null; customer: string | null; wechat: boolean };
  userStory: string;
  acceptance: string[];
  clarifications: { question: string; answer: string | null }[];
  featureBranch: string | null;
  daily: { id: string; name: string; mergedToMain: boolean } | null;
  devTask: { id: string; status: string; agent: string | null; submitNote: string | null; selfTest: string | null; commits: string[]; submittedAt: string | null; claimedAt: string | null; lastHeartbeat: string | null } | null;
  testTask: { id: string; status: string; agent: string | null; caseCount: number; cases: { step: string; expected: string; tag: string }[] } | null;
  report: { conclusion: string; passRate: number; agent: string | null; createdAt: string; repoFilePath: string | null; results: { caseIdx: number; pass: boolean; note?: string }[]; defects: { desc: string }[] } | null;
  rawMessages: { sender: string; ts: string | null; text: string }[];
  attachments: { name: string; mime: string }[];
  parent: { id: string; seq: number; title: string; status: string } | null;
  defects: { id: string; seq: number; title: string; status: string }[];
  siblings: { id: string; seq: number; title: string; status: string }[];
  createdAt: string;
  updatedAt: string;
  events: { at: string; actor: string; note: string; from: string | null; to: string }[];
}

const DEMO_MSG = "展示模式下操作不生效";

export function RefreshButton() {
  const router = useRouter();
  return (
    <button className={btnCls("secondary")} onClick={() => router.refresh()}>
      <Icon name="refresh" size={14} />
      刷新
    </button>
  );
}

/** 用例表（默认折叠 5 行） */
export function CasesTable({ rows }: { rows: { idx: number; step: string; expected: string; tag: string; pass: boolean | null; note: string | null }[] }) {
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, 5);
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="bg-surface-2 text-left text-[12px] text-ink-3">
            <th className="w-8 border-b border-line px-4 py-2 font-medium">#</th>
            <th className="border-b border-line px-3 py-2 font-medium">用例</th>
            <th className="border-b border-line px-3 py-2 font-medium">预期</th>
            <th className="border-b border-line px-3 py-2 font-medium">标签</th>
            <th className="border-b border-line px-3 py-2 font-medium">结果</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {shown.map((r) => (
            <tr key={r.idx}>
              <td className="num px-4 py-2 font-mono text-[12px] text-ink-3">{r.idx + 1}</td>
              <td className="px-3 py-2 text-ink">{r.step}</td>
              <td className="px-3 py-2 text-ink-2">{r.expected}</td>
              <td className="px-3 py-2">
                <Chip tone="outline">{r.tag}</Chip>
              </td>
              <td className="px-3 py-2">
                {r.pass == null ? <span className="text-ink-3">—</span> : r.pass ? <Chip tone="green">通过</Chip> : <Chip tone="red" title={r.note ?? undefined}>失败</Chip>}
                {r.note && !r.pass && <span className="ml-1.5 text-[12px] text-ink-3">{r.note}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 5 && (
        <button className="w-full border-t border-line py-2 text-center text-[12px] text-ink-3 hover:text-ink" onClick={() => setAll(!all)}>
          {all ? "收起" : `还有 ${rows.length - 5} 条 · 展开全部`}
        </button>
      )}
    </div>
  );
}

/** 澄清问题：答复录入 + 生成微信文案 */
export function ClarifyPanel({ d, demo }: { d: DetailData; demo: boolean }) {
  const toast = useToast();
  const { run, busy } = useAction();
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [text, setText] = useState<{ message: string; sentToWechat: boolean } | null>(null);
  const open = d.clarifications.filter((c) => !c.answer).length;

  async function save(i: number) {
    if (demo) return toast("info", DEMO_MSG);
    const a = (answers[i] ?? "").trim();
    if (!a) return;
    const next = d.clarifications.map((c, j) => (j === i ? { question: c.question, answer: a } : c));
    await run("answer", `/api/admin/requirements/${d.id}`, { method: "PATCH", body: { clarifications: next } }, "答复已保存");
  }
  async function gen() {
    if (demo) return toast("info", DEMO_MSG);
    const r = await run<{ message: string; sentToWechat: boolean }>("clarify", `/api/admin/requirements/${d.id}/clarify-message`, { method: "POST", body: {} });
    if (r.ok) setText(r.data);
  }
  const editable = d.status === "PENDING_CONFIRM" || d.status === "READY";

  return (
    <Panel
      title={`澄清问题（${d.clarifications.length}）`}
      extra={
        open > 0 && (
          <button className={btnCls("secondary", "sm")} onClick={gen} disabled={busy === "clarify"}>
            <Icon name="send" size={13} />
            {d.source.wechat ? "发给客户确认" : "生成提问文案"}
          </button>
        )
      }
    >
      <div className="flex flex-col gap-2">
        {d.clarifications.map((c, i) => (
          <div key={i} className={`flex flex-col gap-2 rounded-md border px-3 py-2.5 ${c.answer ? "border-line bg-surface-2" : "border-warn-line bg-warn-soft"}`}>
            <span className="text-[13px] text-ink">{c.question}</span>
            {c.answer ? (
              <span className="text-[12px] text-ink-2">
                <span className="text-ok">已答复：</span>
                {c.answer}
              </span>
            ) : editable ? (
              <div className="flex gap-2">
                <input className="ctl ctl-sm flex-1" placeholder="填写客户答复" value={answers[i] ?? ""} onChange={(e) => setAnswers({ ...answers, [i]: e.target.value })} />
                <button className={btnCls("secondary", "sm")} disabled={!(answers[i] ?? "").trim() || busy === "answer"} onClick={() => save(i)}>
                  保存
                </button>
              </div>
            ) : (
              <Chip tone="amber">未答复</Chip>
            )}
          </div>
        ))}
      </div>
      <Modal open={!!text} onClose={() => setText(null)} title="澄清问题文案" footer={text && <CopyButton text={text.message} label="复制文案" />}>
        {text && (
          <>
            <p className="mb-2 text-[12px] text-ink-3">{text.sentToWechat ? "已加入微信发送队列；也可复制后手动转发。" : "该需求来源不是微信，请复制后手动发给客户。"}</p>
            <pre className="whitespace-pre-wrap rounded-md border border-line bg-surface-2 p-3 font-sans text-[13px] leading-relaxed text-ink">{text.message}</pre>
          </>
        )}
      </Modal>
    </Panel>
  );
}

type Dlg = null | "reject" | "reparse" | "edit" | "split" | "priority" | "release" | "exclude" | "cherry" | "sendback" | "hold" | "close" | "accept";

/** 当前动作：只展示该状态下能做的事 */
export function ActionPanel({ d, projects, demo }: { d: DetailData; projects: { id: string; name: string }[]; demo: boolean }) {
  const toast = useToast();
  const { run, busy } = useAction();
  const [dlg, setDlg] = useState<Dlg>(null);
  const [projectId, setProjectId] = useState(d.projectId ?? "");
  const [edit, setEdit] = useState({ title: d.title, userStory: d.userStory, acceptance: d.acceptance.join("\n"), complexity: d.complexity, moduleGuess: d.moduleGuess ?? "" });
  const [parts, setParts] = useState<{ title: string; userStory: string; acceptance: string; complexity: string }[]>([]);
  const [prio, setPrio] = useState({ priority: d.priority ?? "P2", locked: d.priorityLocked });

  const guard = () => {
    if (demo) toast("info", DEMO_MSG);
    return demo;
  };
  const base = `/api/admin/requirements/${d.id}`;
  const post = (key: string, path: string, body: unknown, ok?: string) => (guard() ? Promise.resolve({ ok: false as const, status: 0, message: DEMO_MSG }) : run(key, path, { method: "POST", body }, ok));

  const s = d.status;
  const claimedDev = d.devTask?.status === "CLAIMED";
  const conflict = d.devTask?.status === "CONFLICT";
  const claimedTest = d.testTask?.status === "CLAIMED";
  const canExclude = !!d.featureBranch && !!d.daily && ["PENDING_TEST", "TESTING", "REVIEWING", "PENDING_ACCEPT"].includes(s);
  const canCherry = !!d.featureBranch && !!d.daily && !d.daily.mergedToMain && ["PENDING_ACCEPT", "ACCEPTED"].includes(s);

  let primary: React.ReactNode = null;
  const secondary: React.ReactNode[] = [];
  let hint = "";

  if (s === "PENDING_CONFIRM") {
    primary = (
      <>
        <select className={`ctl ${!projectId ? "border-danger-line" : ""}`} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          <option value="">选择所属项目</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button className={btnCls("primary", "md", "w-full")} disabled={busy === "confirm" || !projectId} onClick={() => post("confirm", `${base}/confirm`, { projectId }, "已进入待开发池")}>
          <Icon name="check" size={14} />
          确认进入待开发
        </button>
      </>
    );
    secondary.push(
      <button key="edit" className={btnCls("secondary", "sm")} onClick={() => setDlg("edit")}>
        <Icon name="edit" size={13} />
        编辑
      </button>,
      <button
        key="split"
        className={btnCls("secondary", "sm")}
        onClick={() => {
          const half = Math.ceil(d.acceptance.length / 2);
          setParts([
            { title: d.title, userStory: d.userStory, acceptance: d.acceptance.slice(0, half).join("\n"), complexity: d.complexity },
            { title: `${d.title}（二）`, userStory: d.userStory, acceptance: d.acceptance.slice(half).join("\n"), complexity: d.complexity },
          ]);
          setDlg("split");
        }}
      >
        <Icon name="split" size={13} />
        拆分
      </button>,
      <button key="reject" className={btnCls("danger", "sm")} onClick={() => setDlg("reject")}>
        驳回
      </button>,
      <button key="reparse" className={btnCls("secondary", "sm")} onClick={() => setDlg("reparse")}>
        驳回重拆
      </button>,
    );
    hint = "确认后进入待开发池，项管专家自动排优先级并写入 requirements-log.md。";
  } else if (s === "READY") {
    primary = (
      <button className={btnCls("primary", "md", "w-full")} onClick={() => setDlg("priority")}>
        调整优先级
      </button>
    );
    secondary.push(
      <button key="edit" className={btnCls("secondary", "sm")} onClick={() => setDlg("edit")}>
        <Icon name="edit" size={13} />
        编辑
      </button>,
      <button key="hold" className={btnCls("secondary", "sm")} onClick={() => setDlg("hold")}>
        挂起
      </button>,
      <button key="close" className={btnCls("danger", "sm")} onClick={() => setDlg("close")}>
        关闭
      </button>,
    );
    hint = "等待开发 Agent 认领；锁定优先级后项管专家不再改动。";
  } else if (s === "DEVELOPING") {
    if (conflict) {
      primary = (
        <button className={btnCls("primary", "md", "w-full")} disabled={busy === "retry"} onClick={() => post("retry", `${base}/retry-merge`, {}, "已重新排队合并")}>
          <Icon name="refresh" size={14} />
          重试合并
        </button>
      );
      secondary.push(
        <button key="ex" className={btnCls("secondary", "sm")} onClick={() => setDlg("exclude")}>
          剔除并回待开发
        </button>,
      );
      hint = "先在本地解决冲突并 push 到 feature 分支，再重试。";
    } else {
      primary = claimedDev ? (
        <button className={btnCls("secondary", "md", "w-full")} onClick={() => setDlg("release")}>
          强制释放认领
        </button>
      ) : (
        <p className="text-[12px] text-ink-2">开发已提交，平台正在合并到当日分支。</p>
      );
      hint = claimedDev ? `${d.devTask?.agent} 开发中；心跳超时会自动释放。` : "";
    }
    secondary.push(
      <button key="hold" className={btnCls("secondary", "sm")} onClick={() => setDlg("hold")}>
        挂起
      </button>,
      <button key="close" className={btnCls("danger", "sm")} onClick={() => setDlg("close")}>
        关闭
      </button>,
    );
  } else if (s === "PENDING_TEST" || s === "TESTING") {
    primary = claimedTest ? (
      <button className={btnCls("secondary", "md", "w-full")} onClick={() => setDlg("release")}>
        强制释放测试认领
      </button>
    ) : (
      <p className="text-[12px] text-ink-2">{d.testTask ? "等待测试 Agent 认领用例。" : "测试专家正在生成用例。"}</p>
    );
    if (canExclude)
      secondary.push(
        <button key="ex" className={btnCls("secondary", "sm")} onClick={() => setDlg("exclude")}>
          剔除回待开发
        </button>,
      );
    secondary.push(
      <button key="hold" className={btnCls("secondary", "sm")} onClick={() => setDlg("hold")}>
        挂起
      </button>,
      <button key="close" className={btnCls("danger", "sm")} onClick={() => setDlg("close")}>
        关闭
      </button>,
    );
  } else if (s === "REVIEWING") {
    primary = (
      <button className={btnCls("primary", "md", "w-full")} disabled={busy === "approve"} onClick={() => post("approve", `${base}/accept`, { action: "approve_partial" }, "已放行到待验收")}>
        裁决放行
      </button>
    );
    secondary.push(
      <button key="sb" className={btnCls("secondary", "sm")} onClick={() => setDlg("sendback")}>
        退回重做
      </button>,
    );
    if (canExclude)
      secondary.push(
        <button key="ex" className={btnCls("secondary", "sm")} onClick={() => setDlg("exclude")}>
          剔除回待开发
        </button>,
      );
    hint = "部分用例未通过。放行表示接受当前结果进入待验收。";
  } else if (s === "PENDING_ACCEPT") {
    primary = (
      <button className={btnCls("primary", "md", "w-full")} disabled={busy === "accept"} onClick={() => post("accept", `${base}/accept`, { action: "accept" }, "验收通过")}>
        <Icon name="check" size={14} />
        验收通过
      </button>
    );
    secondary.push(
      <button key="sb" className={btnCls("secondary", "sm")} onClick={() => setDlg("sendback")}>
        退回待开发
      </button>,
    );
    if (canCherry)
      secondary.push(
        <button key="ch" className={btnCls("secondary", "sm")} onClick={() => setDlg("cherry")}>
          单独合入 main
        </button>,
      );
    hint = "验收通过后写入 requirements-log.md；分支需在「分支审查」页合并到 main。";
  } else if (s === "ACCEPTED") {
    primary = canCherry ? (
      <button className={btnCls("secondary", "md", "w-full")} onClick={() => setDlg("cherry")}>
        单独合入 main
      </button>
    ) : (
      <p className="text-[12px] text-ok">已验收{d.daily?.mergedToMain ? "，代码已在 main" : ""}。</p>
    );
  } else if (s === "CLOSED" || s === "ON_HOLD") {
    primary = (
      <button className={btnCls("primary", "md", "w-full")} disabled={busy === "resume"} onClick={() => post("resume", `${base}/state`, { action: "resume" }, "已恢复")}>
        恢复
      </button>
    );
    hint = "恢复后回到待开发池（曾有开发任务）或待确认。";
  }

  async function saveEdit() {
    if (guard()) return;
    const acceptance = edit.acceptance.split("\n").map((x) => x.trim()).filter(Boolean);
    if (!edit.title.trim() || !edit.userStory.trim() || !acceptance.length) return toast("error", "标题、用户故事、验收标准不能为空");
    const r = await run("edit", base, { method: "PATCH", body: { title: edit.title.trim(), userStory: edit.userStory.trim(), acceptance, complexity: edit.complexity, moduleGuess: edit.moduleGuess.trim() || null } }, "已保存");
    if (r.ok) setDlg(null);
  }
  async function submitSplit() {
    if (guard()) return;
    const body = parts.map((p) => ({ title: p.title.trim(), userStory: p.userStory.trim(), acceptance: p.acceptance.split("\n").map((x) => x.trim()).filter(Boolean), complexity: p.complexity }));
    if (body.some((p) => !p.title || !p.userStory || !p.acceptance.length)) return toast("error", "每一单都需要标题、用户故事和至少一条验收标准");
    const r = await run<{ seqs: number[] }>("split", `${base}/split`, { body: { parts: body } });
    if (r.ok) {
      toast("ok", `已拆分：${r.data.seqs.map((x) => `REQ-${x}`).join("、")}`);
      setDlg(null);
    }
  }

  return (
    <Panel>
      <div className="flex flex-col gap-2">
        <Label>当前动作</Label>
        {primary}
        {secondary.length > 0 && <div className="flex flex-wrap gap-1.5">{secondary}</div>}
        {hint && <p className="text-[12px] leading-relaxed text-ink-3">{hint}</p>}
      </div>

      <ConfirmDialog open={dlg === "reject"} onClose={() => setDlg(null)} title={`驳回 REQ-${d.seq}`} desc="本单关闭，不进入开发池。" confirmText="驳回并关闭" danger reason={{ label: "驳回原因", required: true }} busy={busy === "reject"} onConfirm={async (reason) => { const r = await post("reject", `${base}/reject`, { reason, reparse: false }, "已驳回"); if (r.ok) setDlg(null); }} />
      <ConfirmDialog open={dlg === "reparse"} onClose={() => setDlg(null)} title="驳回并重新拆解" desc="整个线索交回产品专家重拆；同线索待确认单会被作废重建。" confirmText="驳回重拆" reason={{ label: "哪里拆得不对", required: true }} busy={busy === "reject"} onConfirm={async (reason) => { const r = await post("reject", `${base}/reject`, { reason, reparse: true }, "已交回重拆"); if (r.ok) setDlg(null); }} />
      <ConfirmDialog open={dlg === "release"} onClose={() => setDlg(null)} title="强制释放认领" desc={`任务将回到池中，${claimedDev ? d.devTask?.agent : d.testTask?.agent} 的认领被取消。`} confirmText="释放" danger busy={busy === "release"} onConfirm={async () => { const id = claimedDev ? d.devTask?.id : d.testTask?.id; const r = await post("release", `/api/admin/tasks/${id}/release`, {}, "已释放"); if (r.ok) setDlg(null); }} />
      <ConfirmDialog open={dlg === "exclude"} onClose={() => setDlg(null)} title="从当日分支剔除" desc="平台会 revert 该需求在 daily 上的合并提交，需求回到待开发池（feature 分支保留）。" confirmText="剔除" danger busy={busy === "exclude"} onConfirm={async () => { const r = await post("exclude", `${base}/exclude`, {}, "已排队剔除"); if (r.ok) setDlg(null); }} />
      <ConfirmDialog open={dlg === "cherry"} onClose={() => setDlg(null)} title="单独合入 main" desc="不等晚间合并，把这一个需求的合并提交 cherry-pick 到 main（异步执行）。" confirmText="合入 main" busy={busy === "cherry"} onConfirm={async () => { const r = await post("cherry", `${base}/cherry-pick`, {}, "已排队合入 main"); if (r.ok) setDlg(null); }} />
      <ConfirmDialog open={dlg === "sendback"} onClose={() => setDlg(null)} title="退回待开发" desc="需求回到待开发池重新认领开发。" confirmText="退回" danger reason={{ label: "退回原因", required: true }} busy={busy === "sendback"} onConfirm={async (note) => { const r = await post("sendback", `${base}/accept`, { action: "send_back", note }, "已退回待开发"); if (r.ok) setDlg(null); }} />
      <ConfirmDialog open={dlg === "hold"} onClose={() => setDlg(null)} title="挂起需求" desc="进行中的认领会被释放；可随时恢复。" confirmText="挂起" reason={{ label: "说明" }} busy={busy === "hold"} onConfirm={async (note) => { const r = await post("hold", `${base}/state`, { action: "hold", note: note || undefined }, "已挂起"); if (r.ok) setDlg(null); }} />
      <ConfirmDialog open={dlg === "close"} onClose={() => setDlg(null)} title="关闭需求" desc="关闭后不再流转；可在此页恢复。" confirmText="关闭" danger reason={{ label: "关闭原因" }} busy={busy === "close"} onConfirm={async (note) => { const r = await post("close", `${base}/state`, { action: "close", note: note || undefined }, "已关闭"); if (r.ok) setDlg(null); }} />

      <Modal open={dlg === "priority"} onClose={() => setDlg(null)} title="调整优先级" width="max-w-sm" footer={<button className={btnCls("primary")} disabled={busy === "prio"} onClick={async () => { const r = await post("prio", `${base}/priority`, prio, "优先级已更新"); if (r.ok) setDlg(null); }}>保存</button>}>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <Label>优先级</Label>
            <select className="ctl" value={prio.priority} onChange={(e) => setPrio({ ...prio, priority: e.target.value })}>
              <option value="P0">P0 阻塞 / 线上缺陷</option>
              <option value="P1">P1 高价值</option>
              <option value="P2">P2 常规</option>
              <option value="P3">P3 低优</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-[13px] text-ink">
            <input type="checkbox" className="chk" checked={prio.locked} onChange={(e) => setPrio({ ...prio, locked: e.target.checked })} />
            锁定（项管专家不再改动）
          </label>
        </div>
      </Modal>

      <Modal open={dlg === "edit"} onClose={() => setDlg(null)} title={`编辑 REQ-${d.seq}`} footer={<button className={btnCls("primary")} disabled={busy === "edit"} onClick={saveEdit}>保存</button>}>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1"><Label>标题</Label><input className="ctl" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></label>
          <label className="flex flex-col gap-1"><Label>用户故事</Label><textarea className="ctl" rows={3} value={edit.userStory} onChange={(e) => setEdit({ ...edit, userStory: e.target.value })} /></label>
          <label className="flex flex-col gap-1"><Label>验收标准（每行一条）</Label><textarea className="ctl" rows={5} value={edit.acceptance} onChange={(e) => setEdit({ ...edit, acceptance: e.target.value })} /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1"><Label>复杂度</Label><select className="ctl" value={edit.complexity} onChange={(e) => setEdit({ ...edit, complexity: e.target.value })}><option value="S">S</option><option value="M">M</option><option value="L">L</option></select></label>
            <label className="flex flex-col gap-1"><Label>涉及模块</Label><input className="ctl" value={edit.moduleGuess} onChange={(e) => setEdit({ ...edit, moduleGuess: e.target.value })} /></label>
          </div>
        </div>
      </Modal>

      <Modal open={dlg === "split"} onClose={() => setDlg(null)} title={`拆分 REQ-${d.seq}`} width="max-w-3xl" footer={<><button className={btnCls("secondary")} onClick={() => setParts([...parts, { title: "", userStory: d.userStory, acceptance: "", complexity: d.complexity }])}><Icon name="plus" size={13} />再加一单</button><button className={btnCls("primary")} disabled={busy === "split" || parts.length < 2} onClick={submitSplit}>拆分为 {parts.length} 单</button></>}>
        <p className="mb-3 text-[12px] text-ink-3">第一单保留原编号，其余为新编号；全部留在待确认队列。</p>
        <div className="flex flex-col gap-3">
          {parts.map((p, i) => (
            <div key={i} className="flex flex-col gap-2 rounded-md border border-line p-3">
              <div className="flex items-center justify-between"><span className="text-[12px] font-medium text-ink-2">第 {i + 1} 单</span>{parts.length > 2 && <button className="text-[12px] text-ink-3 hover:text-danger" onClick={() => setParts(parts.filter((_, j) => j !== i))}>移除</button>}</div>
              <div className="grid gap-2 sm:grid-cols-[1fr_120px]">
                <input className="ctl" placeholder="标题" value={p.title} onChange={(e) => setParts(parts.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
                <select className="ctl" value={p.complexity} onChange={(e) => setParts(parts.map((x, j) => (j === i ? { ...x, complexity: e.target.value } : x)))}><option value="S">S</option><option value="M">M</option><option value="L">L</option></select>
              </div>
              <textarea className="ctl" rows={2} placeholder="用户故事" value={p.userStory} onChange={(e) => setParts(parts.map((x, j) => (j === i ? { ...x, userStory: e.target.value } : x)))} />
              <textarea className="ctl" rows={3} placeholder="验收标准（每行一条）" value={p.acceptance} onChange={(e) => setParts(parts.map((x, j) => (j === i ? { ...x, acceptance: e.target.value } : x)))} />
            </div>
          ))}
        </div>
      </Modal>
    </Panel>
  );
}
