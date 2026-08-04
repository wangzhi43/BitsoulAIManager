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
    <main className="flex min-h-dvh items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm space-y-5">
        <div className="text-center">
          <h1 className="text-2xl font-semibold">BitSoul AI Manager</h1>
          <p className="mt-1 text-sm opacity-60">多 Agent 自动化项目管理平台</p>
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
          className="w-full rounded-xl bg-zinc-900 py-3 text-base font-medium text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {loading ? "登录中…" : "登录"}
        </button>
      </form>
    </main>
  );
}
