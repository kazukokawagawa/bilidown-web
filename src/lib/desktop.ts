/**
 * 桌面版（Electron）能力桥接层。
 * 浏览器环境下 getDesktopBridge() 返回 null，所有桌面增强功能自动降级。
 */

export interface DesktopInfo {
  version: string;
  platform: string;
  isPackaged: boolean;
  userDataDir: string;
  downloadDir: string;
}

export interface SelectDirectoryOptions {
  title?: string;
  defaultPath?: string;
}

export interface SelectFileOptions {
  title?: string;
  defaultPath?: string;
  kind?: "audio" | "video" | "subtitle" | "any";
}

export interface ShellResult {
  ok: boolean;
  error?: string;
}

export interface ShutdownResult {
  confirmed: boolean;
  shutdown: boolean;
}

export interface DesktopBridge {
  isDesktop: true;
  platform: string;
  getInfo: () => Promise<DesktopInfo>;
  selectDirectory: (options?: SelectDirectoryOptions) => Promise<string | null>;
  selectFile: (options?: SelectFileOptions) => Promise<string | null>;
  openPath: (target: string) => Promise<ShellResult>;
  showItemInFolder: (target: string) => Promise<ShellResult>;
  openExternal: (url: string) => Promise<ShellResult>;
  readClipboard: () => Promise<string>;
  writeClipboard: (text: string) => Promise<{ ok: boolean }>;
  setClipboardWatch: (enabled: boolean) => Promise<{ enabled: boolean }>;
  notify: (payload: { title?: string; body?: string }) => Promise<{ ok: boolean }>;
  requestShutdown: () => Promise<ShutdownResult>;
  setTrayEnabled: (enabled: boolean) => Promise<{ enabled: boolean }>;
  takePendingLink: () => Promise<string | null>;
  minimizeWindow: () => Promise<void>;
  toggleMaximizeWindow: () => Promise<boolean>;
  onClipboardChange: (callback: (text: string) => void) => () => void;
  onProtocolLink: (callback: (link: string) => void) => () => void;
}

declare global {
  interface Window {
    bilidownDesktop?: DesktopBridge;
  }
}

export function getDesktopBridge(): DesktopBridge | null {
  if (typeof window === "undefined") return null;
  return window.bilidownDesktop ?? null;
}

export function isDesktopRuntime(): boolean {
  return getDesktopBridge() !== null;
}

const BILIBILI_LINK_PATTERNS: RegExp[] = [
  /https?:\/\/(?:www\.|m\.|space\.)?bilibili\.com\/[^\s]+/i,
  /https?:\/\/b23\.tv\/[^\s]+/i,
  /https?:\/\/bili2233\.cn\/[^\s]+/i,
  /(?:^|\s)(BV[0-9A-Za-z]{8,12})(?:\s|$)/,
  /(?:^|\s)(av\d+)(?:\s|$)/i,
  /(?:^|\s)(ep\d+)(?:\s|$)/i,
  /(?:^|\s)(ss\d+)(?:\s|$)/i,
];

/** 从任意文本（剪贴板/协议链接）中提取 B 站链接或 ID。 */
export function extractBilibiliLink(text: string | null | undefined): string | null {
  if (!text) return null;
  const value = text.trim();
  if (!value) return null;
  for (const pattern of BILIBILI_LINK_PATTERNS) {
    const match = pattern.exec(value);
    if (match) return (match[1] ?? match[0]).trim();
  }
  return null;
}

/** 解析 bilidown://parser?link=xxx 协议链接里的目标链接。 */
export function parseProtocolLink(protocolUrl: string): string | null {
  try {
    const url = new URL(protocolUrl);
    const link = url.searchParams.get("link");
    if (link) return link;
    return protocolUrl.replace(/^bilidown:\/\//i, "") || null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ 本地偏好 */

const PREF_PREFIX = "bilidown.desktop.";

export function getDesktopPreference(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  const value = window.localStorage.getItem(PREF_PREFIX + key);
  if (value === null) return fallback;
  return value === "1";
}

export function setDesktopPreference(key: string, value: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PREF_PREFIX + key, value ? "1" : "0");
}
