"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
      setError(
        data?.error?.code === "too_many_attempts"
          ? "尝试过于频繁，请稍后再试"
          : "用户名或密码错误",
      );
    } catch {
      setError("网络异常，请重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#0b1526] p-6">
      <form
        onSubmit={submit}
        className="w-full max-w-sm space-y-5 rounded-2xl border border-slate-200 bg-white p-8 shadow-2xl shadow-black/30"
      >
        <div className="text-center">
          <span className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-600 text-xl font-bold text-white">
            B
          </span>
          <h1 className="text-[22px] font-bold tracking-tight text-slate-900">AI 项目平台</h1>
          <p className="mt-1 text-[13px] text-slate-400">BitSoul PM · 多 Agent 自动化项目管理</p>
        </div>
        <div className="space-y-3">
          <input
            className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-[15px] outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            placeholder="用户名"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <input
            className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-[15px] outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            placeholder="密码"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && <p className="text-[13px] text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading || !username || !password}
          className="w-full rounded-lg bg-blue-600 py-3 text-[15px] font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-40"
        >
          {loading ? "登录中…" : "登录"}
        </button>
      </form>
    </main>
  );
}
