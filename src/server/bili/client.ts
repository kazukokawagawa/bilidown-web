import {
  BILI_API,
  BILI_ORIGIN,
  BILI_REFERER,
  BILI_USER_AGENT,
  CODEC_BY_ID,
  LOGIN_REQUIRED_QN,
  QUALITY_LABELS,
} from "@/lib/constants";
import { stripHtml } from "@/lib/format";
import type {
  BiliCookie,
  BiliUser,
  Codec,
  LoginPollStatus,
  NavResponse,
  ParsedInput,
  QualityOption,
  SearchItem,
  SearchResponse,
  SearchUserItem,
  SearchVideoItem,
  StreamDetail,
  StreamSource,
  StreamsResponse,
  VideoInfo,
  VideoPage,
  VideoStat,
} from "@/lib/types";

import {
  exchangeLoginTicket,
  mergeLoginCookies,
  parseCookieFromLoginUrl,
  parseSetCookieHeaders,
} from "./login-cookie";
import { getMixinKey, getWbiKeys, signWbiParams } from "./wbi";

/**
 * B站 API 客户端（服务端专用）。
 * 所有请求统一带 User-Agent / Referer / Origin 与服务端保存的 Cookie，避免被风控。
 */

const REQUEST_TIMEOUT_MS = 15000;
const SHORT_LINK_TIMEOUT_MS = 10000;
const SEARCH_PAGE_SIZE = 20;

const BV_PATTERN = /[Bb][Vv][0-9A-Za-z]{10}/;
const AV_PATTERN = /(?:^|[^0-9A-Za-z])av(\d{1,12})/i;
const EP_PATTERN = /(?:^|[^0-9A-Za-z])ep(\d{1,12})/i;
const SS_PATTERN = /(?:^|[^0-9A-Za-z])ss(\d{1,12})/i;
const SHORT_LINK_PATTERN = /(?:^|:\/\/)(?:b23\.tv|bili2233\.cn|bili2233\.com)\//i;
const URL_PATTERN = /^https?:\/\//i;

export class BiliApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, options: { status?: number; code?: string } = {}) {
    super(message);
    this.name = "BiliApiError";
    this.status = options.status ?? 502;
    this.code = options.code;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return "未知错误";
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}

function numOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function strOr(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

/** 把 // 开头或 http:// 的图片地址统一为 https。 */
export function normalizeImageUrl(url: string | undefined | null): string {
  if (!url) return "";
  if (url.startsWith("//")) return "https:" + url;
  if (url.startsWith("http://")) return "https://" + url.slice("http://".length);
  return url;
}

export function buildCookieHeader(cookie: BiliCookie | undefined): string {
  if (!cookie) return "";
  return (Object.entries(cookie) as Array<[string, string | undefined]>)
    .filter(([, value]) => Boolean(value))
    .map(([key, value]) => key + "=" + String(value))
    .join("; ");
}

/** B站请求公共头（UA / Referer / Origin / Cookie）。 */
export function buildBiliHeaders(cookie?: BiliCookie): Record<string, string> {
  const headers: Record<string, string> = {
    "User-Agent": BILI_USER_AGENT,
    Referer: BILI_REFERER,
    Origin: BILI_ORIGIN,
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "zh-CN,zh;q=0.9",
  };
  const cookieHeader = buildCookieHeader(cookie);
  if (cookieHeader) headers.Cookie = cookieHeader;
  return headers;
}

interface BiliEnvelope<T> {
  code?: number;
  message?: string;
  msg?: string;
  data?: T;
  result?: T;
}

interface BiliFetchedJson<T> {
  envelope: BiliEnvelope<T>;
  /** 响应头 Set-Cookie 原文（登录相关接口需要，用于换取登录态）。 */
  setCookies: string[];
}

/** 读取响应头中的全部 Set-Cookie（Node 18.14+ / undici 支持 getSetCookie）。 */
function readSetCookieHeaders(headers: Headers): string[] {
  const getter = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  if (typeof getter === "function") return getter.call(headers);
  const raw = headers.get("set-cookie");
  return raw ? [raw] : [];
}

async function fetchBiliJsonWithCookies<T>(
  url: string,
  cookie?: BiliCookie,
  options: { timeoutMs?: number } = {},
): Promise<BiliFetchedJson<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? REQUEST_TIMEOUT_MS);
  try {
    let response: Response;
    try {
      response = await fetch(url, {
        method: "GET",
        headers: buildBiliHeaders(cookie),
        cache: "no-store",
        redirect: "follow",
        signal: controller.signal,
      });
    } catch (error) {
      if (isAbortError(error)) {
        throw new BiliApiError("B站接口请求超时，请稍后重试", { status: 504, code: "BILI_TIMEOUT" });
      }
      throw new BiliApiError("无法连接 B站接口：" + errorMessage(error), { status: 502, code: "BILI_NETWORK" });
    }
    const text = await response.text();
    if (!response.ok) {
      throw new BiliApiError("B站接口请求失败（HTTP " + response.status + "）", {
        status: 502,
        code: "BILI_HTTP_ERROR",
      });
    }
    try {
      return {
        envelope: JSON.parse(text) as BiliEnvelope<T>,
        setCookies: readSetCookieHeaders(response.headers),
      };
    } catch {
      throw new BiliApiError("B站接口返回了非 JSON 数据（可能被风控拦截）", {
        status: 502,
        code: "BILI_BAD_RESPONSE",
      });
    }
  } finally {
    clearTimeout(timer);
  }
}

