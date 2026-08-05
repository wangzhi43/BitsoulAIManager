"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PageHeader, Panel, Chip, btnCls } from "@/components/ui";
import { StatusChip, STATUS_LABEL } from "@/components/status";

// ---------- 视图数据类型（由 page.tsx 服务端查询映射而来） ----------

export interface ConvView {
  convId: string;
  convName: string | null;
  count: number;
}

export interface SourceView {
  id: string;
  channel: string;
  who: string;
  createdAtText: string;
  requirements: { seq: number; title: string; status: string }[];
}

// MOCK 数据：真实链路未接入时的界面填充，后续替换
const MOCK = {
  window: {
    option: "过去 30 分钟（10:30 – 11:00）",
    range: "10:30 – 11:00（30 分钟）",
  },
  projects: ["移动端改版项目", "官网改版项目", "小程序项目"],
  stats: { convCount: 5, msgCount: 23, senderCount: 4, attachmentCount: 6 },
  conversations: [
    { title: "会话1：产品功能沟通群（微信）", people: 8 },
    { title: "会话2：运营需求沟通群（微信）", people: 6 },
  ],
  messages: [
    {
      name: "张三",
      role: "产品",
      time: "10:31",
      text: "我们希望在移动端支持一键登录，优先支持微信登录，如果用户未绑定手机号，需要引导绑定。",
      tag: "原始文本",
    },
    {
      name: "李四",
      role: "设计",
      time: "10:33",
      text: "登录成功后跳转到首页，首屏展示个性化推荐内容，参考附件的设计稿。",
      images: [{ name: "登录与首页设计稿.png", size: "2.4 MB", thumbs: 2 }],
    },
    {
      name: "王五",
      role: "运营",
      time: "10:41",
      text: "另外，希望能统计登录转化率，需要埋点。接口文档在这里：",
      doc: { name: "登录相关接口文档.docx", size: "360 KB" },
    },
  ] as {
    name: string;
    role: string;
    time: string;
    text: string;
    tag?: string;
    images?: { name: string; size: string; thumbs: number }[];
    doc?: { name: string; size: string };
  }[],
  ai: {
    generatedAt: "10:45:12",
    summary:
      "本次聚合主要讨论了移动端登录优化需求，包括：一键登录（优先微信登录）、未绑定手机号用户引导绑定、登录成功后的首页跳转与个性化推荐展示、登录转化率统计与埋点需求。",
    project: "移动端改版项目",
    confidence: "85%",
    modules: ["用户认证", "首页", "数据统计"],
  },
  requirements: [
    {
      title: "移动端支持一键登录（优先微信登录）",
      desc: "在登录页提供一键登录能力，优先使用微信授权登录。",
      acceptance: ["登录页展示微信一键登录按钮", "点击后调起微信授权", "授权成功后完成登录"],
      complexity: "中",
      estimate: "2 人天",
      evidence: "张三 10:31 的消息",
      attachment: null as string | null,
    },
    {
      title: "未绑定手机号引导绑定",
      desc: "用户通过一键登录后，如未绑定手机号，需引导用户完成手机号绑定。",
      acceptance: ["检测到未绑定手机号时触发引导", "支持手机号输入与验证码校验", "绑定成功后可正常使用"],
      complexity: "中",
      estimate: "2 人天",
      evidence: "张三 10:31 的消息",
      attachment: null as string | null,
    },
    {
      title: "登录成功后跳转首页并展示个性化推荐",
      desc: "登录成功后跳转到首页，首屏展示个性化推荐内容。",
      acceptance: ["登录成功后自动跳转首页", "首页首屏展示个性化推荐内容", "参考设计稿实现"],
      complexity: "高",
      estimate: "3 人天",
      evidence: "李四 10:33 的消息",
      attachment: "登录与首页设计稿.png" as string | null,
    },
    {
      title: "统计登录转化率并埋点",
      desc: "统计登录转化率相关数据，并完成埋点上报。",
      acceptance: ["记录登录流程各环节转化数据", "埋点数据准确上报", "可在数据看板查看"],
      complexity: "中",
      estimate: "2 人天",
      evidence: "王五 10:41 的消息",
      attachment: "登录相关接口文档.docx" as string | null,
    },
  ],
  clarifications: [
    "个性化推荐的具体策略和接口是否已有定义？",
    "登录转化率的统计口径是什么？需要统计哪些环节？",
  ],
  detail: { createdAt: "2024-05-20 10:45:12" },
  timeline: [
    { tone: "green", label: "AI 完成拆解", time: "10:45:12" },
    { tone: "violet", label: "管理员修改项目归属", time: "10:47:03" },
    { tone: "blue", label: "管理员编辑需求 #2", time: "10:50:21" },
  ] as { tone: "green" | "violet" | "blue"; label: string; time: string }[],
};

