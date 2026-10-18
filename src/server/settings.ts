import { DEFAULT_SETTINGS } from "@/lib/constants";
import type { AppSettings, BiliCookie, Codec, PublicSettings } from "@/lib/types";

import { readJsonFile, SETTINGS_FILE, writeJsonAtomic } from "./paths";

/**
 * data/settings.json 的读写与校验。
 * - 服务端内存缓存 + globalThis 单例（防止 Next dev 热更新重复加载）
 * - cookie 只保存在服务端，GET /api/settings 返回 PublicSettings（打码）
 * - proxy 字段目前仅存储、不参与下载（Node fetch 不支持 HTTP 代理，按需求暂不生效）
 */

const COOKIE_KEYS: ReadonlyArray<keyof BiliCookie> = [
  "SESSDATA",
  "bili_jct",
  "DedeUserID",
  "DedeUserID__ckMd5",
  "sid",
  "buvid3",
];

const CODECS: readonly Codec[] = ["avc", "hevc", "av1"];
const THEMES: ReadonlyArray<AppSettings["theme"]> = ["light", "dark", "system"];

interface SettingsState {
  cached: AppSettings | null;
  loading: Promise<AppSettings> | null;
}

const globalScope = globalThis as unknown as { __bilidownSettingsState?: SettingsState };
const state: SettingsState = (globalScope.__bilidownSettingsState ??= { cached: null, loading: null });

export class SettingsValidationError extends Error {
  readonly status = 400;
  readonly code = "INVALID_SETTINGS";

  constructor(message: string) {
    super(message);
    this.name = "SettingsValidationError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCodec(value: unknown): value is Codec {
  return typeof value === "string" && CODECS.includes(value as Codec);
}

function isTheme(value: unknown): value is AppSettings["theme"] {
  return typeof value === "string" && THEMES.includes(value as AppSettings["theme"]);
}

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function normalizeCookie(raw: unknown): BiliCookie {
  if (!isRecord(raw)) return {};
  const cookie: BiliCookie = {};
  for (const key of COOKIE_KEYS) {
    const value = raw[key];
    if (typeof value === "string" && value.trim()) cookie[key] = value.trim();
  }
  return cookie;
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/** 把任意来源的 JSON 规整为完整 AppSettings（缺失/非法字段回退默认值）。 */
export function normalizeSettings(raw: unknown): AppSettings {
  if (!isRecord(raw)) return { ...DEFAULT_SETTINGS, cookie: {} };
  return {
    downloadDir: typeof raw.downloadDir === "string" ? raw.downloadDir.trim() : DEFAULT_SETTINGS.downloadDir,
    namingTemplate:
      typeof raw.namingTemplate === "string" && raw.namingTemplate.trim()
        ? raw.namingTemplate.trim().slice(0, 200)
        : DEFAULT_SETTINGS.namingTemplate,
    maxConcurrent:
      typeof raw.maxConcurrent === "number" && Number.isFinite(raw.maxConcurrent)
        ? clampInt(raw.maxConcurrent, 1, 5)
        : DEFAULT_SETTINGS.maxConcurrent,
    defaultQn:
      typeof raw.defaultQn === "number" && Number.isInteger(raw.defaultQn) && raw.defaultQn > 0
        ? raw.defaultQn
        : DEFAULT_SETTINGS.defaultQn,
    preferCodec: isCodec(raw.preferCodec) ? raw.preferCodec : DEFAULT_SETTINGS.preferCodec,
    mergeWithFfmpeg: normalizeBoolean(raw.mergeWithFfmpeg, DEFAULT_SETTINGS.mergeWithFfmpeg),
    ffmpegPath: typeof raw.ffmpegPath === "string" ? raw.ffmpegPath.trim() : DEFAULT_SETTINGS.ffmpegPath,
    cookie: normalizeCookie(raw.cookie),
    proxy: typeof raw.proxy === "string" ? raw.proxy.trim() : DEFAULT_SETTINGS.proxy,
    theme: isTheme(raw.theme) ? raw.theme : DEFAULT_SETTINGS.theme,
    clipboardWatch: normalizeBoolean(raw.clipboardWatch, DEFAULT_SETTINGS.clipboardWatch),
    autoCheckUpdate: normalizeBoolean(raw.autoCheckUpdate, DEFAULT_SETTINGS.autoCheckUpdate),
    saveTaskHistory: normalizeBoolean(raw.saveTaskHistory, DEFAULT_SETTINGS.saveTaskHistory),
    deleteTempAfterMerge: normalizeBoolean(raw.deleteTempAfterMerge, DEFAULT_SETTINGS.deleteTempAfterMerge),
  };
}

/**
 * 校验 PUT /api/settings 的局部更新。
 * 未知字段忽略；已知字段类型/范围非法时抛出 SettingsValidationError（HTTP 400）。
 * 注意：cookie 不允许通过该接口写入（只能由登录流程写入）。
 */
export function normalizeSettingsPatch(raw: unknown): Partial<AppSettings> {
  if (!isRecord(raw)) throw new SettingsValidationError("设置必须是 JSON 对象");
  const patch: Partial<AppSettings> = {};

  if ("downloadDir" in raw) {
    const value = raw.downloadDir;
    if (typeof value !== "string") throw new SettingsValidationError("downloadDir 必须是字符串");
    patch.downloadDir = value.trim().slice(0, 1000);
  }
  if ("namingTemplate" in raw) {
    const value = raw.namingTemplate;
    if (typeof value !== "string" || !value.trim()) throw new SettingsValidationError("namingTemplate 不能为空");
    if (value.trim().length > 200) throw new SettingsValidationError("namingTemplate 长度不能超过 200");
    patch.namingTemplate = value.trim();
  }
  if ("maxConcurrent" in raw) {
    const value = raw.maxConcurrent;
    if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value)) {
      throw new SettingsValidationError("maxConcurrent 必须是整数");
    }
    if (value < 1 || value > 5) throw new SettingsValidationError("maxConcurrent 取值范围为 1~5");
    patch.maxConcurrent = value;
  }
  if ("defaultQn" in raw) {
    const value = raw.defaultQn;
    if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
      throw new SettingsValidationError("defaultQn 必须是正整数");
    }
    patch.defaultQn = value;
  }
  if ("preferCodec" in raw) {
    if (!isCodec(raw.preferCodec)) throw new SettingsValidationError("preferCodec 必须是 avc / hevc / av1 之一");
    patch.preferCodec = raw.preferCodec;
  }
  if ("mergeWithFfmpeg" in raw) {
    if (typeof raw.mergeWithFfmpeg !== "boolean") throw new SettingsValidationError("mergeWithFfmpeg 必须是布尔值");
    patch.mergeWithFfmpeg = raw.mergeWithFfmpeg;
  }
  if ("ffmpegPath" in raw) {
    const value = raw.ffmpegPath;
    if (typeof value !== "string") throw new SettingsValidationError("ffmpegPath 必须是字符串");
    patch.ffmpegPath = value.trim().slice(0, 1000);
  }
  if ("proxy" in raw) {
    const value = raw.proxy;
    if (typeof value !== "string") throw new SettingsValidationError("proxy 必须是字符串");
    // 代理仅保存，暂不生效：Node 内置 fetch 不支持 HTTP 代理，后续可接 undici ProxyAgent。
    patch.proxy = value.trim().slice(0, 500);
  }
  if ("theme" in raw) {
    if (!isTheme(raw.theme)) throw new SettingsValidationError("theme 必须是 light / dark / system 之一");
    patch.theme = raw.theme;
  }
  for (const key of ["clipboardWatch", "autoCheckUpdate", "saveTaskHistory", "deleteTempAfterMerge"] as const) {
    if (key in raw) {
      if (typeof raw[key] !== "boolean") throw new SettingsValidationError(`${key} 必须是布尔值`);
      patch[key] = raw[key];
    }
  }
  return patch;
}

