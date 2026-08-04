"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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

const box =
  "rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900";
const input =
  "rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950";
const btn =
  "rounded-lg bg-zinc-900 px-3 py-1.5 text-sm text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900";
const btnGhost = "rounded-lg border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700";

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
    <div className="space-y-6">
      {/* 项目 */}
      <section className={box}>
        <h2 className="mb-3 font-medium">项目</h2>
        <ul className="space-y-2">
          {projects.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
              <div className="min-w-0">
                <p className="font-medium">{p.name}</p>
                <p className="truncate text-xs opacity-50">{p.repoUrl}</p>
              </div>
              <button
                className={p.active ? btn : btnGhost}
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
      </section>

      {/* LLM 供应商 */}
      <section className={box}>
        <h2 className="mb-3 font-medium">LLM 供应商</h2>
        <ul className="mb-4 space-y-2">
          {providers.map((p) => (
            <li key={p.id} className="rounded-xl border border-zinc-200 p-3 text-sm dark:border-zinc-800">
              <div className="flex items-center justify-between">
                <span className="font-medium">
                  {p.name} <span className="text-xs opacity-50">{p.kind}</span>
                </span>
                <div className="flex gap-2">
                  <button className={btnGhost} onClick={() => testProvider(p.id)}>
                    测试
                  </button>
                  <button
                    className={btnGhost}
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
              <p className="mt-1 text-xs opacity-60">模型：{p.models.join(", ")}</p>
              {testResult[p.id] && <p className="mt-1 text-xs">{testResult[p.id]}</p>}
            </li>
          ))}
          {providers.length === 0 && (
            <p className="text-sm opacity-50">尚未配置供应商——拆解功能需要至少一个</p>
          )}
        </ul>

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
          <button type="submit" disabled={busy} className={`${btn} sm:col-span-2`}>
            添加供应商
          </button>
        </form>
      </section>

      {/* 专家角色模型配置 */}
      <section className={box}>
        <h2 className="mb-3 font-medium">专家 Agent 模型配置</h2>
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
      </section>
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
    <div className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
      <p className="mb-2 text-sm font-medium">{label}</p>
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
        <button className={btn} disabled={busy} onClick={() => onSave(role, providerId, model, effort)}>
          保存
        </button>
      </div>
      {cfg && (
        <p className="mt-1 text-xs opacity-50">
          当前：{providers.find((p) => p.id === cfg.providerId)?.name ?? "?"} / {cfg.model}
          {cfg.effort ? ` / ${cfg.effort}` : ""}
        </p>
      )}
    </div>
  );
}