const AVATAR_TONES = [
  "bg-blue-100 text-blue-700",
  "bg-pink-100 text-pink-700",
  "bg-amber-100 text-amber-700",
  "bg-violet-100 text-violet-700",
];

const demoAlert = () => alert("演示数据，功能待接入");

const linkCls = "text-[12px] font-medium text-blue-600 hover:underline";

function Chevron({ open, className = "" }: { open?: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""} ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 6l4 4 4-4" />
    </svg>
  );
}

function PersonIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor">
      <circle cx="8" cy="5" r="2.6" />
      <path d="M2.5 13.5a5.5 5.5 0 0 1 11 0z" />
    </svg>
  );
}

function ImageGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 text-slate-400" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="1.6" fill="currentColor" stroke="none" />
      <path d="M3 17l5-4 4 3 4-4 5 5" />
    </svg>
  );
}

// ---------- 手动导入表单（逻辑原样保留，仅按浅色样式契约重绘） ----------

const inputCls =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-[13px] text-slate-700 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none";

export function ImportForm() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [customer, setCustomer] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    try {
      const attachmentIds: string[] = [];
      for (const f of files) {
        const fd = new FormData();
        fd.append("file", f);
        const up = await fetch("/api/admin/upload", { method: "POST", body: fd });
        if (!up.ok) throw new Error(`附件 ${f.name} 上传失败`);
        attachmentIds.push((await up.json()).attachmentId);
      }
      const res = await fetch("/api/admin/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, customerName: customer || undefined, attachmentIds }),
      });
      if (!res.ok) throw new Error("导入失败");
      setText("");
      setCustomer("");
      setFiles([]);
      setMsg("已提交拆解，稍后在「确认」页查看结果");
      router.refresh();
    } catch (err) {
      setMsg(String(err instanceof Error ? err.message : err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <textarea
        className={`min-h-28 w-full ${inputCls}`}
        placeholder="粘贴聊天记录或需求描述…"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="flex flex-wrap items-center gap-2">
        <input
          className={`flex-1 ${inputCls}`}
          placeholder="客户名（可选）"
          value={customer}
          onChange={(e) => setCustomer(e.target.value)}
        />
        <label className={`${btnCls("secondary")} cursor-pointer`}>
          附件（{files.length}）
          <input
            type="file"
            multiple
            className="hidden"
            onChange={(e) => setFiles([...(e.target.files ?? [])])}
          />
        </label>
        <button type="submit" disabled={busy || !text.trim()} className={btnCls("primary")}>
          {busy ? "提交中…" : "提交拆解"}
        </button>
      </div>
      {msg && <p className="text-[12px] text-slate-500">{msg}</p>}
    </form>
  );
}

// ---------- 采集箱与 AI 拆解工作台 ----------

export function InboxWorkbench({ convs, sources }: { convs: ConvView[]; sources: SourceView[] }) {
  const router = useRouter();
  const [showImport, setShowImport] = useState(false);
  const [windowChoice, setWindowChoice] = useState(MOCK.window.option);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [projectFilter, setProjectFilter] = useState("ALL");
  const [aiProject, setAiProject] = useState(MOCK.ai.project);
  const [evidenceOpen, setEvidenceOpen] = useState(true);
  const [clarifyOpen, setClarifyOpen] = useState(true);

  // 真实需求单（来自最近的线索），带来源信息；为空时整体回退 MOCK
  const realReqs = useMemo(
    () =>
      sources.flatMap((s) =>
        s.requirements.map((r) => ({ ...r, who: s.who, createdAtText: s.createdAtText })),
      ),
    [sources],
  );
  const statusOptions = useMemo(() => Array.from(new Set(realReqs.map((r) => r.status))), [realReqs]);
  const filteredReal = statusFilter === "ALL" ? realReqs : realReqs.filter((r) => r.status === statusFilter);
  const usingRealReqs = realReqs.length > 0;
  const reqCount = usingRealReqs ? filteredReal.length : MOCK.requirements.length;

  // 统计卡：优先真实数据，为空回退 MOCK
  const pendingMsgCount = convs.reduce((sum, c) => sum + c.count, 0);
  const senderCount = new Set(sources.map((s) => s.who)).size;
  const stats = [
    { label: "会话数", value: convs.length || MOCK.stats.convCount },
    { label: "消息数", value: pendingMsgCount || MOCK.stats.msgCount },
    { label: "来源人数", value: senderCount || MOCK.stats.senderCount },
    { label: "附件数", value: MOCK.stats.attachmentCount },
  ];

  // 左栏会话：首个真实会话展开（消息明细无真实数据，回退 MOCK），其余折叠
  const conv1Title = convs[0]
    ? `会话1：${convs[0].convName ?? convs[0].convId}（微信）`
    : MOCK.conversations[0].title;
  const conv1MsgTotal = convs[0]?.count ?? MOCK.messages.length + 2;
  const restConvs =
    convs.length > 1
      ? convs.slice(1).map((c, i) => ({ title: `会话${i + 2}：${c.convName ?? c.convId}（微信）`, people: c.count }))
      : [MOCK.conversations[1]];

  const createdAtText = sources[0]?.createdAtText ?? MOCK.detail.createdAt;
  const sourceText = `${convs.length || MOCK.stats.convCount} 个会话 / ${pendingMsgCount || MOCK.stats.msgCount} 条消息`;

  const timelineDot: Record<string, string> = {
    green: "bg-green-500",
    violet: "bg-violet-500",
    blue: "bg-blue-500",
  };

  return (
    <>
      <PageHeader
        title="需求采集箱与 AI 拆解工作台"
        subtitle="从微信会话中聚合需求，AI 理解并拆解为可执行的需求单"
        actions={
          <>
            <button className={btnCls("ghost")} onClick={demoAlert}>
              使用指引
            </button>
            <button className={btnCls("secondary")} onClick={() => router.refresh()}>
              刷新
            </button>
            <button className={btnCls("primary")} onClick={() => setShowImport((v) => !v)}>
              手动导入
              <Chevron open={showImport} />
            </button>
          </>
        }
      />

      {showImport && (
        <Panel
          title="手动导入需求"
          extra={
            <button className={btnCls("ghost", "sm")} onClick={() => setShowImport(false)}>
              收起
            </button>
          }
          className="mb-4"
        >
          <ImportForm />
        </Panel>
      )}

      {/* 筛选条 + 小统计卡 */}
      <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-3 rounded-xl border border-slate-200 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <label className="flex items-center gap-2 text-[13px] text-slate-600">
          聚合窗口
          <select
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[13px] text-slate-700 focus:border-blue-500 focus:outline-none"
            value={windowChoice}
            onChange={(e) => setWindowChoice(e.target.value)}
          >
            {/* MOCK 数据：聚合窗口选项为界面填充，后续替换 */}
            <option>{MOCK.window.option}</option>
            <option>过去 1 小时</option>
            <option>今天</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-[13px] text-slate-600">
          状态
          <select
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[13px] text-slate-700 focus:border-blue-500 focus:outline-none"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="ALL">全部</option>
            {statusOptions.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s] ?? s}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-[13px] text-slate-600">
          项目
          <select
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[13px] text-slate-700 focus:border-blue-500 focus:outline-none"
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
          >
            {/* MOCK 数据：项目选项为界面填充，后续替换 */}
            <option value="ALL">全部</option>
            {MOCK.projects.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <div className="ml-auto grid grid-cols-2 gap-2 sm:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="min-w-[88px] rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-1.5 text-center">
              <p className="text-[11px] text-slate-400">{s.label}</p>
              <p className="text-[16px] font-bold leading-tight tabular-nums text-slate-900">{s.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 三栏主体 */}
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(300px,2fr)_minmax(380px,3fr)_260px]">
        {/* 左栏：来源会话与原始证据 */}
        <div className="space-y-4">
          <Panel
            title="来源会话与原始证据"
            extra={
              <button
                className="flex items-center gap-1 text-[12px] font-medium text-blue-600 hover:underline"
                onClick={() => setEvidenceOpen((v) => !v)}
              >
                {evidenceOpen ? "收起全部" : "展开全部"}
                <Chevron open={evidenceOpen} />
              </button>
            }
          >
            {/* 会话 1（展开）：标题用真实会话，消息明细回退 MOCK */}
            <div className="rounded-lg border border-slate-200">
              <div className="flex items-center gap-2.5 border-b border-slate-100 px-3 py-2.5">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-green-100 text-[12px] font-medium text-green-700">
                  微
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-slate-800">{conv1Title}</span>
                <span className="flex items-center gap-1 text-[12px] tabular-nums text-slate-400">
                  <PersonIcon />
                  {MOCK.conversations[0].people}
                </span>
              </div>

              {evidenceOpen && (
                <div className="space-y-4 p-3">
                  {/* MOCK 数据：消息明细为真实链路未接入时的界面填充，后续替换 */}
                  {MOCK.messages.map((m, i) => (
                    <div key={i} className="flex gap-2.5">
                      <span
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[13px] font-medium ${AVATAR_TONES[i % AVATAR_TONES.length]}`}
                      >
                        {m.name.slice(0, 1)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-[12px] font-medium text-slate-700">
                            {m.name}
                            <span className="ml-1 text-slate-400">（{m.role}）</span>
                          </span>
                          <span className="text-[11px] tabular-nums text-slate-400">{m.time}</span>
                        </div>
                        <div className="mt-1 rounded-lg bg-slate-50 px-2.5 py-2 text-[13px] leading-relaxed text-slate-600">
                          {m.text}
                        </div>
                        {m.tag && (
                          <span className="mt-1.5 inline-flex rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[11px] font-medium text-blue-600">
                            {m.tag}
                          </span>
                        )}
                        {m.images?.map((img) => (
                          <div key={img.name} className="mt-2">
                            <div className="flex gap-2">
                              {Array.from({ length: img.thumbs }).map((_, t) => (
                                <div
                                  key={t}
                                  className="flex h-16 w-20 items-center justify-center rounded-lg border border-slate-200 bg-slate-100"
                                >
                                  <ImageGlyph />
                                </div>
                              ))}
                            </div>
                            <p className="mt-1 text-[11px] text-slate-400">
                              {img.name} <span className="ml-1">{img.size}</span>
                            </p>
                          </div>
                        ))}
                        {m.doc && (
                          <div className="mt-2 flex items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-3 py-2">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-blue-600 text-[12px] font-bold text-white">
                              W
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-[12px] font-medium text-slate-700">{m.doc.name}</p>
                              <p className="text-[11px] text-slate-400">{m.doc.size}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}

                  <div className="flex items-center justify-between border-t border-slate-100 pt-2.5">
                    <span className="text-[12px] tabular-nums text-slate-400">共 {conv1MsgTotal} 条消息</span>
                    <button className={btnCls("secondary", "sm")} onClick={demoAlert}>
                      查看完整会话
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 其余会话（折叠卡） */}
            <ul className="mt-3 space-y-2">
              {restConvs.map((c) => (
                <li
                  key={c.title}
                  className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-3 py-2.5"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-green-100 text-[12px] font-medium text-green-700">
                    微
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-slate-800">{c.title}</span>
                  <span className="flex items-center gap-1 text-[12px] tabular-nums text-slate-400">
                    <PersonIcon />
                    {c.people}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>

          {/* 证据信息说明 */}
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
            <p className="text-[12px] font-medium text-amber-700">证据信息说明</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-amber-600">
              所有结论均基于 30 分钟聚合窗口内的消息，AI 结论可追溯至原始证据。
            </p>
          </div>
        </div>

        {/* 中栏：AI 理解与拆解结果 */}
        <Panel
          title={
            <span className="flex items-center gap-2">
              AI 理解与拆解结果
              <Chip tone="blue">AI 已完成</Chip>
            </span>
          }
          extra={<span className="text-[11px] tabular-nums text-slate-400">生成时间：{MOCK.ai.generatedAt}</span>}
        >
          {/* AI 摘要（MOCK 数据：真实链路未接入时的界面填充，后续替换） */}
          <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-3">
            <p className="text-[12px] font-semibold text-blue-700">AI 摘要</p>
            <p className="mt-1 text-[13px] leading-relaxed text-slate-600">{MOCK.ai.summary}</p>
          </div>

          {/* 所属项目 + 置信度 / 涉及模块（MOCK 数据：真实链路未接入时的界面填充，后续替换） */}
          <div className="mt-3 flex flex-wrap items-start justify-between gap-x-6 gap-y-3 border-b border-slate-100 pb-3">
            <div>
              <p className="text-[11px] text-slate-400">所属项目（AI 判断）</p>
              <div className="mt-1 flex flex-wrap items-center gap-2.5">
                <select
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[13px] text-slate-700 focus:border-blue-500 focus:outline-none"
                  value={aiProject}
                  onChange={(e) => setAiProject(e.target.value)}
                >
                  {MOCK.projects.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
                <span className="text-[12px] text-slate-500">
                  置信度：<span className="font-medium tabular-nums text-slate-700">{MOCK.ai.confidence}</span>
                </span>
                <button className={linkCls} onClick={demoAlert}>
                  修正归属
                </button>
              </div>
            </div>
            <div>
              <p className="text-[11px] text-slate-400">涉及模块（AI 猜测）</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {MOCK.ai.modules.map((mo) => (
                  <Chip key={mo} tone="blue">
                    {mo}
                  </Chip>
                ))}
                <button className={`ml-1 ${linkCls}`} onClick={demoAlert}>
                  调整
                </button>
              </div>
            </div>
          </div>

          {/* 拆解出的需求单 + 操作按钮行 */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-[13px] font-semibold text-slate-800">拆解出的需求单（{reqCount}）</h3>
            <div className="flex items-center gap-2">
              <button className={btnCls("secondary", "sm")} onClick={demoAlert}>
                重新拆解
              </button>
              <button className={btnCls("secondary", "sm")} onClick={demoAlert}>
                批量编辑
              </button>
              <button className={btnCls("primary", "sm")} onClick={demoAlert}>
                送入待确认（{reqCount}）
              </button>
            </div>
          </div>

          <ul className="mt-3 space-y-2.5">
            {usingRealReqs
              ? filteredReal.map((r, i) => {
                  // 真实需求单：标题/编号/状态/来源为真实数据；描述、验收标准、复杂度、预估
                  // 无对应字段，回退 MOCK 填充（后续替换）
                  const fill = MOCK.requirements[i % MOCK.requirements.length];
                  return (
                    <ReqCard
                      key={`${r.seq}`}
                      index={i}
                      title={r.title}
                      desc={fill.desc}
                      acceptance={fill.acceptance}
                      complexity={fill.complexity}
                      estimate={fill.estimate}
                      evidence={`${r.who} ${r.createdAtText} 的消息`}
                      attachment={fill.attachment}
                      seq={r.seq}
                      status={r.status}
                    />
                  );
                })
              : MOCK.requirements.map((r, i) => (
                  <ReqCard
                    key={r.title}
                    index={i}
                    title={r.title}
                    desc={r.desc}
                    acceptance={r.acceptance}
                    complexity={r.complexity}
                    estimate={r.estimate}
                    evidence={r.evidence}
                    attachment={r.attachment}
                  />
                ))}
            {usingRealReqs && filteredReal.length === 0 && (
              <p className="rounded-lg border border-dashed border-slate-300 py-6 text-center text-[12px] text-slate-400">
                当前筛选下暂无需求单
              </p>
            )}
          </ul>

          {/* 澄清问题折叠区（MOCK 数据：真实链路未接入时的界面填充，后续替换） */}
          <div className="mt-3 border-t border-slate-100 pt-2">
            <button
              className="mx-auto flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium text-slate-600 hover:bg-slate-50"
              onClick={() => setClarifyOpen((v) => !v)}
            >
              <Chevron open={clarifyOpen} />
              {clarifyOpen ? "收起" : "展开"}澄清问题（{MOCK.clarifications.length}）
            </button>
            {clarifyOpen && (
              <ul className="mt-2 space-y-2">
                {MOCK.clarifications.map((q, i) => (
                  <li
                    key={q}
                    className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-3 py-2.5"
                  >
                    <span className="min-w-0 flex-1 text-[13px] text-slate-600">
                      {i + 1}. {q}
                    </span>
                    <Chip tone="amber">待确认</Chip>
                    <button
                      className="text-slate-300 hover:text-slate-500"
                      onClick={demoAlert}
                      aria-label="查看澄清问题"
                    >
                      <Chevron className="-rotate-90" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Panel>

        {/* 右栏：详情信息 */}
        <Panel title="详情信息">
          <dl className="space-y-3">
            <div>
              <dt className="text-[11px] text-slate-400">聚合窗口</dt>
              {/* MOCK 数据：聚合窗口为界面填充，后续替换 */}
              <dd className="mt-0.5 text-[13px] tabular-nums text-slate-600">{MOCK.window.range}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-slate-400">创建时间</dt>
              <dd className="mt-0.5 text-[13px] tabular-nums text-slate-600">{createdAtText}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-slate-400">来源</dt>
              <dd className="mt-0.5 text-[13px] tabular-nums text-slate-600">{sourceText}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-slate-400">来源人数</dt>
              <dd className="mt-0.5 text-[13px] tabular-nums text-slate-600">
                {senderCount || MOCK.stats.senderCount} 人
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-slate-400">附件</dt>
              {/* MOCK 数据：附件数为界面填充，后续替换 */}
              <dd className="mt-0.5 text-[13px] tabular-nums text-slate-600">{MOCK.stats.attachmentCount} 个</dd>
            </div>
          </dl>

          {/* 操作记录时间线（MOCK 数据：真实链路未接入时的界面填充，后续替换） */}
          <h3 className="mb-2 mt-5 text-[13px] font-semibold text-slate-800">操作记录</h3>
          <ol className="relative ml-1.5 space-y-4 border-l border-slate-200 pl-4">
            {MOCK.timeline.map((t) => (
              <li key={t.label} className="relative">
                <span
                  className={`absolute -left-[21.5px] top-1 h-2.5 w-2.5 rounded-full ring-2 ring-white ${timelineDot[t.tone]}`}
                />
                <p className="text-[12px] text-slate-600">{t.label}</p>
                <p className="mt-0.5 text-[11px] tabular-nums text-slate-400">{t.time}</p>
              </li>
            ))}
          </ol>

          {/* 更多操作：无对应 API，点击提示演示 */}
          <h3 className="mb-2 mt-5 text-[13px] font-semibold text-slate-800">更多操作</h3>
          <div className="space-y-2">
            <button className={`${btnCls("secondary")} w-full`} onClick={demoAlert}>
              归档为噪声
            </button>
            <button className={`${btnCls("danger")} w-full`} onClick={demoAlert}>
              删除
            </button>
          </div>
        </Panel>
      </div>
    </>
  );
}

// 需求单卡片：序号蓝方块 + 标题/描述/来源证据 + 验收标准 + 复杂度/预估 + 编辑
function ReqCard({
  index,
  title,
  desc,
  acceptance,
  complexity,
  estimate,
  evidence,
  attachment,
  seq,
  status,
}: {
  index: number;
  title: string;
  desc: string;
  acceptance: string[];
  complexity: string;
  estimate: string;
  evidence: string;
  attachment: string | null;
  seq?: number;
  status?: string;
}) {
  return (
    <li className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex gap-3">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded bg-blue-600 text-[12px] font-semibold text-white">
          {index + 1}
        </span>
        <div className="grid min-w-0 flex-1 gap-x-5 gap-y-2 lg:grid-cols-[minmax(0,5fr)_minmax(0,4fr)_auto]">
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-slate-800">{title}</p>
            {(seq !== undefined || status) && (
              <div className="mt-1 flex flex-wrap items-center gap-2">
                {seq !== undefined && <span className="font-mono text-[11px] text-slate-400">REQ-{seq}</span>}
                {status && <StatusChip status={status} />}
                {status === "PENDING_CONFIRM" && (
                  <Link href="/confirm" className={linkCls}>
                    去待确认处理
                  </Link>
                )}
              </div>
            )}
            <p className="mt-1 text-[13px] leading-relaxed text-slate-600">{desc}</p>
            <p className="mt-1.5 text-[11px] text-slate-400">
              来源证据：
              <button
                className="rounded bg-blue-50 px-1.5 py-0.5 text-[11px] font-medium text-blue-600 hover:underline"
                onClick={demoAlert}
              >
                {evidence}
              </button>
            </p>
            {attachment && (
              <p className="mt-1 text-[11px] text-slate-400">
                附件：
                <button
                  className="rounded bg-blue-50 px-1.5 py-0.5 text-[11px] font-medium text-blue-600 hover:underline"
                  onClick={demoAlert}
                >
                  {attachment}
                </button>
              </p>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-[11px] text-slate-400">验收标准</p>
            <ol className="mt-1 space-y-0.5">
              {acceptance.map((a, i) => (
                <li key={i} className="text-[12px] leading-relaxed text-slate-600">
                  <span className="tabular-nums text-slate-400">{i + 1}.</span> {a}
                </li>
              ))}
            </ol>
          </div>
          <div className="flex flex-row items-center gap-4 lg:flex-col lg:items-end lg:justify-between">
            <div className="flex flex-row gap-4 lg:flex-col lg:items-end lg:gap-2">
              <div className="lg:text-right">
                <p className="text-[11px] text-slate-400">复杂度</p>
                <div className="mt-0.5">
                  <Chip tone={complexity === "高" ? "red" : "amber"}>{complexity}</Chip>
                </div>
              </div>
              <div className="lg:text-right">
                <p className="text-[11px] text-slate-400">预估</p>
                <p className="mt-0.5 whitespace-nowrap text-[12px] font-medium tabular-nums text-slate-600">
                  {estimate}
                </p>
              </div>
            </div>
            <button className={linkCls} onClick={demoAlert}>
              编辑
            </button>
          </div>
        </div>
      </div>
    </li>
  );
}
