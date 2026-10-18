"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  getDesktopBridge,
  getDesktopPreference,
  isDesktopRuntime,
  setDesktopPreference,
} from "@/lib/desktop";

const PREF_EVENT = "bilidown:pref-changed";

function subscribe(callback: () => void): () => void {
  window.addEventListener(PREF_EVENT, callback);
  return () => window.removeEventListener(PREF_EVENT, callback);
}

function subscribeNoop(): () => void {
  return () => undefined;
}

/** 是否运行在 Electron 桌面壳中（SSR/水合期间返回 false）。 */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(subscribeNoop, isDesktopRuntime, () => false);
}

/** 读取/写入 localStorage 中的桌面版偏好（托盘、通知、自动关机等）。 */
export function useDesktopPreference(key: string, fallback: boolean): [boolean, (value: boolean) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => getDesktopPreference(key, fallback),
    () => fallback,
  );
  const setValue = useCallback(
    (next: boolean) => {
      setDesktopPreference(key, next);
      window.dispatchEvent(new Event(PREF_EVENT));
    },
    [key],
  );
  return [value, setValue];
}

export function useDesktopBridge() {
  return getDesktopBridge();
}