async function fetchBiliJson<T>(
  url: string,
  cookie?: BiliCookie,
  options: { timeoutMs?: number } = {},
): Promise<BiliEnvelope<T>> {
  const { envelope } = await fetchBiliJsonWithCookies<T>(url, cookie, options);
  return envelope;
}

/* ---------------------------------------------------------------- 输入解析 */

/** 同步解析用户输入（BV / av / ep / ss / b23 短链 / 普通链接）。 */
export function parseInput(input: string): ParsedInput {
  const raw = input.trim();
  if (!raw) throw new BiliApiError("请输入视频链接、BV 号或 av 号", { status: 400, code: "INVALID_INPUT" });

  if (SHORT_LINK_PATTERN.test(raw)) {
    return { type: "b23", url: normalizeShortUrl(raw) };
  }

  const bvMatch = BV_PATTERN.exec(raw);
  if (bvMatch) {
    const bvid = "BV" + bvMatch[0].slice(2);
    return URL_PATTERN.test(raw) ? { type: "bvid", bvid, url: raw } : { type: "bvid", bvid };
  }

  const avMatch = AV_PATTERN.exec(raw);
  if (avMatch) {
    const aid = Number.parseInt(avMatch[1], 10);
    if (Number.isFinite(aid) && aid > 0) {
      return URL_PATTERN.test(raw) ? { type: "av", aid, url: raw } : { type: "av", aid };
    }
  }

  const epMatch = EP_PATTERN.exec(raw);
  if (epMatch) {
    const epId = Number.parseInt(epMatch[1], 10);
    if (Number.isFinite(epId) && epId > 0) {
      return URL_PATTERN.test(raw) ? { type: "ep", epId, url: raw } : { type: "ep", epId };
    }
  }

  const ssMatch = SS_PATTERN.exec(raw);
  if (ssMatch) {
    const seasonId = Number.parseInt(ssMatch[1], 10);
    if (Number.isFinite(seasonId) && seasonId > 0) {
      return URL_PATTERN.test(raw) ? { type: "ss", seasonId, url: raw } : { type: "ss", seasonId };
    }
  }

  if (URL_PATTERN.test(raw)) return { type: "url", url: raw };

  throw new BiliApiError("无法识别的输入，请提供 BV 号、av 号、ep/ss 号或视频链接", {
    status: 400,
    code: "INVALID_INPUT",
  });
}

function normalizeShortUrl(raw: string): string {
  if (raw.startsWith("//")) return "https:" + raw;
  if (URL_PATTERN.test(raw)) return raw;
  return "https://" + raw;
}

/** 跟随短链跳转，返回最终 URL（失败时返回原 URL）。 */
export async function resolveShortLink(shortUrl: string): Promise<string> {
  let current = normalizeShortUrl(shortUrl);
  for (let hop = 0; hop < 6; hop += 1) {
    let response: Response;
    try {
      response = await fetch(current, {
        method: "GET",
        redirect: "manual",
        headers: buildBiliHeaders(),
        cache: "no-store",
        signal: AbortSignal.timeout(SHORT_LINK_TIMEOUT_MS),
      });
    } catch {
      return current;
    }
    if (response.body) {
      await response.body.cancel().catch(() => undefined);
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return current;
      try {
        current = new URL(location, current).toString();
      } catch {
        return current;
      }
      continue;
    }
    return response.ok ? response.url || current : current;
  }
  return current;
}

interface RawPgcEpisode {
  id?: number;
  ep_id?: number;
  aid?: number;
  bvid?: string;
  cid?: number;
  title?: string;
  long_title?: string;
}

