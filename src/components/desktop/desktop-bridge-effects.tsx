"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import {
  extractBilibiliLink,
  getDesktopBridge,
  getDesktopPreference,
  parseProtocolLink,
} from "@/lib/desktop";
import type { DownloadTask, TaskEvent, TaskStatus } from "@/lib/types";

export const DESKTOP_SETTINGS_EVENT = "bilidown:settings-changed";

/**
 * 桌面版（Electron）桥接效果：
 * - 托盘开关、剪贴板监听（主进程轮询）
 * - bilidown:// 协议链接 / 剪贴板链接 → 首页自动解析
 * - 下载完成系统通知、全部完成后自动关机
 * 浏览器环境下整个组件不产生任何行为。
 */
export function DesktopBridgeEffects() {
  const router = useRouter();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  const routerRef = useRef(router);

  // 在 effect 中同步最新路由，供主进程事件回调使用（避免渲染期写 ref）
  useEffect(() => {
    pathnameRef.current = pathname;
    routerRef.current = router;
  });

  // 托盘、协议、剪贴板
  useEffect(() => {
    const desktop = getDesktopBridge();
    if (!desktop) return;
    const bridge = desktop;
    let disposed = false;

    void bridge.setTrayEnabled(getDesktopPreference("trayOnClose", true)).catch(() => undefined);

    function openTarget(raw: string) {
      const link = parseProtocolLink(raw) ?? raw;
      const target = extractBilibiliLink(link) ?? link.trim();
      if (!target) return;
      if (pathnameRef.current === "/") {
        window.dispatchEvent(new CustomEvent<string>("bilidown:parse-link", { detail: target }));
      } else {
        routerRef.current.push("/?input=" + encodeURIComponent(target));
      }
    }

    async function applyClipboardWatch() {
      try {
        const response = await api.settings.get();
        if (!disposed) await bridge.setClipboardWatch(response.settings.clipboardWatch);
      } catch {
        /* 服务未就绪时忽略 */
      }
    }
    void applyClipboardWatch();
    const onSettingsChanged = () => void applyClipboardWatch();
    window.addEventListener(DESKTOP_SETTINGS_EVENT, onSettingsChanged);

    void bridge
      .takePendingLink()
      .then((link) => {
        if (!disposed && link) openTarget(link);
      })
      .catch(() => undefined);
    const offProtocol = bridge.onProtocolLink((link) => {
      if (link) openTarget(link);
    });
    const offClipboard = bridge.onClipboardChange((text) => {
      const target = extractBilibiliLink(text);
      if (target) openTarget(target);
    });

    return () => {
      disposed = true;
      window.removeEventListener(DESKTOP_SETTINGS_EVENT, onSettingsChanged);
      offProtocol();
      offClipboard();
      void bridge.setClipboardWatch(false).catch(() => undefined);
    };
  }, []);

  // 下载完成通知 + 全部完成后自动关机（全局 SSE，独立于下载页）
  useEffect(() => {
    const desktop = getDesktopBridge();
    if (!desktop) return;
    const bridge = desktop;
    let disposed = false;
    let shutdownRequested = false;
    let sawActive = false;
    const statusById = new Map<string, TaskStatus>();
    let latest: DownloadTask[] = [];

    function settled(task: DownloadTask): boolean {
      return task.status === "completed" || task.status === "cancelled" || task.status === "error";
    }

    function maybeNotify(task: DownloadTask, previous: TaskStatus | undefined) {
      if (task.status !== "completed" || previous === "completed") return;
      if (!getDesktopPreference("notify", true)) return;
      void bridge
        .notify({ title: "下载完成", body: task.title + (task.fileName ? " · 已保存" : "") })
        .catch(() => undefined);
    }

    function maybeShutdown() {
      if (shutdownRequested || !sawActive || latest.length === 0) return;
      if (!getDesktopPreference("autoShutdown", false)) return;
      if (!latest.every(settled)) return;
      shutdownRequested = true;
      void bridge.requestShutdown().catch(() => undefined);
    }

    const source = new EventSource("/api/tasks/events");
    source.onmessage = (event) => {
      if (disposed) return;
      let payload: TaskEvent;
      try {
        payload = JSON.parse(event.data) as TaskEvent;
      } catch {
        return;
      }
      if (payload.type === "init") {
        latest = payload.tasks;
        for (const task of payload.tasks) {
          statusById.set(task.id, task.status);
          if (task.status === "downloading" || task.status === "merging" || task.status === "queued") sawActive = true;
        }
        maybeShutdown();
        return;
      }
      if (payload.type === "task-updated") {
        const task = payload.task;
        const previous = statusById.get(task.id);
        statusById.set(task.id, task.status);
        latest = latest.filter((item) => item.id !== task.id).concat(task);
        if (task.status === "downloading" || task.status === "merging" || task.status === "queued") sawActive = true;
        maybeNotify(task, previous);
        maybeShutdown();
        return;
      }
      if (payload.type === "task-deleted") {
        latest = latest.filter((item) => item.id !== payload.id);
        statusById.delete(payload.id);
      }
    };

    return () => {
      disposed = true;
      source.close();
    };
  }, []);

  return null;
}
