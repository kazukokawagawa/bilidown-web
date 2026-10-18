import { createHash } from "node:crypto";

import { BILI_API, BILI_ORIGIN, BILI_REFERER, BILI_USER_AGENT } from "@/lib/constants";
import type { BiliCookie } from "@/lib/types";

/**
 * B站 WBI 签名（用于搜索等接口）。
 * 公开规则：
 *  1. 取 nav 接口返回的 wbi_img.img_url / sub_url，截取文件名（去掉扩展名）得到 img_key / sub_key；
 *  2. 按固定混淆表从 img_key + sub_key 中取 32 位 mixinKey；
 *  3. 参数按 key 字典序排序、过滤 !'()* 字符，拼接 wts 后做 md5，得到 w_rid。
 * 参考：https://socialsisteryi.github.io/bilibili-API-collect/docs/misc/sign/wbi.html
 */

const MIXIN_KEY_ENC_TAB: readonly number[] = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41,
  13, 37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44,
  52,
];

const WBI_KEYS_TTL_MS = 6 * 60 * 60 * 1000;
const NAV_TIMEOUT_MS = 10 * 1000;

export interface WbiKeys {
  imgKey: string;
  subKey: string;
  fetchedAt: number;
}

interface WbiState {
  cached: WbiKeys | null;
  loading: Promise<WbiKeys> | null;
}

const globalScope = globalThis as unknown as { __bilidownWbiState?: WbiState };
const state: WbiState = (globalScope.__bilidownWbiState ??= { cached: null, loading: null });

/** 按混淆表生成 32 位 mixinKey。 */
export function getMixinKey(origin: string): string {
  let result = "";
  for (const index of MIXIN_KEY_ENC_TAB) {
    const char = origin[index];
    if (char) result += char;
    if (result.length >= 32) break;
  }
  return result;
}

/** 从 wbi_img 的 URL 中截取 key（去掉目录与扩展名）。 */
export function extractWbiKey(url: string | undefined | null): string {
  if (!url) return "";
  const file = url.split("/").pop() ?? "";
  return file.split(".")[0] ?? "";
}

function buildHeaders(cookie: BiliCookie | undefined): Record<string, string> {
  const headers: Record<string, string> = {
    "User-Agent": BILI_USER_AGENT,
    Referer: BILI_REFERER,
    Origin: BILI_ORIGIN,
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "zh-CN,zh;q=0.9",
  };
  const cookieHeader = cookie
    ? Object.entries(cookie)
        .filter(([, value]) => Boolean(value))
        .map(([key, value]) => `${key}=${value}`)
        .join("; ")
    : "";
  if (cookieHeader) headers.Cookie = cookieHeader;
  return headers;
}

interface NavWbiResponse {
  code?: number;
  data?: {
    wbi_img?: { img_url?: string; sub_url?: string };
  };
}

async function fetchWbiKeys(cookie: BiliCookie | undefined): Promise<WbiKeys> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NAV_TIMEOUT_MS);
  try {
    const response = await fetch(BILI_API.nav, {
      method: "GET",
      headers: buildHeaders(cookie),
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = (await response.json()) as NavWbiResponse;
    const imgKey = extractWbiKey(payload.data?.wbi_img?.img_url);
    const subKey = extractWbiKey(payload.data?.wbi_img?.sub_url);
    if (!imgKey || !subKey) throw new Error("nav 接口未返回 wbi_img");
    const keys: WbiKeys = { imgKey, subKey, fetchedAt: Date.now() };
    state.cached = keys;
    return keys;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`获取 WBI 签名密钥失败：${message}`);
  } finally {
    clearTimeout(timer);
  }
}

/** 获取（并缓存）WBI 密钥；失败时抛错，由调用方决定是否降级。 */
export async function getWbiKeys(cookie?: BiliCookie): Promise<WbiKeys> {
  const cached = state.cached;
  if (cached && Date.now() - cached.fetchedAt < WBI_KEYS_TTL_MS) return cached;
  if (state.loading) return state.loading;
  state.loading = fetchWbiKeys(cookie).finally(() => {
    state.loading = null;
  });
  return state.loading;
}

/** 清空 WBI 密钥缓存（登录态变化后可调用）。 */
export function clearWbiCache(): void {
  state.cached = null;
}

function sanitizeValue(value: string): string {
  return value.replace(/[!'()*]/g, "");
}

/** 对参数签名并返回带 wts / w_rid 的完整参数表。 */
export function signWbiParams(
  params: Record<string, string | number>,
  mixinKey: string,
): Record<string, string> {
  const wts = Math.floor(Date.now() / 1000);
  const entries: Array<[string, string]> = Object.entries(params).map(([key, value]) => [
    key,
    sanitizeValue(String(value)),
  ]);
  entries.push(["wts", String(wts)]);
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const query = entries.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join("&");
  const wRid = createHash("md5").update(query + mixinKey).digest("hex");
  const signed: Record<string, string> = {};
  for (const [key, value] of entries) signed[key] = value;
  signed.w_rid = wRid;
  return signed;
}

/** 便捷方法：参数 -> 已签名 query string。 */
export function buildWbiQuery(params: Record<string, string | number>, mixinKey: string): string {
  const signed = signWbiParams(params, mixinKey);
  return Object.entries(signed)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
}