interface RawPgcData {
  season_id?: number;
  title?: string;
  episodes?: RawPgcEpisode[];
}

async function fetchPgcSeason(
  params: { seasonId?: number; epId?: number },
  cookie?: BiliCookie,
): Promise<RawPgcData> {
  const search = new URLSearchParams();
  if (params.seasonId) search.set("season_id", String(params.seasonId));
  if (params.epId) search.set("ep_id", String(params.epId));
  const envelope = await fetchBiliJson<RawPgcData>(BILI_API.pgcSeason + "?" + search.toString(), cookie);
  // pgc 接口的数据在 result 字段而不是 data 字段
  const data = envelope.data ?? envelope.result;
  if (envelope.code !== 0 || !data) {
    throw new BiliApiError(envelope.message ?? envelope.msg ?? "获取番剧信息失败", {
      status: 404,
      code: "PGC_NOT_FOUND",
    });
  }
  return data;
}

/** 把 ep / ss 解析为具体一集的 bvid / aid。 */
export async function resolvePgcVideo(
  parsed: ParsedInput,
  cookie?: BiliCookie,
): Promise<{ bvid: string; aid: number }> {
  if (!parsed.epId && !parsed.seasonId) {
    throw new BiliApiError("缺少 ep / ss 编号", { status: 400, code: "INVALID_INPUT" });
  }
  const season = await fetchPgcSeason({ seasonId: parsed.seasonId, epId: parsed.epId }, cookie);
  const episodes = season.episodes ?? [];
  if (!episodes.length) {
    throw new BiliApiError("该番剧没有可用的剧集", { status: 404, code: "PGC_NOT_FOUND" });
  }
  let episode = episodes[0];
  if (parsed.epId) {
    const found = episodes.find((item) => item.ep_id === parsed.epId || item.id === parsed.epId);
    if (found) episode = found;
  }
  if (!episode.bvid) {
    throw new BiliApiError("无法解析番剧对应的视频", { status: 404, code: "PGC_NOT_FOUND" });
  }
  return { bvid: episode.bvid, aid: episode.aid ?? 0 };
}

/** 解析任意输入：短链跟随跳转、ep/ss 解析到具体 bvid。 */
export async function resolveInput(input: string, cookie?: BiliCookie): Promise<ParsedInput> {
  const parsed = parseInput(input);
  if (parsed.type === "b23" && parsed.url) {
    const finalUrl = await resolveShortLink(parsed.url);
    const resolved = parseInput(finalUrl);
    if (resolved.type === "bvid" || resolved.type === "av") return { ...resolved, url: parsed.url };
    if (resolved.type === "ep" || resolved.type === "ss") {
      const video = await resolvePgcVideo(resolved, cookie);
      return { ...resolved, url: parsed.url, bvid: video.bvid, aid: video.aid };
    }
    return { ...parsed, url: finalUrl };
  }
  if (parsed.type === "ep" || parsed.type === "ss") {
    const video = await resolvePgcVideo(parsed, cookie);
    return { ...parsed, bvid: video.bvid, aid: video.aid };
  }
  return parsed;
}

/* ---------------------------------------------------------------- 视频信息 */

interface RawViewData {
  bvid?: string;
  aid?: number;
  title?: string;
  pic?: string;
  desc?: string;
  duration?: number;
  pubdate?: number;
  videos?: number;
  owner?: { mid?: number; name?: string; face?: string };
  stat?: Record<string, number | undefined>;
  pages?: Array<{ cid?: number; page?: number; part?: string; title?: string; duration?: number }>;
}

export interface VideoId {
  bvid?: string;
  aid?: number;
}

