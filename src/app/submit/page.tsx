"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

// 公开需求提交页（PRD #10 Web 表单入口）：/submit?token=<webFormToken>
// 极简中性风格，不复用后台组件；令牌无效时显示「入口未开放」。

const INPUT =
  "w-full rounded-md border border-[#e3e6eb] bg-white px-3 py-2 text-[14px] text-[#16202e] outline-none focus:border-[#1f4fa8]";
const LABEL = "mb-1 block text-[13px] text-[#4b5563]";

function SubmitForm() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";

  const [state, setState] = useState<"loading" | "closed" | "open" | "done">("loading");
  const [projects, setProjects] = useState<string[]>([]);
  const [project, setProject] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [contact, setContact] = useState("");
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setState("closed");
      return;
    }
    fetch(`/api/public/submit?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((d: { ok: boolean; projects: string[] }) => {
        if (cancelled) return;
        if (d.ok) {
          setProjects(d.projects);
          setState("open");
        } else {
          setState("closed");
        }
      })
      .catch(() => !cancelled && setState("closed"));
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (text.trim().length < 10) {
      setError("需求描述至少 10 个字");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/public/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          token,
          project: project || undefined,
          customerName: customerName || undefined,
          contact: contact || undefined,
          text,
        }),
      });
      if (res.ok) {
        setState("done");
        return;
      }
      const d = await res.json().catch(() => null);
      setError(d?.error?.message ?? "提交失败，请稍后再试");
    } catch {
      setError("网络异常，请重试");
    } finally {
      setSubmitting(false);
    }
  }

  if (state === "loading") return <p className="text-[14px] text-[#8b94a5]">加载中</p>;
  if (state === "closed") {
    return (
      <div className="text-center">
        <h1 className="text-[18px] font-semibold text-[#16202e]">入口未开放</h1>
        <p className="mt-2 text-[14px] text-[#4b5563]">链接无效或已失效，请联系项目负责人获取新的提交链接。</p>
      </div>
    );
  }
  if (state === "done") {
    return (
      <div className="text-center">
        <h1 className="text-[18px] font-semibold text-[#16202e]">已提交，产品专家将自动整理</h1>
        <p className="mt-2 text-[14px] text-[#4b5563]">整理完成后由项目负责人确认并安排开发，如有疑问会通过您留下的联系方式联络。</p>
        <button
          type="button"
          className="mt-6 rounded-md border border-[#e3e6eb] bg-white px-4 py-2 text-[14px] text-[#1f4fa8]"
          onClick={() => {
            setText("");
            setState("open");
          }}
        >
          再提一条
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <h1 className="text-[18px] font-semibold text-[#16202e]">提交需求</h1>
        <p className="mt-1 text-[13px] text-[#8b94a5]">用自然语言描述想要的功能或问题即可，无需按格式填写。</p>
      </div>
      <div>
        <label className={LABEL}>所属项目</label>
        <select className={INPUT} value={project} onChange={(e) => setProject(e.target.value)}>
          <option value="">不确定 / 由平台判断</option>
          {projects.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={LABEL}>您的姓名 / 公司</label>
          <input className={INPUT} maxLength={60} value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
        </div>
        <div>
          <label className={LABEL}>联系方式</label>
          <input
            className={INPUT}
            maxLength={120}
            placeholder="微信 / 手机 / 邮箱"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
          />
        </div>
      </div>
      <div>
        <label className={LABEL}>需求描述</label>
        <textarea
          className={`${INPUT} min-h-[180px] resize-y`}
          maxLength={5000}
          placeholder="例如：客户列表希望支持按创建时间筛选，并能导出 Excel。"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <p className="mt-1 text-right text-[12px] text-[#8b94a5]">{text.length} / 5000</p>
      </div>
      {error && <p className="text-[13px] text-[#c0392b]">{error}</p>}
      <button
        type="submit"
        disabled={submitting || text.trim().length < 10}
        className="h-11 w-full rounded-md bg-[#1f4fa8] text-[15px] font-medium text-white disabled:opacity-40"
      >
        {submitting ? "提交中" : "提交"}
      </button>
    </form>
  );
}

export default function SubmitPage() {
  return (
    <main className="min-h-dvh bg-[#f4f5f7] px-4 py-10">
      <div className="mx-auto w-full max-w-lg rounded-lg border border-[#e3e6eb] bg-white p-6 sm:p-8">
        <Suspense fallback={<p className="text-[14px] text-[#8b94a5]">加载中</p>}>
          <SubmitForm />
        </Suspense>
        <p className="mt-8 text-center text-[12px] text-[#8b94a5]">BitSoul AI Manager</p>
      </div>
    </main>
  );
}
