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
    <main className="flex min-h-dvh items-center justify-center bg-gradient-to-b from-indigo-50 via-zinc-50 to-zinc-100 p-6 dark:from-zinc-950 dark:via-zinc-950 dark:to-zinc-900">
      <form
        onSubmit={submit}
        className="w-full max-w-sm space-y-5 rounded-3xl border border-zinc-200/80 bg-white p-7 shadow-lg shadow-zinc-200/50 dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-none"
      >
        <div className="text-center">
          <span className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600 text-xl font-bold text-white">
            B
          </span>
          <h1 className="text-2xl font-semibold tracking-tight">BitSoul AI Manager</h1>
          <p className="mt-1 text-sm text-zinc-400">多 Agent 自动化项目管理平台</p>
        </div>
        <div className="space-y-3">
          <input
            className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-base outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
            placeholder="用户名"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <input
            className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-base outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
            placeholder="密码"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading || !username || !password}
          className="w-full rounded-xl bg-indigo-600 py-3 text-base font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-40"
        >
          {loading ? "登录中…" : "登录"}
        </button>
      </form>
    </main>
  );
}