export async function getVideoInfo(id: VideoId, cookie?: BiliCookie): Promise<VideoInfo> {
  if (!id.bvid && !id.aid) throw new BiliApiError("缺少 bvid 或 aid", { status: 400, code: "INVALID_INPUT" });
  const search = new URLSearchParams();
  if (id.bvid) search.set("bvid", id.bvid);
  else search.set("aid", String(id.aid));
  const envelope = await fetchBiliJson<RawViewData>(BILI_API.view + "?" + search.toString(), cookie);
  if (envelope.code !== 0 || !envelope.data) {
    throw new BiliApiError(envelope.message ?? envelope.msg ?? "获取视频信息失败", {
      status: 404,
      code: "VIDEO_NOT_FOUND",
    });
  }
  const data = envelope.data;
  const bvid = strOr(data.bvid, id.bvid ?? "");
  const pages: VideoPage[] = (data.pages ?? []).map((page, index) => ({
    cid: numOr(page.cid, 0),
    page: numOr(page.page, index + 1),
    title: strOr(page.part, strOr(page.title, "")),
    duration: numOr(page.duration, 0),
  }));
  const stat: VideoStat = {
    view: numOr(data.stat?.view, 0),
    danmaku: numOr(data.stat?.danmaku, 0),
    reply: numOr(data.stat?.reply, 0),
    favorite: numOr(data.stat?.favorite, 0),
    coin: numOr(data.stat?.coin, 0),
    share: numOr(data.stat?.share, 0),
    like: numOr(data.stat?.like, 0),
  };
  return {
    bvid,
    aid: numOr(data.aid, id.aid ?? 0),
    title: strOr(data.title, bvid),
    cover: normalizeImageUrl(data.pic),
    desc: strOr(data.desc, ""),
    duration: numOr(data.duration, 0),
    pubdate: numOr(data.pubdate, 0),
    owner: {
      mid: numOr(data.owner?.mid, 0),
      name: strOr(data.owner?.name, ""),
      face: normalizeImageUrl(data.owner?.face),
    },
    stat,
    pages: pages.length ? pages : [{ cid: 0, page: 1, title: "P1", duration: numOr(data.duration, 0) }],
    videos: numOr(data.videos, pages.length || 1),
  };
}

/* ---------------------------------------------------------------- 播放流 */

interface RawDashEntry {
  id?: number;
  baseUrl?: string;
  base_url?: string;
  backupUrl?: string[] | null;
  backup_url?: string[] | null;
  bandwidth?: number;
  codecid?: number;
  codecs?: string;
  mimeType?: string;
  mime_type?: string;
}

interface RawDash {
  duration?: number;
  video?: RawDashEntry[] | null;
  audio?: RawDashEntry[] | null;
  flac?: { audio?: RawDashEntry | null } | null;
  dolby?: { audio?: RawDashEntry[] | null } | null;
}

interface RawPlayData {
  quality?: number;
  accept_quality?: number[];
  accept_description?: string[];
  dash?: RawDash | null;
  durl?: unknown[] | null;
  timelength?: number;
}

interface NormalizedMedia {
  qn: number;
  codec: Codec;
  baseUrl: string;
  backupUrls: string[];
  bandwidth: number;
}

export interface PlayStreamsRequest {
  bvid: string;
  cid: number;
  qn?: number;
  codec?: Codec;
  audioOnly?: boolean;
  cookie?: BiliCookie;
  /** 视频时长（秒），用于估算文件大小；不传则用 dash.duration。 */
  duration?: number;
}

const CODEC_RANK: Record<Codec, number> = { avc: 0, hevc: 1, av1: 2 };

function resolveCodec(entry: RawDashEntry): Codec {
  if (typeof entry.codecid === "number" && CODEC_BY_ID[entry.codecid]) return CODEC_BY_ID[entry.codecid];
  const codecs = (entry.codecs ?? "").toLowerCase();
  if (codecs.startsWith("hev") || codecs.startsWith("hvc") || codecs.includes("hvc1")) return "hevc";
  if (codecs.startsWith("av01")) return "av1";
  return "avc";
}

function normalizeDashEntry(entry: RawDashEntry | null | undefined): NormalizedMedia | null {
  if (!entry) return null;
  const baseUrl = entry.baseUrl ?? entry.base_url ?? "";
  if (!baseUrl) return null;
  const backupUrls = (entry.backupUrl ?? entry.backup_url ?? []).filter(
    (url): url is string => typeof url === "string" && Boolean(url),
  );
  return {
    qn: numOr(entry.id, 0),
    codec: resolveCodec(entry),
    baseUrl,
    backupUrls,
    bandwidth: numOr(entry.bandwidth, 0),
  };
}

