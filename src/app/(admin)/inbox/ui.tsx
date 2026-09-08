"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Panel, Label, Chip, Notice, btnCls } from "@/components/ui";
import { Icon } from "@/components/icons";
import { api, useToast } from "@/components/ui-client";

// 手动导入：粘贴文本 + 客户名 + 附件（先上传取 attachmentId）→ /api/admin/import

export function ImportButton() {
  return (
    <a href="#import" className={btnCls("primary")}>
      <Icon name="plus" size={14} />
      手动导入
    </a>
  );
}

interface Uploaded {
  id: string;
  name: string;
  size: number;
}

export function ImportPanel({ demo }: { demo: boolean }) {
  const toast = useToast();
  const router = useRouter();
  const [text, setText] = useState("");
  const [customer, setCustomer] = useState("");
  const [files, setFiles] = useState<Uploaded[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  async function upload(list: FileList | null) {
    if (!list || list.length === 0) return;
    if (demo) return toast("info", "展示模式下操作不生效");
    setBusy(true);
    for (const f of Array.from(list)) {
      const fd = new FormData();
      fd.append("file", f);
      try {
        const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
        const data = (await res.json().catch(() => null)) as { attachmentId?: string; error?: { message?: string } } | null;
        if (res.ok && data?.attachmentId) setFiles((s) => [...s, { id: data.attachmentId!, name: f.name, size: f.size }]);
        else toast("error", `${f.name}：${data?.error?.message ?? "上传失败"}`);
      } catch {
        toast("error", `${f.name}：网络错误`);
      }
    }
    setBusy(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (demo) return toast("info", "展示模式下操作不生效");
    if (text.trim().length < 5) return toast("error", "请粘贴需求描述（至少 5 个字）");
    setBusy(true);
    const r = await api<{ threadId: string }>("/api/admin/import", { body: { text: text.trim(), customerName: customer.trim() || undefined, attachmentIds: files.map((f) => f.id) } });
    setBusy(false);
    if (r.ok) {
      setDone(r.data.threadId);
      setText("");
      setCustomer("");
      setFiles([]);
      toast("ok", "已提交拆解，约 10-60 秒后出现在待确认");
      router.refresh();
    } else toast("error", r.message);
  }

  return (
    <Panel id="import" title="手动导入">
      {done && (
        <Notice tone="ok" className="mb-3">
          已送产品专家拆解。稍后在「待确认」查看结果；拆解失败会在下方「最近线索」显示未产出。
        </Notice>
      )}
      <form onSubmit={submit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <Label>需求内容</Label>
          <textarea className="ctl" rows={7} value={text} onChange={(e) => setText(e.target.value)} placeholder="粘贴聊天记录、邮件或口述整理的需求；可包含多个功能点，产品专家会自动拆分。" />
        </label>
        <label className="flex flex-col gap-1">
          <Label>来源客户（可选）</Label>
          <input className="ctl" value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="如：民生理财 · 王总" />
        </label>
        <div className="flex flex-col gap-1.5">
          <Label>附件（截图 / 文档，可选）</Label>
          <label className={btnCls("secondary", "sm", "w-fit cursor-pointer")}>
            <Icon name="upload" size={13} />
            选择文件
            <input type="file" multiple className="hidden" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.md" onChange={(e) => upload(e.target.files)} disabled={busy} />
          </label>
          {files.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {files.map((f) => (
                <Chip key={f.id} tone="outline">
                  <Icon name="file" size={11} />
                  {f.name}
                  <button type="button" className="ml-0.5 text-ink-3 hover:text-danger" onClick={() => setFiles(files.filter((x) => x.id !== f.id))} aria-label="移除">
                    <Icon name="x" size={11} />
                  </button>
                </Chip>
              ))}
            </div>
          )}
          <span className="text-[11px] text-ink-3">图片会作为多模态输入参与拆解；文档目前只传文件名。</span>
        </div>
        <button type="submit" className={btnCls("primary", "md", "w-full")} disabled={busy}>
          {busy ? "提交中…" : "送产品专家拆解"}
        </button>
      </form>
    </Panel>
  );
}
