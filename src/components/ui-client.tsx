"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "./icons";
import { btnCls } from "./ui";

// 交互组件：Toast、Modal、确认对话框、API 调用封装。

// ---------- Toast ----------

type ToastKind = "ok" | "error" | "info";
interface ToastItem {
  id: number;
  kind: ToastKind;
  text: string;
}
const ToastCtx = createContext<(kind: ToastKind, text: string) => void>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((kind: ToastKind, text: string) => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s, { id, kind, text }]);
    setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), kind === "error" ? 6000 : 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[100] flex flex-col items-center gap-2 px-4">
        {items.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex max-w-lg items-start gap-2 rounded-md border px-3 py-2 text-[13px] shadow-sm ${
              t.kind === "ok"
                ? "border-[#bfe3cf] bg-ok-soft text-ok"
                : t.kind === "error"
                  ? "border-danger-line bg-danger-soft text-danger"
                  : "border-line bg-surface text-ink"
            }`}
          >
            <Icon name={t.kind === "ok" ? "checkSimple" : t.kind === "error" ? "alert" : "info"} size={14} className="mt-0.5" />
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  return useContext(ToastCtx);
}

// ---------- API 调用 ----------

export interface ApiFail {
  ok: false;
  status: number;
  message: string;
}
export type ApiResult<T> = { ok: true; data: T } | ApiFail;

/** 统一 fetch：JSON 收发，错误取 error.message */
export async function api<T = unknown>(path: string, init?: { method?: string; body?: unknown }): Promise<ApiResult<T>> {
  try {
    const res = await fetch(path, {
      method: init?.method ?? (init?.body ? "POST" : "GET"),
      headers: init?.body ? { "content-type": "application/json" } : undefined,
      body: init?.body ? JSON.stringify(init.body) : undefined,
    });
    const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    if (!res.ok) return { ok: false, status: res.status, message: data?.error?.message ?? `请求失败（${res.status}）` };
    return { ok: true, data: data as T };
  } catch (e) {
    return { ok: false, status: 0, message: `网络错误：${String(e)}` };
  }
}

/** 常用组合：调用 → toast → 刷新 */
export function useAction() {
  const toast = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const run = useCallback(
    async <T,>(key: string, path: string, init: { method?: string; body?: unknown } | undefined, okText?: string, after?: (d: T) => void) => {
      setBusy(key);
      const r = await api<T>(path, init);
      setBusy(null);
      if (r.ok) {
        if (okText) toast("ok", okText);
        after?.(r.data);
        router.refresh();
      } else {
        toast("error", r.message);
      }
      return r;
    },
    [router, toast],
  );
  return { run, busy };
}

// ---------- Modal ----------

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  width = "max-w-xl",
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`flex max-h-[92dvh] w-full flex-col rounded-t-lg border border-line bg-surface sm:rounded-lg ${width}`}>
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h3 className="text-[14px] font-semibold text-ink">{title}</h3>
          <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-md text-ink-3 hover:bg-bg hover:text-ink" aria-label="关闭">
            <Icon name="x" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-line bg-surface-2 px-4 py-3">{footer}</div>}
      </div>
    </div>
  );
}

/** 带原因输入的确认框 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  desc,
  confirmText = "确认",
  danger = false,
  reason,
  busy = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  title: React.ReactNode;
  desc?: React.ReactNode;
  confirmText?: string;
  danger?: boolean;
  reason?: { label: string; required?: boolean; placeholder?: string };
  busy?: boolean;
}) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (open) {
      setText("");
      setTimeout(() => ref.current?.focus(), 30);
    }
  }, [open]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      width="max-w-md"
      footer={
        <>
          <button className={btnCls("secondary")} onClick={onClose} disabled={busy}>
            取消
          </button>
          <button className={btnCls(danger ? "danger" : "primary")} onClick={() => onConfirm(text.trim())} disabled={busy || (reason?.required && !text.trim())}>
            {busy ? "处理中…" : confirmText}
          </button>
        </>
      }
    >
      {desc && <p className="text-[13px] leading-relaxed text-ink-2">{desc}</p>}
      {reason && (
        <label className="mt-3 flex flex-col gap-1">
          <span className="text-[11px] font-medium uppercase tracking-[0.04em] text-ink-3">
            {reason.label}
            {reason.required ? "" : "（可选）"}
          </span>
          <textarea ref={ref} className="ctl" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={reason.placeholder} />
        </label>
      )}
    </Modal>
  );
}

/** 复制到剪贴板按钮 */
export function CopyButton({ text, label = "复制" }: { text: string; label?: string }) {
  const toast = useToast();
  return (
    <button
      className={btnCls("ghost", "sm")}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          toast("ok", "已复制");
        } catch {
          toast("error", "复制失败，请手动选择");
        }
      }}
    >
      <Icon name="copy" size={13} />
      {label}
    </button>
  );
}
