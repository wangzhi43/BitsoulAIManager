"use client";

import { useState } from "react";
import { Label, btnCls } from "@/components/ui";
import { Icon } from "@/components/icons";
import { Modal, useAction, useToast } from "@/components/ui-client";

export function GenerateReportButton({ projects, demo }: { projects: { id: string; name: string }[]; demo: boolean }) {
  const toast = useToast();
  const { run, busy } = useAction();
  const [open, setOpen] = useState(false);
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  async function submit() {
    if (demo) return toast("info", "展示模式下操作不生效");
    if (!projectId) return toast("error", "请选择项目");
    const r = await run("gen", "/api/admin/reports/generate", { body: { projectId, date: new Date(date).toISOString() } }, "已排队生成，约 30 秒后刷新查看");
    if (r.ok) setOpen(false);
  }

  return (
    <>
      <button className={btnCls("primary")} onClick={() => setOpen(true)} disabled={projects.length === 0}>
        <Icon name="zap" size={14} />
        立即生成日报
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="生成日报" width="max-w-sm" footer={<button className={btnCls("primary")} disabled={busy === "gen"} onClick={submit}>生成</button>}>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <Label>项目</Label>
            <select className="ctl" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <Label>日期</Label>
            <input type="date" className="ctl" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <p className="text-[12px] text-ink-3">项目管理专家汇总当日事件流水生成；已存在的同日日报会被覆盖，并按设置推送给勾选了日报的微信会话。</p>
        </div>
      </Modal>
    </>
  );
}