function dedupeMedia(items: NormalizedMedia[]): NormalizedMedia[] {
  const seen = new Set<string>();
  const result: NormalizedMedia[] = [];
  for (const item of items) {
    const key = item.qn + ":" + item.codec + ":" + item.baseUrl;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function pickVideo(videos: NormalizedMedia[], qn?: number, codec?: Codec): NormalizedMedia | undefined {
  if (!videos.length) return undefined;
  let candidates = qn ? videos.filter((item) => item.qn === qn) : [];
  if (!candidates.length) {
    const maxQn = Math.max(...videos.map((item) => item.qn));
    candidates = videos.filter((item) => item.qn === maxQn);
  }
  const withCodec = codec ? candidates.filter((item) => item.codec === codec) : [];
  const pool = withCodec.length ? withCodec : candidates;
  return [...pool].sort((a, b) => b.bandwidth - a.bandwidth)[0];
}

function pickBestAudio(audios: NormalizedMedia[]): NormalizedMedia | undefined {
  if (!audios.length) return undefined;
  return [...audios].sort((a, b) => b.bandwidth - a.bandwidth)[0];
}

function buildQualities(
  videos: NormalizedMedia[],
  acceptQuality: number[] | undefined,
  loggedIn: boolean,
): QualityOption[] {
  const sorted = [...videos].sort(
    (a, b) => b.qn - a.qn || CODEC_RANK[a.codec] - CODEC_RANK[b.codec] || b.bandwidth - a.bandwidth,
  );
  const result: QualityOption[] = [];
  const seen = new Set<string>();
  for (const media of sorted) {
    const key = media.qn + ":" + media.codec;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({
      qn: media.qn,
      label: QUALITY_LABELS[media.qn] ?? "清晰度 " + media.qn,
      codec: media.codec,
      needsLogin: !loggedIn && LOGIN_REQUIRED_QN.includes(media.qn),
    });
  }
  // 未登录时把需要登录的高清选项补进来（置灰提示用）
  if (!loggedIn && acceptQuality) {
    for (const qn of acceptQuality) {
      if (result.some((item) => item.qn === qn)) continue;
      if (!LOGIN_REQUIRED_QN.includes(qn)) continue;
      result.push({
        qn,
        label: QUALITY_LABELS[qn] ?? "清晰度 " + qn,
        codec: "avc",
        needsLogin: true,
      });
    }
  }
  result.sort((a, b) => b.qn - a.qn || CODEC_RANK[a.codec] - CODEC_RANK[b.codec]);
  return result;
}

function toStreamSource(media: NormalizedMedia, duration: number): StreamSource {
  return {
    url: media.baseUrl,
    backupUrls: media.backupUrls,
    bandwidth: media.bandwidth > 0 ? media.bandwidth : undefined,
    size: duration > 0 && media.bandwidth > 0 ? Math.round((media.bandwidth * duration) / 8) : undefined,
  };
}

/** 获取 DASH 播放流：可用清晰度列表 + 指定 qn/codec 的播放地址。 */
export async function getPlayStreams(req: PlayStreamsRequest): Promise<StreamsResponse> {
  const search = new URLSearchParams();
  search.set("bvid", req.bvid);
  search.set("cid", String(req.cid));
  // fnval=4048 是掩码：DASH(16) + HDR(64) + 4K(128) + 杜比音频(256) + 杜比视界(512) + 8K(1024) + AV1(2048)
  search.set("fnval", "4048");
  search.set("fourk", "1");
  search.set("fnver", "0");
  if (req.qn && req.qn > 0) search.set("qn", String(req.qn));

  const envelope = await fetchBiliJson<RawPlayData>(BILI_API.playurl + "?" + search.toString(), req.cookie);
  if (envelope.code !== 0 || !envelope.data) {
    throw new BiliApiError(envelope.message ?? envelope.msg ?? "获取播放地址失败", {
      status: 502,
      code: "PLAYURL_FAILED",
    });
  }
  const data = envelope.data;
  if (!data.dash) {
    throw new BiliApiError("该视频不支持 DASH 格式，暂无法在线下载", { status: 422, code: "DASH_UNSUPPORTED" });
  }

  let videos = dedupeMedia((data.dash.video ?? []).map(normalizeDashEntry).filter((item) => item !== null));
  const loggedIn = Boolean(req.cookie?.SESSDATA);

  // 已登录大会员时，112/116 等清晰度可能需要单独带 qn 补拉后合并（原应用行为）
  if (loggedIn && data.accept_quality) {
    const missing = data.accept_quality.filter(
      (qn) => (qn === 112 || qn === 116) && !videos.some((item) => item.qn === qn),
    );
    for (const qn of missing) {
      try {
        const extraSearch = new URLSearchParams();
        extraSearch.set("bvid", req.bvid);
        extraSearch.set("cid", String(req.cid));
        extraSearch.set("fnval", "4048");
        extraSearch.set("fourk", "1");
        extraSearch.set("fnver", "0");
        extraSearch.set("qn", String(qn));
        const extra = await fetchBiliJson<RawPlayData>(BILI_API.playurl + "?" + extraSearch.toString(), req.cookie);
        const extraVideos = (extra.data?.dash?.video ?? [])
          .map(normalizeDashEntry)
          .filter((item) => item !== null);
        if (extraVideos.length) videos = dedupeMedia([...videos, ...extraVideos]);
      } catch (error) {
        console.warn("[bili] 补拉清晰度 " + qn + " 失败:", errorMessage(error));
      }
    }
  }

  // 音频候选优先级：Hi-Res FLAC > 杜比全景声 > 普通 AAC
  const normalAudios: NormalizedMedia[] = [];
  for (const entry of data.dash.audio ?? []) {
    const media = normalizeDashEntry(entry);
    if (media) normalAudios.push(media);
  }
  const dolbyAudios: NormalizedMedia[] = [];
  for (const entry of data.dash.dolby?.audio ?? []) {
    const media = normalizeDashEntry(entry);
    if (media) dolbyAudios.push(media);
  }
  const flacAudio = normalizeDashEntry(data.dash.flac?.audio);

  const duration = req.duration && req.duration > 0 ? req.duration : numOr(data.dash.duration, 0);
  const qualities = buildQualities(videos, data.accept_quality, loggedIn);
  const video = pickVideo(videos, req.qn, req.codec);
  const audio = req.audioOnly
    ? flacAudio ?? pickBestAudio(dolbyAudios) ?? pickBestAudio(normalAudios)
    : pickBestAudio(normalAudios) ?? flacAudio ?? pickBestAudio(dolbyAudios);
  if (!video && !audio) {
    throw new BiliApiError("该视频没有可用的播放流（可能是付费/充电专属视频）", {
      status: 422,
      code: "STREAM_UNAVAILABLE",
    });
  }
  const selectedQn = video?.qn ?? req.qn ?? 0;
  const selectedCodec = video?.codec ?? req.codec ?? "avc";
  const selected: StreamDetail = {
    qn: selectedQn,
    label: QUALITY_LABELS[selectedQn] ?? (selectedQn > 0 ? "清晰度 " + selectedQn : "仅音频"),
    codec: selectedCodec,
    video: video ? toStreamSource(video, duration) : undefined,
    audio: audio ? toStreamSource(audio, duration) : undefined,
    audioOnly: Boolean(req.audioOnly),
  };
  return { qualities, selected };
}

/* ---------------------------------------------------------------- 搜索 */

interface RawSearchData {
  result?: unknown[] | null;
  numResults?: number;
  numPages?: number;
  pages?: number;
}

export interface SearchRequest {
  keyword: string;
  type: "video" | "user";
  page?: number;
  order?: string;
  cookie?: BiliCookie;
}

const VIDEO_ORDERS = new Set(["totalrank", "click", "pubdate", "dm", "stow"]);

function normalizeOrder(type: "video" | "user", order: string | undefined): string {
  if (type === "user") return "0";
  if (order && VIDEO_ORDERS.has(order)) return order;
  return "totalrank";
}

function buildSearchParams(req: SearchRequest, page: number): Record<string, string | number> {
  const searchType = req.type === "user" ? "bili_user" : "video";
  const params: Record<string, string | number> = {
    search_type: searchType,
    keyword: req.keyword,
    page,
    page_size: SEARCH_PAGE_SIZE,
    platform: "pc",
    web_location: 1430654,
  };
  if (req.type === "video") {
    params.order = normalizeOrder("video", req.order);
    params.duration = 0;
    params.tids = 0;
  } else {
    params.order = "0";
  }
  return params;
}

function mapSearchVideo(raw: Record<string, unknown>): SearchVideoItem | null {
  const bvid = strOr(raw.bvid, "");
  if (!bvid) return null;
  return {
    type: "video",
    bvid,
    aid: numOr(raw.aid, 0),
    title: stripHtml(strOr(raw.title, "")),
    cover: normalizeImageUrl(strOr(raw.pic, "")),
    author: strOr(raw.author, ""),
    mid: numOr(raw.mid, 0),
    duration: strOr(raw.duration, ""),
    play: numOr(raw.play, 0),
    danmaku: numOr(raw.video_review, 0),
    pubdate: numOr(raw.pubdate, 0),
    description: strOr(raw.description, ""),
  };
}

function mapSearchUser(raw: Record<string, unknown>): SearchUserItem | null {
  const mid = numOr(raw.mid, 0);
  if (!mid) return null;
  return {
    type: "user",
    mid,
    name: strOr(raw.uname, ""),
    face: normalizeImageUrl(strOr(raw.upic, "")),
    fans: numOr(raw.fans, 0),
    videos: numOr(raw.videos, 0),
    sign: strOr(raw.usign, ""),
  };
}

function mapSearchResponse(data: RawSearchData, type: "video" | "user", page: number): SearchResponse {
  const rawItems = Array.isArray(data.result) ? data.result : [];
  const items: SearchItem[] = [];
  for (const raw of rawItems) {
    if (!isRecord(raw)) continue;
    if (type === "video") {
      const item = mapSearchVideo(raw);
      if (item) items.push(item);
    } else {
      const item = mapSearchUser(raw);
      if (item) items.push(item);
    }
  }
  const total = typeof data.numResults === "number" ? data.numResults : items.length;
  const numPages =
    typeof data.numPages === "number" ? data.numPages : typeof data.pages === "number" ? data.pages : null;
  const hasMore = numPages !== null ? page < numPages : page * SEARCH_PAGE_SIZE < total;
  return { items, page, total, hasMore };
}

async function searchWithWbi(req: SearchRequest, page: number): Promise<SearchResponse> {
  const keys = await getWbiKeys(req.cookie);
  const mixinKey = getMixinKey(keys.imgKey + keys.subKey);
  const signed = signWbiParams(buildSearchParams(req, page), mixinKey);
  const query = new URLSearchParams(signed).toString();
  const envelope = await fetchBiliJson<RawSearchData>(BILI_API.searchWbi + "?" + query, req.cookie);
  if (envelope.code !== 0 || !envelope.data) {
    throw new BiliApiError(envelope.message ?? envelope.msg ?? "搜索失败", { status: 502, code: "SEARCH_FAILED" });
  }
  return mapSearchResponse(envelope.data, req.type, page);
}

async function searchLegacy(req: SearchRequest, page: number): Promise<SearchResponse> {
  const searchType = req.type === "user" ? "bili_user" : "video";
  const search = new URLSearchParams({
    search_type: searchType,
    keyword: req.keyword,
    page: String(page),
    page_size: String(SEARCH_PAGE_SIZE),
  });
  if (req.type === "video") search.set("order", normalizeOrder("video", req.order));
  const envelope = await fetchBiliJson<RawSearchData>(BILI_API.search + "?" + search.toString(), req.cookie);
  if (envelope.code !== 0 || !envelope.data) {
    throw new BiliApiError(envelope.message ?? envelope.msg ?? "搜索失败", { status: 502, code: "SEARCH_FAILED" });
  }
  return mapSearchResponse(envelope.data, req.type, page);
}

/** 搜索：优先 WBI 签名接口，失败时降级到旧接口。 */
export async function search(req: SearchRequest): Promise<SearchResponse> {
  const page = Math.max(1, Math.trunc(req.page ?? 1));
  const normalized: SearchRequest = { ...req, page };
  try {
    return await searchWithWbi(normalized, page);
  } catch (primaryError) {
    console.warn("[bili] WBI 搜索失败，尝试降级旧接口:", errorMessage(primaryError));
    try {
      return await searchLegacy(normalized, page);
    } catch (fallbackError) {
      console.warn("[bili] 降级搜索同样失败:", errorMessage(fallbackError));
      throw primaryError instanceof BiliApiError
        ? primaryError
        : new BiliApiError("搜索失败：" + errorMessage(primaryError), { status: 502, code: "SEARCH_FAILED" });
    }
  }
}

/* ---------------------------------------------------------------- 搜索联想 */

interface RawSuggestData {
  code?: number;
  result?: { tag?: Array<{ value?: string; name?: string }> };
}

export async function getSuggest(term: string): Promise<string[]> {
  const url =
    BILI_API.suggest +
    "?term=" +
    encodeURIComponent(term) +
    "&main_ver=v1&highlight=&sug_type=";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    let response: Response;
    try {
      response = await fetch(url, {
        headers: buildBiliHeaders(),
        cache: "no-store",
        signal: controller.signal,
      });
    } catch (error) {
      if (isAbortError(error)) throw new BiliApiError("搜索联想请求超时", { status: 504, code: "SUGGEST_TIMEOUT" });
      throw new BiliApiError("搜索联想请求失败：" + errorMessage(error), { status: 502, code: "SUGGEST_FAILED" });
    }
    if (!response.ok) {
      throw new BiliApiError("搜索联想请求失败（HTTP " + response.status + "）", {
        status: 502,
        code: "SUGGEST_FAILED",
      });
    }
    let payload: RawSuggestData;
    try {
      payload = (await response.json()) as RawSuggestData;
    } catch {
      throw new BiliApiError("搜索联想返回了非 JSON 数据", { status: 502, code: "SUGGEST_FAILED" });
    }
    if (typeof payload.code === "number" && payload.code !== 0) {
      throw new BiliApiError("搜索联想接口返回错误码 " + payload.code, { status: 502, code: "SUGGEST_FAILED" });
    }
    const tags = payload.result?.tag ?? [];
    const items: string[] = [];
    const seen = new Set<string>();
    for (const tag of tags) {
      const value = (tag.value ?? tag.name ?? "").trim();
      if (!value || seen.has(value)) continue;
      seen.add(value);
      items.push(value);
    }
    return items.slice(0, 10);
  } finally {
    clearTimeout(timer);
  }
}

/* ---------------------------------------------------------------- 登录态 */

interface RawNavData {
  isLogin?: boolean;
  mid?: number;
  uname?: string;
  face?: string;
  vipStatus?: number;
}

/** 查询登录态；没有 cookie 时直接返回未登录，不发起请求。 */
export async function getNav(cookie: BiliCookie): Promise<NavResponse> {
  if (!cookie.SESSDATA) return { isLogin: false };
  const envelope = await fetchBiliJson<RawNavData>(BILI_API.nav, cookie);
  if (envelope.code !== 0 || !envelope.data?.isLogin) {
    return { isLogin: false };
  }
  const data = envelope.data;
  const user: BiliUser = {
    mid: numOr(data.mid, 0),
    name: strOr(data.uname, ""),
    face: normalizeImageUrl(data.face),
    isLogin: true,
    vipStatus: typeof data.vipStatus === "number" ? data.vipStatus : undefined,
  };
  return { isLogin: true, user };
}

interface RawQrGenerateData {
  url?: string;
  qrcode_key?: string;
}

export interface QrcodeInfo {
  key: string;
  url: string;
}

export async function generateQrcode(): Promise<QrcodeInfo> {
  const envelope = await fetchBiliJson<RawQrGenerateData>(BILI_API.qrGenerate);
  if (envelope.code !== 0 || !envelope.data?.url || !envelope.data.qrcode_key) {
    throw new BiliApiError(envelope.message ?? envelope.msg ?? "生成登录二维码失败", {
      status: 502,
      code: "QRCODE_FAILED",
    });
  }
  return { key: envelope.data.qrcode_key, url: envelope.data.url };
}

interface RawQrPollData {
  code?: number;
  message?: string;
  url?: string;
  refresh_token?: string;
  timestamp?: number;
}

export interface QrcodePollResult {
  status: LoginPollStatus;
  cookie?: BiliCookie;
  message?: string;
}

/**
 * 轮询二维码扫码状态（外层 code 表示接口状态，data.code 表示扫码状态）。
 *
 * 确认成功时：旧流程的 data.url 查询参数里直接带 SESSDATA 等 Cookie；新流程的 data.url
 * 只带 ticket，需要再访问 crossDomain 地址，从 Set-Cookie 响应头换取真正的登录态。
 * 这里同时捕获轮询响应自身的 Set-Cookie 与换票结果，避免手机端已确认但本地“拿不到登录态”。
 */
export async function pollQrcode(key: string): Promise<QrcodePollResult> {
  const { envelope, setCookies } = await fetchBiliJsonWithCookies<RawQrPollData>(
    BILI_API.qrPoll + "?qrcode_key=" + encodeURIComponent(key),
  );
  if (envelope.code !== 0 || !envelope.data) {
    throw new BiliApiError(envelope.message ?? envelope.msg ?? "查询二维码状态失败", {
      status: 502,
      code: "QRCODE_POLL_FAILED",
    });
  }
  const data = envelope.data;
  switch (data.code) {
    case 0: {
      let cookie = mergeLoginCookies(parseSetCookieHeaders(setCookies), parseCookieFromLoginUrl(data.url));
      if (!cookie.SESSDATA && data.url) {
        try {
          const exchanged = await exchangeLoginTicket(data.url, {
            headers: buildBiliHeaders(),
            timeoutMs: REQUEST_TIMEOUT_MS,
          });
          cookie = mergeLoginCookies(cookie, exchanged);
        } catch (error) {
          console.warn("[bili] 登录票据换取 Cookie 失败:", errorMessage(error));
        }
      }
      return { status: "confirmed", cookie, message: data.message };
    }
    case 86101:
      return { status: "waiting", message: data.message };
    case 86090:
      return { status: "scanned", message: data.message };
    case 86038:
      return { status: "expired", message: data.message };
    default:
      return { status: "waiting", message: data.message };
  }
}
