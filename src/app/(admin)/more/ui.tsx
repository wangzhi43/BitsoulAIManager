"use client";

import { useState } from "react";

export function ChangePasswordForm() {
  const [open, setOpen] = useState(false);
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/admin/change-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ oldPassword: oldPw, newPassword: newPw }),
    });
    const data = await res.json().catch(() => null);
    if (res.ok) {
      setMsg("✓ 密码已修改");
      setOldPw("");
      setNewPw("");
      setOpen(false);
    } else {
      setMsg(data?.error?.message ?? "修改失败");
    }
    setBusy(false);
  }

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between text-left">
        <span>
          <p className="font-medium">修改密码</p>
          <p className="text-sm text-zinc-400">修改当前管理员账号的登录密码</p>
        </span>
        <span className="text-zinc-300">{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <form onSubmit={submit} className="mt-3 space-y-2">
          <input
            type="password"
            placeholder="旧密码"
            autoComplete="current-password"
            className="w-full rounded-xl border border-zinc-300 px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            value={oldPw}
            onChange={(e) => setOldPw(e.target.value)}
          />
          <input
            type="password"
            placeholder="新密码（至少 8 位）"
            autoComplete="new-password"
            className="w-full rounded-xl border border-zinc-300 px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
          />
          <button
            type="submit"
            disabled={busy || !oldPw || newPw.length < 8}
            className="w-full rounded-xl bg-indigo-600 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
          >
            {busy ? "提交中…" : "确认修改"}
          </button>
        </form>
      )}
      {msg && <p className="mt-2 text-sm text-zinc-500">{msg}</p>}
    </div>
  );
}
