import type { BiliCookie } from "@/lib/types";

/**
 * B 站扫码登录的 Cookie 解析 / 票据换取工具（服务端专用）。
 *
 * 背景：B 站 2024 年之后把“登录成功后下发 Cookie”拆成了两步：
 *  1. qrcode/poll 确认成功时，data.url 不再直接携带 SESSDATA，而是带 ticket 参数的
 *     crossDomain（跨域确认）地址；
 *  2. 服务端必须访问该地址，从响应头 Set-Cookie 里才能拿到 SESSDATA / bili_jct /
 *     DedeUserID 等真正的登录态。
 * 只解析 data.url 查询参数的旧实现会拿不到登录态（表现为手机端已确认，本地仍然未登录 /
 * 误报二维码过期）。这里同时兼容旧流程（URL 直接带 Cookie）与新流程（ticket 换票）。
 */

/** 登录态相关 cookie 键；其余键忽略，避免把风控/统计 cookie 写进设置文件。 */
export const LOGIN_COOKIE_KEYS = [
  "SESSDATA",
  "bili_jct",
  "DedeUserID",
  "DedeUserID__ckMd5",
  "sid",
  "buvid3",
] as const satisfies ReadonlyArray<keyof BiliCookie>;

export type LoginCookieKey = (typeof LOGIN_COOKIE_KEYS)[number];

const LOGIN_COOKIE_KEY_SET: ReadonlySet<string> = new Set(LOGIN_COOKIE_KEYS);

export function isLoginCookieKey(name: string): name is LoginCookieKey {
  return LOGIN_COOKIE_KEY_SET.has(name);
}

function unquote(value: string): string {
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1);
  }
  return value;
}

/**
 * 解析响应头 Set-Cookie 列表。
 * 注意：保留 value 原文（B 站下发的 SESSDATA 中逗号是 percent-encoded 的 %2C，
 * 解码后再发送会导致部分接口判定未登录）。
 */
export function parseSetCookieHeaders(setCookies: readonly string[] | null | undefined): BiliCookie {
  const cookie: BiliCookie = {};
  if (!setCookies) return cookie;
  for (const header of setCookies) {
    if (typeof header !== "string" || !header) continue;
    const first = header.split(";", 1)[0] ?? "";
    const separator = first.indexOf("=");
    if (separator <= 0) continue;
    const name = first.slice(0, separator).trim();
    const value = unquote(first.slice(separator + 1).trim());
    if (!value || !isLoginCookieKey(name)) continue;
    cookie[name] = value;
  }
  return cookie;
}

/** 合并多组 cookie（后者覆盖前者）。 */
export function mergeLoginCookies(...sources: Array<BiliCookie | null | undefined>): BiliCookie {
  const merged: BiliCookie = {};
  for (const source of sources) {
    if (!source) continue;
    for (const key of LOGIN_COOKIE_KEYS) {
      const value = source[key];
      if (typeof value === "string" && value) merged[key] = value;
    }
  }
  return merged;
}

/** 读取 URL 查询参数原文（不做 percent-decode）。 */
function rawQueryParam(url: URL, name: string): string | undefined {
  const query = url.search.startsWith("?") ? url.search.slice(1) : url.search;
  if (!query) return undefined;
  for (const part of query.split("&")) {
    if (!part) continue;
    const separator = part.indexOf("=");
    const key = separator === -1 ? part : part.slice(0, separator);
    if (key !== name) continue;
    return separator === -1 ? "" : part.slice(separator + 1);
  }
  return undefined;
}

/** 从登录成功回调 URL 的查询参数里解析 cookie（旧流程）。 */
export function parseCookieFromLoginUrl(loginUrl: string | undefined): BiliCookie {
  if (!loginUrl) return {};
  try {
    const url = new URL(loginUrl);
    const cookie: BiliCookie = {};
    for (const key of LOGIN_COOKIE_KEYS) {
      const value = rawQueryParam(url, key);
      if (value) cookie[key] = value;
    }
    return cookie;
  } catch {
    return {};
  }
}

export interface LoginTicket {
  ticket: string;
  gourl: string;
  /** 新流程附带的首跳域（如 .bilibili.com），兜底换票时原样带上。 */
  firstDomain?: string;
  /** 轮询接口返回的确认地址本身（新流程下就是 crossDomain 地址）。 */
  callbackUrl: string;
}

/** 尽量把 percent-encoded 的查询参数还原成明文（非法序列时保持原样）。 */
function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** 解析轮询确认 URL 中的 ticket（新流程）。 */
export function extractLoginTicket(loginUrl: string | undefined): LoginTicket | null {
  if (!loginUrl) return null;
  try {
    const url = new URL(loginUrl);
    const rawTicket = rawQueryParam(url, "ticket");
    if (!rawTicket) return null;
    const rawGourl = rawQueryParam(url, "gourl");
    const rawFirstDomain = rawQueryParam(url, "first_domain");
    return {
      ticket: safeDecodeURIComponent(rawTicket),
      gourl: rawGourl ? safeDecodeURIComponent(rawGourl) : "https://www.bilibili.com",
      firstDomain: rawFirstDomain ? safeDecodeURIComponent(rawFirstDomain) : undefined,
      callbackUrl: url.toString(),
    };
  } catch {
    return null;
  }
}

