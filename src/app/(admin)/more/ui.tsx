"use client";

import { useState } from "react";
import { btnCls } from "@/components/ui";

const input =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px] focus:border-blue-500 focus:outline-none";

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
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between text-left">
        <span>
          <p className="text-[13px] font-semibold text-slate-800">修改密码</p>
          <p className="mt-0.5 text-[12px] text-slate-400">修改当前管理员账号的登录密码</p>
        </span>
        <span className="text-slate-300">{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <form onSubmit={submit} className="mt-3 space-y-2">
          <input
            type="password"
            placeholder="旧密码"
            autoComplete="current-password"
            className={input}
            value={oldPw}
            onChange={(e) => setOldPw(e.target.value)}
          />
          <input
            type="password"
            placeholder="新密码（至少 8 位）"
            autoComplete="new-password"
            className={input}
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
          />
          <button
            type="submit"
            disabled={busy || !oldPw || newPw.length < 8}
            className={`${btnCls("primary", "md")} w-full`}
          >
            {busy ? "提交中…" : "确认修改"}
          </button>
        </form>
      )}
      {msg && <p className="mt-2 text-[12px] text-slate-500">{msg}</p>}
    </div>
  );
}
