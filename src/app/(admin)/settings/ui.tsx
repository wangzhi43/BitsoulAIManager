"use client";

import { useState } from "react";
import { Panel, Table, EmptyRow, Chip, Label, Notice, btnCls } from "@/components/ui";
import { Icon } from "@/components/icons";
import { Modal, ConfirmDialog, useAction, useToast } from "@/components/ui-client";

// 设置页签：项目 / LLM 供应商 / 专家模型

export interface ProjectView {
  id: string;
  name: string;
  repoUrl: string;
  mainBranch: string;
  docsDir: string;
  description: string | null;
  buildCommand: string | null;
  active: boolean;
  requirements: number;
  branches: number;
}
export interface ProviderView {
  id: string;
  name: string;
  kind: string;
  baseUrl: string | null;
  models: string[];
  enabled: boolean;
  createdAt: string;
}

// ---------- 项目 ----------

export function ProjectsTab({ projects }: { projects: ProjectView[] }) {
  const toast = useToast();
  const { run, busy } = useAction();
  const [edit, setEdit] = useState<ProjectView | null>(null);
  const [form, setForm] = useState({ name: "", repoUrl: "", mainBranch: "main", docsDir: "docs", description: "", buildCommand: "" });
  const [del, setDel] = useState<ProjectView | null>(null);
  const [np, setNp] = useState({ name: "", repoUrl: "", mainBranch: "main", description: "" });

  function openEdit(p: ProjectView) {
    setForm({ name: p.name, repoUrl: p.repoUrl, mainBranch: p.mainBranch, docsDir: p.docsDir, description: p.description ?? "", buildCommand: p.buildCommand ?? "" });
    setEdit(p);
  }
  async function saveEdit() {
    if (!edit) return;
    if (!form.name.trim() || !form.repoUrl.trim() || !form.mainBranch.trim() || !form.docsDir.trim()) return toast("error", "名称、仓库、主分支、docs 目录不能为空");
    const r = await run("edit", `/api/admin/projects/${edit.id}`, {
      method: "PATCH",
      body: { name: form.name.trim(), repoUrl: form.repoUrl.trim(), mainBranch: form.mainBranch.trim(), docsDir: form.docsDir.trim().replace(/^\/+/, ""), description: form.description.trim() || null, buildCommand: form.buildCommand.trim() || null },
    }, "已保存");
    if (r.ok) setEdit(null);
  }
  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!np.name.trim() || !np.repoUrl.trim()) return toast("error", "名称与仓库地址必填");
    const r = await run("create", "/api/admin/projects", { body: { ...np, description: np.description || undefined } }, "项目已添加（默认未启用）");
    if (r.ok) setNp({ name: "", repoUrl: "", mainBranch: "main", description: "" });
  }

  return (
    <>
      <Panel title="项目" pad={false} extra={<span className="text-[12px] text-ink-3">启用后才会建 daily 分支与接收需求</span>}>
        <Table head={["名称", "仓库", "主分支", "docs 目录", "需求 / 分支", "状态", ""]}>
          {projects.map((p) => (
            <tr key={p.id}>
              <td>
                <span className="font-medium text-ink">{p.name}</span>
                {p.description && <span className="block max-w-[260px] truncate text-[12px] text-ink-3">{p.description}</span>}
              </td>
              <td className="max-w-[280px] truncate font-mono text-[12px] text-ink-2" title={p.repoUrl}>
                {p.repoUrl}
              </td>
              <td className="font-mono text-[12px] text-ink-2">{p.mainBranch}</td>
              <td className="font-mono text-[12px] text-ink-2">{p.docsDir}</td>
              <td className="num text-[12px] text-ink-2">
                {p.requirements} / {p.branches}
              </td>
              <td>{p.active ? <Chip tone="green">已启用</Chip> : <Chip tone="slate">未启用</Chip>}</td>
              <td className="text-right">
                <span className="flex justify-end gap-1">
                  <button className={btnCls("ghost", "sm")} onClick={() => openEdit(p)}>
                    编辑
                  </button>
                  <button className={btnCls("ghost", "sm")} disabled={busy === `toggle-${p.id}`} onClick={() => run(`toggle-${p.id}`, `/api/admin/projects/${p.id}`, { method: "PATCH", body: { active: !p.active } }, p.active ? "已停用" : "已启用")}>
                    {p.active ? "停用" : "启用"}
                  </button>
                  {p.requirements === 0 && p.branches === 0 && (
                    <button className={btnCls("ghost", "sm", "text-danger")} onClick={() => setDel(p)}>
                      删除
                    </button>
                  )}
                </span>
              </td>
            </tr>
          ))}
          {projects.length === 0 && <EmptyRow colSpan={7}>还没有项目，在下方添加。</EmptyRow>}
        </Table>
      </Panel>

      <Panel title="新增项目">
        <form onSubmit={create} className="grid gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-1">
            <Label>名称</Label>
            <input className="ctl" value={np.name} onChange={(e) => setNp({ ...np, name: e.target.value })} placeholder="与仓库名一致，如 BitSoulClaw" />
          </label>
          <label className="flex flex-col gap-1">
            <Label>GitHub 仓库地址</Label>
            <input className="ctl font-mono" value={np.repoUrl} onChange={(e) => setNp({ ...np, repoUrl: e.target.value })} placeholder="git@github.com:org/repo.git 或 https://…" />
          </label>
          <label className="flex flex-col gap-1">
            <Label>主分支</Label>
            <input className="ctl font-mono" value={np.mainBranch} onChange={(e) => setNp({ ...np, mainBranch: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1">
            <Label>描述（产品专家判断归属时参考）</Label>
            <input className="ctl" value={np.description} onChange={(e) => setNp({ ...np, description: e.target.value })} placeholder="如：Electron 桌面 AI 客户端" />
          </label>
          <div className="md:col-span-2">
            <button type="submit" className={btnCls("primary")} disabled={busy === "create"}>
              <Icon name="plus" size={14} />
              添加项目
            </button>
          </div>
        </form>
      </Panel>

      <Modal open={!!edit} onClose={() => setEdit(null)} title={`编辑项目 ${edit?.name}`} footer={<button className={btnCls("primary")} disabled={busy === "edit"} onClick={saveEdit}>保存</button>}>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1"><Label>名称</Label><input className="ctl" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label className="flex flex-col gap-1"><Label>主分支</Label><input className="ctl font-mono" value={form.mainBranch} onChange={(e) => setForm({ ...form, mainBranch: e.target.value })} /></label>
          <label className="flex flex-col gap-1 sm:col-span-2"><Label>仓库地址</Label><input className="ctl font-mono" value={form.repoUrl} onChange={(e) => setForm({ ...form, repoUrl: e.target.value })} /></label>
          <label className="flex flex-col gap-1"><Label>docs 目录</Label><input className="ctl font-mono" value={form.docsDir} onChange={(e) => setForm({ ...form, docsDir: e.target.value })} /></label>
          <label className="flex flex-col gap-1"><Label>体验包构建命令</Label><input className="ctl font-mono" value={form.buildCommand} onChange={(e) => setForm({ ...form, buildCommand: e.target.value })} placeholder="npm ci && npm run build && cp -r dist $BUILD_OUT/" /><span className="text-[11px] text-ink-3">在 worker 容器内、仓库根目录执行；产物须写到 $BUILD_OUT 目录，平台打包为 tar.gz 供下载</span></label>
          <label className="flex flex-col gap-1 sm:col-span-2"><Label>描述</Label><textarea className="ctl" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
        </div>
      </Modal>
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} title={`删除项目 ${del?.name}`} desc="该项目没有需求与分支记录，删除后微信绑定的默认项目会被清空。" confirmText="删除" danger busy={busy === "del"} onConfirm={async () => { if (!del) return; const r = await run("del", `/api/admin/projects/${del.id}`, { method: "DELETE" }, "已删除"); if (r.ok) setDel(null); }} />
    </>
  );
}

// ---------- LLM 供应商 ----------

const PRESETS = [
  { label: "DeepSeek", name: "deepseek", kind: "OPENAI_COMPAT", baseUrl: "https://api.deepseek.com", models: "deepseek-v4-flash, deepseek-v4-pro" },
  { label: "Anthropic", name: "anthropic", kind: "ANTHROPIC_SDK", baseUrl: "", models: "claude-sonnet-5, claude-opus-5" },
  { label: "通义千问", name: "qwen", kind: "OPENAI_COMPAT", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", models: "qwen-plus, qwen-max" },
];

export function ProvidersTab({ providers }: { providers: ProviderView[] }) {
  const toast = useToast();
  const { run, busy } = useAction();
  const [np, setNp] = useState({ name: "", kind: "OPENAI_COMPAT", baseUrl: "", apiKey: "", models: "" });
  const [test, setTest] = useState<Record<string, string>>({});
  const [keyFor, setKeyFor] = useState<ProviderView | null>(null);
  const [newKey, setNewKey] = useState("");
  const [del, setDel] = useState<ProviderView | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const models = np.models.split(/[,，\s]+/).map((s) => s.trim()).filter(Boolean);
    if (!np.name.trim() || np.apiKey.length < 8 || models.length === 0) return toast("error", "名称、API Key（≥8 位）、模型列表必填");
    if (np.kind === "OPENAI_COMPAT" && !/^https?:\/\//.test(np.baseUrl)) return toast("error", "OpenAI 兼容通道需要 Base URL");
    const r = await run<{ id: string; autoConfiguredRoles?: string[] }>("add", "/api/admin/llm/providers", { body: { name: np.name.trim(), kind: np.kind, baseUrl: np.baseUrl || undefined, apiKey: np.apiKey, models } }, "供应商已添加");
    if (r.ok) {
      if (r.data.autoConfiguredRoles?.length) toast("ok", `已自动为 ${r.data.autoConfiguredRoles.join("/")} 配置模型`);
      setNp({ name: "", kind: "OPENAI_COMPAT", baseUrl: "", apiKey: "", models: "" });
    }
  }
  async function testProvider(id: string) {
    setTest({ ...test, [id]: "测试中…" });
    const r = await run<{ ok: boolean; model: string; latencyMs?: number; error?: string }>(`test-${id}`, `/api/admin/llm/providers/${id}/test`, { method: "POST", body: {} });
    setTest({ ...test, [id]: r.ok ? (r.data.ok ? `通过 · ${r.data.latencyMs} ms` : `失败：${r.data.error}`) : `失败：${r.message}` });
  }

  return (
    <>
      <Panel title="供应商" pad={false} extra={<span className="text-[12px] text-ink-3">API Key 以 AES-256-GCM 加密存储，不回显</span>}>
        <Table head={["名称", "类型", "Base URL", "API Key", "模型", "状态", "连通", ""]}>
          {providers.map((p) => (
            <tr key={p.id}>
              <td className="font-medium text-ink">{p.name}</td>
              <td className="text-[12px] text-ink-2">{p.kind === "ANTHROPIC_SDK" ? "Anthropic 官方" : "OpenAI 兼容"}</td>
              <td className="max-w-[220px] truncate font-mono text-[12px] text-ink-2">{p.baseUrl ?? "—"}</td>
              <td className="font-mono text-[12px] text-ink-3">已配置</td>
              <td className="max-w-[240px] truncate font-mono text-[12px] text-ink-2" title={p.models.join(", ")}>
                {p.models.join(", ")}
              </td>
              <td>{p.enabled ? <Chip tone="green">已启用</Chip> : <Chip tone="slate">已停用</Chip>}</td>
              <td className={`text-[12px] ${test[p.id]?.startsWith("失败") ? "text-danger" : test[p.id]?.startsWith("通过") ? "text-ok" : "text-ink-3"}`}>{test[p.id] ?? "—"}</td>
              <td className="text-right">
                <span className="flex justify-end gap-1">
                  <button className={btnCls("ghost", "sm")} disabled={busy === `test-${p.id}`} onClick={() => testProvider(p.id)}>
                    测试
                  </button>
                  <button className={btnCls("ghost", "sm")} onClick={() => run(`toggle-${p.id}`, `/api/admin/llm/providers/${p.id}`, { method: "PATCH", body: { enabled: !p.enabled } }, p.enabled ? "已停用" : "已启用")}>
                    {p.enabled ? "停用" : "启用"}
                  </button>
                  <button className={btnCls("ghost", "sm")} onClick={() => { setNewKey(""); setKeyFor(p); }}>
                    更新 Key
                  </button>
                  <button className={btnCls("ghost", "sm", "text-danger")} onClick={() => setDel(p)}>
                    删除
                  </button>
                </span>
              </td>
            </tr>
          ))}
          {providers.length === 0 && <EmptyRow colSpan={8}>尚未配置供应商。需求拆解、优先级排序、用例生成都需要至少一个。</EmptyRow>}
        </Table>
      </Panel>

      <Panel title="添加供应商">
        <form onSubmit={add} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Label className="w-16">快速预填</Label>
            {PRESETS.map((p) => (
              <button key={p.label} type="button" className={btnCls("secondary", "sm")} onClick={() => setNp({ name: p.name, kind: p.kind, baseUrl: p.baseUrl, apiKey: "", models: p.models })}>
                {p.label}
              </button>
            ))}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex flex-col gap-1"><Label>名称</Label><input className="ctl" value={np.name} onChange={(e) => setNp({ ...np, name: e.target.value })} placeholder="如 deepseek" /></label>
            <label className="flex flex-col gap-1">
              <Label>类型</Label>
              <select className="ctl" value={np.kind} onChange={(e) => setNp({ ...np, kind: e.target.value })}>
                <option value="OPENAI_COMPAT">OpenAI 兼容（DeepSeek / Qwen / 自定义）</option>
                <option value="ANTHROPIC_SDK">Anthropic 官方</option>
              </select>
            </label>
            <label className="flex flex-col gap-1"><Label>Base URL{np.kind === "OPENAI_COMPAT" ? "" : "（可选）"}</Label><input className="ctl font-mono" value={np.baseUrl} onChange={(e) => setNp({ ...np, baseUrl: e.target.value })} placeholder="https://api.deepseek.com" /></label>
            <label className="flex flex-col gap-1"><Label>API Key</Label><input type="password" className="ctl font-mono" autoComplete="off" value={np.apiKey} onChange={(e) => setNp({ ...np, apiKey: e.target.value })} placeholder="sk-…" /></label>
          </div>
          <label className="flex flex-col gap-1"><Label>模型列表（逗号分隔）</Label><input className="ctl font-mono" value={np.models} onChange={(e) => setNp({ ...np, models: e.target.value })} placeholder="deepseek-v4-flash, deepseek-v4-pro" /></label>
          <div className="flex justify-end">
            <button type="submit" className={btnCls("primary")} disabled={busy === "add"}>
              保存
            </button>
          </div>
        </form>
      </Panel>

      <Modal open={!!keyFor} onClose={() => setKeyFor(null)} title={`更新 ${keyFor?.name} 的 API Key`} width="max-w-sm" footer={<button className={btnCls("primary")} disabled={newKey.length < 8 || busy === "key"} onClick={async () => { if (!keyFor) return; const r = await run("key", `/api/admin/llm/providers/${keyFor.id}`, { method: "PATCH", body: { apiKey: newKey } }, "Key 已更新"); if (r.ok) setKeyFor(null); }}>保存</button>}>
        <input type="password" className="ctl font-mono" autoComplete="off" value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="新的 API Key" />
      </Modal>
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} title={`删除供应商 ${del?.name}`} desc="引用该供应商的专家角色配置会失效，需重新选择。" confirmText="删除" danger busy={busy === "delp"} onConfirm={async () => { if (!del) return; const r = await run("delp", `/api/admin/llm/providers/${del.id}`, { method: "DELETE" }, "已删除"); if (r.ok) setDel(null); }} />
    </>
  );
}

// ---------- 专家模型 ----------

const ROLES = [
  { key: "PRODUCT", label: "产品专家", desc: "需求拆解 / 澄清问题" },
  { key: "PM", label: "项目管理专家", desc: "优先级排序 / 日报" },
  { key: "TEST", label: "测试专家", desc: "测试用例生成" },
];

export function RolesTab({ providers, roleConfigs }: { providers: ProviderView[]; roleConfigs: { role: string; providerId: string; model: string; effort: string | null }[] }) {
  const { run, busy } = useAction();
  const [state, setState] = useState<Record<string, { providerId: string; model: string; effort: string }>>(() =>
    Object.fromEntries(
      ROLES.map((r) => {
        const c = roleConfigs.find((x) => x.role === r.key);
        return [r.key, { providerId: c?.providerId ?? providers[0]?.id ?? "", model: c?.model ?? providers[0]?.models[0] ?? "", effort: c?.effort ?? "" }];
      }),
    ),
  );
  const enabled = providers.filter((p) => p.enabled);
  return (
    <Panel title="专家模型配置" pad={false} extra={<span className="text-[12px] text-ink-3">effort 仅 Anthropic 通道生效</span>}>
      {enabled.length === 0 && (
        <div className="p-4">
          <Notice tone="warn">尚无可用供应商，请先在「LLM 供应商」页签添加。</Notice>
        </div>
      )}
      <Table head={["角色", "供应商", "模型", "effort", ""]}>
        {ROLES.map((r) => {
          const s = state[r.key];
          const prov = providers.find((p) => p.id === s.providerId);
          const saved = roleConfigs.find((x) => x.role === r.key);
          return (
            <tr key={r.key}>
              <td>
                <span className="font-medium text-ink">{r.label}</span>
                <span className="block text-[12px] text-ink-3">{r.desc}</span>
                {!saved && <Chip tone="amber" className="mt-1">未配置</Chip>}
              </td>
              <td>
                <select className="ctl ctl-sm w-auto min-w-[140px]" value={s.providerId} onChange={(e) => { const p = providers.find((x) => x.id === e.target.value); setState({ ...state, [r.key]: { providerId: e.target.value, model: p?.models[0] ?? "", effort: s.effort } }); }}>
                  <option value="">选择供应商</option>
                  {providers.map((p) => (
                    <option key={p.id} value={p.id} disabled={!p.enabled}>
                      {p.name}{p.enabled ? "" : "（已停用）"}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <select className="ctl ctl-sm w-auto min-w-[200px] font-mono" value={s.model} onChange={(e) => setState({ ...state, [r.key]: { ...s, model: e.target.value } })}>
                  {(prov?.models ?? []).map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <select className="ctl ctl-sm w-auto min-w-[100px]" value={s.effort} disabled={prov?.kind !== "ANTHROPIC_SDK"} onChange={(e) => setState({ ...state, [r.key]: { ...s, effort: e.target.value } })}>
                  <option value="">默认</option>
                  {["low", "medium", "high", "xhigh"].map((x) => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
                </select>
              </td>
              <td className="text-right">
                <button className={btnCls("secondary", "sm")} disabled={!s.providerId || !s.model || busy === `role-${r.key}`} onClick={() => run(`role-${r.key}`, "/api/admin/llm/role-config", { method: "PUT", body: { role: r.key, providerId: s.providerId, model: s.model, effort: s.effort || null } }, `${r.label}已保存`)}>
                  保存
                </button>
              </td>
            </tr>
          );
        })}
      </Table>
    </Panel>
  );
}