async function loadSettings(): Promise<AppSettings> {
  const raw = await readJsonFile<unknown>(SETTINGS_FILE).catch((error: unknown) => {
    console.error("[settings] 读取 settings.json 失败，使用默认设置:", error);
    return null;
  });
  const settings = normalizeSettings(raw);
  state.cached = settings;
  return settings;
}

export async function getSettings(): Promise<AppSettings> {
  if (state.cached) return state.cached;
  if (!state.loading) state.loading = loadSettings();
  const settings = await state.loading;
  state.cached = settings;
  return settings;
}

export async function saveSettings(settings: AppSettings): Promise<AppSettings> {
  state.cached = settings;
  await writeJsonAtomic(SETTINGS_FILE, settings);
  return settings;
}

export async function updateSettings(patchInput: unknown): Promise<AppSettings> {
  const current = await getSettings();
  const patch = normalizeSettingsPatch(patchInput);
  const next: AppSettings = { ...current, ...patch };
  return saveSettings(next);
}

/** 登录成功后写入 cookie（与已有 cookie 合并，保留 buvid3 等字段）。 */
export async function saveCookie(cookie: BiliCookie): Promise<AppSettings> {
  const current = await getSettings();
  const merged: BiliCookie = { ...current.cookie };
  for (const key of COOKIE_KEYS) {
    const value = cookie[key];
    if (value) merged[key] = value;
  }
  return saveSettings({ ...current, cookie: merged });
}

export async function clearCookie(): Promise<AppSettings> {
  const current = await getSettings();
  return saveSettings({ ...current, cookie: {} });
}

export async function getCookie(): Promise<BiliCookie> {
  return (await getSettings()).cookie;
}

export function buildCookieHeader(cookie: BiliCookie | undefined): string {
  if (!cookie) return "";
  return COOKIE_KEYS.map((key) => {
    const value = cookie[key];
    return value ? `${key}=${value}` : "";
  })
    .filter(Boolean)
    .join("; ");
}

export function isLoggedIn(cookie: BiliCookie | undefined): boolean {
  return Boolean(cookie && cookie.SESSDATA);
}

export function toPublicSettings(settings: AppSettings): PublicSettings {
  const { cookie, ...rest } = settings;
  return {
    ...rest,
    loggedIn: isLoggedIn(cookie),
    cookiePreview: cookie.DedeUserID ? { DedeUserID: cookie.DedeUserID } : undefined,
  };
}

export async function getPublicSettings(): Promise<PublicSettings> {
  return toPublicSettings(await getSettings());
}
