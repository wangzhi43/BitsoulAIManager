"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ImportForm() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [customer, setCustomer] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    try {
      const attachmentIds: string[] = [];
      for (const f of files) {
        const fd = new FormData();
        fd.append("file", f);
        const up = await fetch("/api/admin/upload", { method: "POST", body: fd });
        if (!up.ok) throw new Error(`附件 ${f.name} 上传失败`);
        attachmentIds.push((await up.json()).attachmentId);
      }
      const res = await fetch("/api/admin/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, customerName: customer || undefined, attachmentIds }),
      });
      if (!res.ok) throw new Error("导入失败");
      setText("");
      setCustomer("");
      setFiles([]);
      setMsg("已提交拆解，稍后在「确认」页查看结果");
      router.refresh();
    } catch (err) {
      setMsg(String(err instanceof Error ? err.message : err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <textarea
        className="min-h-28 w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
        placeholder="粘贴聊天记录或需求描述…"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="flex flex-wrap items-center gap-2">
        <input
          className="flex-1 rounded-xl border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          placeholder="客户名（可选）"
          value={customer}
          onChange={(e) => setCustomer(e.target.value)}
        />
        <label className="cursor-pointer rounded-xl border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700">
          附件（{files.length}）
          <input
            type="file"
            multiple
            className="hidden"
            onChange={(e) => setFiles([...(e.target.files ?? [])])}
          />
        </label>
        <button
          type="submit"
          disabled={busy || !text.trim()}
          className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {busy ? "提交中…" : "提交拆解"}
        </button>
      </div>
      {msg && <p className="text-sm opacity-70">{msg}</p>}
    </form>
  );
}