/** 已知的 crossDomain（换票）端点，按优先级兜底。 */
const CROSS_DOMAIN_ENDPOINTS = [
  "https://passport.biligame.com/x/passport-login/web/crossDomain",
  "https://passport.bilibili.com/x/passport-login/web/crossDomain",
  "https://passport.biligame.com/crossDomain",
];

/** 构造换票请求地址：轮询返回的地址优先，其余已知端点兜底。 */
export function buildTicketExchangeUrls(loginUrl: string): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  const add = (value: string) => {
    if (!value || seen.has(value)) return;
    seen.add(value);
    urls.push(value);
  };
  add(loginUrl);
  const ticket = extractLoginTicket(loginUrl);
  if (ticket) {
    const base =
      "?ticket=" +
      encodeURIComponent(ticket.ticket) +
      "&gourl=" +
      encodeURIComponent(ticket.gourl);
    const firstDomain = ticket.firstDomain
      ? "&first_domain=" + encodeURIComponent(ticket.firstDomain)
      : "";
    for (const endpoint of CROSS_DOMAIN_ENDPOINTS) {
      add(endpoint + base + firstDomain);
    }
  }
  return urls;
}

const BILI_HOST_SUFFIXES = ["bilibili.com", "biligame.com", "hdslb.com", "biliapi.net", "biliapi.com"];

export function isBilibiliHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  return BILI_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith("." + suffix));
}

/** 判断跳转目标是否是 B 站 passport / SSO / crossDomain 相关地址。 */
function isPassportRedirect(url: URL): boolean {
  if (url.protocol !== "https:" || !isBilibiliHost(url.hostname)) return false;
  const host = url.hostname.toLowerCase();
  const path = url.pathname.toLowerCase();
  if (host.includes("passport") || host.startsWith("account.")) return true;
  if (path.includes("crossdomain") || path.includes("/sso") || path.includes("login")) return true;
  return false;
}

/** 从换票响应的 HTML 中提取仍需继续访问的 B 站 SSO 跳转地址（最多 5 个）。 */
export function extractFollowUpUrls(body: string, baseUrl: string): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  const pattern = /https?:\/\/[^\s"'<>\\]+/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(body)) !== null && urls.length < 5) {
    const candidate = match[0]
      .replace(/\\u0026/gi, "&")
      .replace(/&amp;/gi, "&")
      .replace(/[),.;]+$/, "");
    let parsed: URL;
    try {
      parsed = new URL(candidate, baseUrl);
    } catch {
      continue;
    }
    if (parsed.protocol !== "https:") continue;
    if (!isBilibiliHost(parsed.hostname)) continue;
    const identity = parsed.toString().toLowerCase();
    if (!identity.includes("sso") && !identity.includes("crossdomain") && !identity.includes("passport")) {
      continue;
    }
    if (seen.has(identity)) continue;
    seen.add(identity);
    urls.push(parsed.toString());
  }
  return urls;
}

export interface ExchangeTicketOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxHops?: number;
  fetchImpl?: typeof fetch;
}

function readSetCookieHeaders(headers: Headers): string[] {
  const getter = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  if (typeof getter === "function") return getter.call(headers);
  const raw = headers.get("set-cookie");
  return raw ? [raw] : [];
}

/**
 * 用轮询返回的 ticket 访问 crossDomain 地址，捕获响应头 Set-Cookie 换取真实登录态。
 * 手动处理重定向（redirect: "manual"）：undici 自动重定向不会暴露中间响应的 Set-Cookie。
 */
export async function exchangeLoginTicket(
  loginUrl: string,
  options: ExchangeTicketOptions = {},
): Promise<BiliCookie> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const requestHeaders = options.headers ?? {};
  const timeoutMs = options.timeoutMs ?? 15000;
  const maxHops = options.maxHops ?? 6;
  const cookie: BiliCookie = {};
  const visited = new Set<string>();

  if (!loginUrl) return cookie;

  for (const start of buildTicketExchangeUrls(loginUrl)) {
    if (cookie.SESSDATA) break;
    let current: string | null = start;
    for (let hop = 0; hop < maxHops; hop += 1) {
      if (!current || visited.has(current)) break;
      visited.add(current);

      let response: Response;
      try {
        response = await fetchImpl(current, {
          method: "GET",
          headers: requestHeaders,
          redirect: "manual",
          cache: "no-store",
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch {
        break;
      }

      Object.assign(cookie, parseSetCookieHeaders(readSetCookieHeaders(response.headers)));
      if (cookie.SESSDATA) break;

      const location = response.headers.get("location");
      if (response.status >= 300 && response.status < 400 && location) {
        let nextUrl: URL;
        try {
          nextUrl = new URL(location, current);
        } catch {
          break;
        }
        // 只继续跟随 passport/SSO/crossDomain 相关跳转，避免把无意义的请求打到普通页面。
        if (!isPassportRedirect(nextUrl)) break;
        current = nextUrl.toString();
        continue;
      }

      const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
      if (response.status >= 200 && response.status < 300 && contentType.includes("html")) {
        const body = await response.text().catch(() => "");
        const followUps = extractFollowUpUrls(body, current);
        if (followUps.length) {
          current = followUps[0];
          continue;
        }
      }
      break;
    }
  }

  return cookie;
}
