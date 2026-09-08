"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

// 页面实时刷新：优先订阅 SSE /api/events（服务端检测到数据变更才推送），
// 断线或不可用时回退为 60 秒轮询。仅在页面可见时刷新。

export function AutoRefresh({ fallbackMs = 60_000 }: { fallbackMs?: number }) {
  const router = useRouter();
  const last = useRef(0);

  useEffect(() => {
    let es: EventSource | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let closed = false;

    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      // 3 秒节流，避免连续事件触发多次重渲染
      if (Date.now() - last.current < 3000) return;
      last.current = Date.now();
      router.refresh();
    };

    const startPolling = () => {
      if (timer) return;
      timer = setInterval(refresh, fallbackMs);
    };

    const connect = () => {
      if (closed || typeof EventSource === "undefined") {
        startPolling();
        return;
      }
      es = new EventSource("/api/events");
      es.addEventListener("change", refresh);
      es.onerror = () => {
        es?.close();
        es = null;
        startPolling();
        // 30 秒后再尝试重连 SSE
        setTimeout(() => {
          if (closed) return;
          if (timer) {
            clearInterval(timer);
            timer = null;
          }
          connect();
        }, 30_000);
      };
    };

    connect();
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      closed = true;
      es?.close();
      if (timer) clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router, fallbackMs]);

  return null;
}
