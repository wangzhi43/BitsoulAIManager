"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { btnCls } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (res.ok) {
        router.replace("/dashboard");
        return;
      }
      const data = await res.json().catch(() => null);
      setError(data?.error?.code === "too_many_attempts" ? "尝试过于频繁，请稍后再试" : "用户名或密码错误");
    } catch {
      setError("网络异常，请重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-sidebar p-6">
      <form onSubmit={submit} className="w-full max-w-[360px] rounded-lg border border-line bg-surface p-8">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-accent text-[15px] font-bold text-white">B</span>
          <div className="leading-tight">
            <h1 className="text-[16px] font-semibold text-ink">BitSoul PM</h1>
            <p className="text-[12px] text-ink-3">AI 项目管理平台 · 管理员登录</p>
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium uppercase tracking-[0.04em] text-ink-3">用户名</span>
            <input className="ctl h-9" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium uppercase tracking-[0.04em] text-ink-3">密码</span>
            <input className="ctl h-9" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
        </div>
        {error && <p className="mt-3 text-[12px] text-danger">{error}</p>}
        <button type="submit" disabled={loading || !username || !password} className={btnCls("primary", "md", "mt-5 h-9 w-full")}>
          {loading ? "登录中…" : "登录"}
        </button>
      </form>
    </main>
  );
}
