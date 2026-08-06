"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Panel, Chip, btnCls } from "@/components/ui";

interface Project {
  id: string;
  name: string;
  repoUrl: string;
  active: boolean;
  description: string | null;
}
interface Provider {
  id: string;
  name: string;
  kind: string;
  baseUrl: string | null;
  models: string[];
  enabled: boolean;
}
interface RoleConfig {
  role: string;
  providerId: string;
  model: string;
  effort: string | null;
}

const ROLES = [
  { key: "PRODUCT", label: "产品专家（需求拆解）" },
  { key: "PM", label: "项目管理专家（优先级/日报）" },
  { key: "TEST", label: "测试专家（用例生成）" },
];

const input =
  "rounded-lg border border-slate-300 px-3 py-2 text-[13px] focus:border-blue-500 focus:outline-none";

export function SettingsUI({
  projects,
  providers,
  roleConfigs,
}: {
  projects: Project[];
  providers: Provider[];
  roleConfigs: RoleConfig[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [np, setNp] = useState({ name: "", kind: "ANTHROPIC_SDK", baseUrl: "", apiKey: "", models: "" });
  const [newProject, setNewProject] = useState({ name: "", repoUrl: "" });
  const [testResult, setTestResult] = useState<Record<string, string>>({});

  async function json(path: string, method: string, body?: unknown) {
    setBusy(true);
    try {
      const res = await fetch(path, {
        method,
        headers: { "content-type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        alert(data?.error?.message ?? `失败（${res.status}）`);
        return null;
      }
      return data;
    } finally {
      setBusy(false);
    }
  }

  async function addProvider(e: React.FormEvent) {
    e.preventDefault();
    const models = np.models.split(/[,，\s]+/).filter(Boolean);
    const ok = await json("/api/admin/llm/providers", "POST", {
      name: np.name,
      kind: np.kind,
      baseUrl: np.baseUrl || undefined,
      apiKey: np.apiKey,
      models,
    });
    if (ok) {
      setNp({ name: "", kind: "ANTHROPIC_SDK", baseUrl: "", apiKey: "", models: "" });
      router.refresh();
    }
  }

  async function testProvider(id: string) {
    setTestResult({ ...testResult, [id]: "测试中…" });
    const res = await fetch(`/api/admin/llm/providers/${id}/test`, { method: "POST" });
    const data = await res.json().catch(() => null);
    setTestResult({
      ...testResult,
      [id]: data?.ok ? `✓ 连通（${data.latencyMs}ms）` : `✗ ${data?.error ?? "失败"}`,
    });
  }

  async function saveRole(role: string, providerId: string, model: string, effort: string) {
    if (!providerId || !model) {
      alert("请选择供应商与模型");
      return;
    }
    const ok = await json("/api/admin/llm/role-config", "PUT", {
      role,
      providerId,
      model,
      effort: effort || null,
    });
    if (ok) router.refresh();
  }

  return (
    <div className="space-y-4">
      {/* 项目 */}
      <Panel title="项目">
        <ul className="space-y-2">
          {projects.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50/50 p-3">
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-slate-700">{p.name}</p>
                <p className="truncate text-[11px] text-slate-400">{p.repoUrl}</p>
              </div>
              <button
                className={btnCls(p.active ? "primary" : "secondary", "sm")}
                disabled={busy}
                onClick={async () => {
                  const url = p.active ? p.repoUrl : window.prompt("确认仓库地址（GitHub）", p.repoUrl);
                  if (!p.active && !url) return;
                  const ok = await json(`/api/admin/projects/${p.id}`, "PATCH", {
                    active: !p.active,
                    ...(url && url !== p.repoUrl ? { repoUrl: url } : {}),
                  });
                  if (ok) router.refresh();
                }}
              >
                {p.active ? "已启用" : "启用"}
              </button>
            </li>
          ))}
        </ul>

        {/* 新增项目：填名称与仓库地址即可纳入管理 */}
        <form
          className="mt-3 grid gap-2 border-t border-slate-100 pt-3 sm:grid-cols-[1fr_2fr_auto]"
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await json("/api/admin/projects", "POST", {
              name: newProject.name.trim(),
              repoUrl: newProject.repoUrl.trim(),
            });
            if (ok) {
              setNewProject({ name: "", repoUrl: "" });
              router.refresh();
            }
          }}
        >
          <input
            className={input}
            placeholder="项目名称"
            value={newProject.name}
            onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
          />
          <input
            className={input}
            placeholder="GitHub 仓库地址（https:// 或 git@，需在机器人 PAT 中授权）"
            value={newProject.repoUrl}
            onChange={(e) => setNewProject({ ...newProject, repoUrl: e.target.value })}
          />
          <button type="submit" disabled={busy || !newProject.name.trim() || !newProject.repoUrl.trim()} className={btnCls("primary", "md")}>
            新增项目
          </button>
        </form>
      </Panel>

      {/* LLM 供应商 */}
      <Panel title="LLM 供应商">
        <ul className="mb-4 space-y-2">
          {providers.map((p) => (
            <li key={p.id} className="rounded-lg border border-slate-200 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-[13px] font-medium text-slate-700">
                  {p.name} <Chip tone="slate">{p.kind}</Chip>
                  {!p.enabled && <Chip tone="red">已停用</Chip>}
                </span>
                <div className="flex gap-2">
                  <button className={btnCls("secondary", "sm")} onClick={() => testProvider(p.id)}>
                    测试
                  </button>
                  <button
                    className={btnCls(p.enabled ? "danger" : "secondary", "sm")}
                    disabled={busy}
                    onClick={async () => {
                      const ok = await json(`/api/admin/llm/providers/${p.id}`, "PATCH", {
                        enabled: !p.enabled,
                      });
                      if (ok) router.refresh();
                    }}
                  >
                    {p.enabled ? "停用" : "启用"}
                  </button>
                </div>
              </div>
              <p className="mt-1 text-[12px] text-slate-400">模型：{p.models.join(", ")}</p>
              {testResult[p.id] && <p className="mt-1 text-[12px] text-slate-500">{testResult[p.id]}</p>}
            </li>
          ))}
          {providers.length === 0 && (
            <p className="text-[13px] text-slate-400">尚未配置供应商——拆解功能需要至少一个</p>
          )}
        </ul>

        {/* 常用供应商一键预填:选择后只需粘贴 API Key */}
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="text-[12px] text-slate-400">快速接入：</span>
          <button
            type="button"
            className={btnCls("secondary", "sm")}
            onClick={() =>
              setNp({ name: "DeepSeek", kind: "OPENAI_COMPAT", baseUrl: "https://api.deepseek.com", apiKey: "", models: "deepseek-v4-flash, deepseek-v4-pro" })
            }
          >
            DeepSeek
          </button>
          <button
            type="button"
            className={btnCls("secondary", "sm")}
            onClick={() =>
              setNp({ name: "anthropic", kind: "ANTHROPIC_SDK", baseUrl: "", apiKey: "", models: "claude-sonnet-5, claude-opus-5" })
            }
          >
            Anthropic
          </button>
          <button
            type="button"
            className={btnCls("secondary", "sm")}
            onClick={() =>
              setNp({ name: "Qwen", kind: "OPENAI_COMPAT", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", apiKey: "", models: "qwen-max, qwen-plus" })
            }
          >
            通义千问
          </button>
          <span className="text-[11px] text-slate-300">点击预填,粘贴 API Key 后「添加供应商」即完成接入</span>
        </div>
        <form onSubmit={addProvider} className="grid gap-2 sm:grid-cols-2">
          <input
            className={input}
            placeholder="名称（如 anthropic）"
            value={np.name}
            onChange={(e) => setNp({ ...np, name: e.target.value })}
          />
          <select
            className={input}
            value={np.kind}
            onChange={(e) => setNp({ ...np, kind: e.target.value })}
          >
            <option value="ANTHROPIC_SDK">Anthropic 官方</option>
            <option value="OPENAI_COMPAT">OpenAI 兼容（DeepSeek/Qwen…）</option>
          </select>
          <input
            className={input}
            placeholder="Base URL（OpenAI 兼容必填）"
            value={np.baseUrl}
            onChange={(e) => setNp({ ...np, baseUrl: e.target.value })}
          />
          <input
            className={input}
            placeholder="API Key（加密存储）"
            type="password"
            value={np.apiKey}
            onChange={(e) => setNp({ ...np, apiKey: e.target.value })}
          />
          <input
            className={`${input} sm:col-span-2`}
            placeholder="模型列表，逗号分隔（如 claude-opus-5, claude-sonnet-5）"
            value={np.models}
            onChange={(e) => setNp({ ...np, models: e.target.value })}
          />
          <button type="submit" disabled={busy} className={`${btnCls("primary", "md")} sm:col-span-2`}>
            添加供应商
          </button>
        </form>
      </Panel>

      {/* 专家角色模型配置 */}
      <Panel title="专家 Agent 模型配置">
        <div className="space-y-3">
          {ROLES.map((r) => {
            const cfg = roleConfigs.find((c) => c.role === r.key);
            return (
              <RoleRow
                key={r.key}
                label={r.label}
                role={r.key}
                cfg={cfg}
                providers={providers}
                onSave={saveRole}
                busy={busy}
              />
            );
          })}
        </div>
      </Panel>
    </div>
  );
}

function RoleRow({
  label,
  role,
  cfg,
  providers,
  onSave,
  busy,
}: {
  label: string;
  role: string;
  cfg?: RoleConfig;
  providers: Provider[];
  onSave: (role: string, providerId: string, model: string, effort: string) => void;
  busy: boolean;
}) {
  const [providerId, setProviderId] = useState(cfg?.providerId ?? "");
  const [model, setModel] = useState(cfg?.model ?? "");
  const [effort, setEffort] = useState(cfg?.effort ?? "");
  const provider = providers.find((p) => p.id === providerId);

  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <p className="mb-2 text-[13px] font-medium text-slate-700">{label}</p>
      <div className="flex flex-wrap gap-2">
        <select className={input} value={providerId} onChange={(e) => setProviderId(e.target.value)}>
          <option value="">选择供应商</option>
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select className={input} value={model} onChange={(e) => setModel(e.target.value)}>
          <option value="">选择模型</option>
          {(provider?.models ?? []).map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <select className={input} value={effort} onChange={(e) => setEffort(e.target.value)}>
          <option value="">effort 默认</option>
          <option value="low">low</option>
          <option value="medium">medium</option>
          <option value="high">high</option>
          <option value="xhigh">xhigh</option>
        </select>
        <button className={btnCls("primary", "sm")} disabled={busy} onClick={() => onSave(role, providerId, model, effort)}>
          保存
        </button>
      </div>
      {cfg && (
        <p className="mt-1.5 text-[11px] text-slate-400">
          当前：{providers.find((p) => p.id === cfg.providerId)?.name ?? "?"} / {cfg.model}
          {cfg.effort ? ` / ${cfg.effort}` : ""}
        </p>
      )}
    </div>
  );
}
