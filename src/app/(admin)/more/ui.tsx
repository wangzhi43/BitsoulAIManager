"use client";

import { useState } from "react";
import { btnCls } from "@/components/ui";
import { api, useToast } from "@/components/ui-client";

export function ChangePasswordForm() {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const r = await api("/api/admin/change-password", { body: { oldPassword: oldPw, newPassword: newPw } });
    setBusy(false);
    if (r.ok) {
      toast("ok", "密码已修改");
      setOldPw("");
      setNewPw("");
      setOpen(false);
    } else {
      toast("error", r.message);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className={btnCls("secondary", "sm")}>
        修改密码
      </button>
    );
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-2 border-t border-line pt-3">
      <input type="password" placeholder="旧密码" autoComplete="current-password" className="ctl" value={oldPw} onChange={(e) => setOldPw(e.target.value)} />
      <input type="password" placeholder="新密码（至少 8 位）" autoComplete="new-password" className="ctl" value={newPw} onChange={(e) => setNewPw(e.target.value)} />
      <div className="flex gap-2">
        <button type="button" onClick={() => setOpen(false)} className={btnCls("secondary", "sm")}>
          取消
        </button>
        <button type="submit" disabled={busy || !oldPw || newPw.length < 8} className={btnCls("primary", "sm")}>
          {busy ? "提交中…" : "确认修改"}
        </button>
      </div>
    </form>
  );
}
