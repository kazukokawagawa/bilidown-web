import type { BiliCookie, SubtitleTrack } from "@/lib/types";

import { buildBiliHeaders } from "./client";
import { buildWbiQuery, getMixinKey, getWbiKeys } from "./wbi";

/**
 * B站 CC 字幕：列表（/x/player/wbi/v2）、下载字幕 JSON、转 SRT。
 * 字幕属于可选增强，任何失败都由调用方降级为「不内嵌」，因此这里只抛「下载单条字幕」的错误。
 */

const SUBTITLE_API = "https://api.bilibili.com/x/player/wbi/v2";
const SUBTITLE_LIST_TIMEOUT_MS = 12 * 1000;
const SUBTITLE_FILE_TIMEOUT_MS = 15 * 1000;

export interface SubtitleCue {
  /** 起始时间（毫秒） */
  from: number;
  /** 结束时间（毫秒） */
  to: number;
  content: string;
}

export interface GetVideoSubtitlesOptions {
  aid: number;
  cid: number;
  cookie?: BiliCookie;
  /** 任务取消/暂停信号；传入后取消会立即中断请求 */
  signal?: AbortSignal;
}

interface RawSubtitleEntry {
  lan?: unknown;
  lan_doc?: unknown;
  subtitle_url?: unknown;
  ai_type?: unknown;
  type?: unknown;
}

interface RawPlayerV2Data {
  subtitle?: {
    subtitles?: RawSubtitleEntry[] | null;
  } | null;
}

interface RawSubtitleBody {
  body?: unknown;
}

interface BiliEnvelope<T> {
  code?: number;
  message?: string;
  msg?: string;
  data?: T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return "未知错误";
}

/** 把 // 开头 / http:// 的字幕地址统一为 https。 */
function normalizeSubtitleUrl(url: unknown): string {
  if (typeof url !== "string") return "";
  const value = url.trim();
  if (!value) return "";
  if (value.startsWith("//")) return "https:" + value;
  if (value.startsWith("http://")) return "https://" + value.slice("http://".length);
  return value;
}

/** lan 以 ai- 开头或 ai_type > 0 视为 AI 生成字幕。 */
function isAiSubtitle(lan: string, aiType: unknown): boolean {
  if (lan.toLowerCase().startsWith("ai-")) return true;
  return typeof aiType === "number" && Number.isFinite(aiType) && aiType > 0;
}

/** 排序权重：人工中文 < 人工其他 < AI 中文 < AI 其他。 */
function subtitleRank(track: SubtitleTrack): number {
  const lang = track.lang.toLowerCase();
  const chinese = lang.startsWith("zh") || lang.startsWith("ai-zh");
  return (track.ai ? 2 : 0) + (chinese ? 0 : 1);
}

/** 合并请求信号与超时，保证取消请求能立即生效。 */
function createAbortScope(
  signal: AbortSignal | undefined,
  timeoutMs: number,
): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", onAbort, { once: true });
  }
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    },
  };
}

function parseSubtitleTracks(rawList: RawSubtitleEntry[]): SubtitleTrack[] {
  // 同语言只保留一条：优先人工字幕
  const byLang = new Map<string, SubtitleTrack>();
  for (const item of rawList) {
    if (!isRecord(item)) continue;
    const lan = typeof item.lan === "string" ? item.lan.trim() : "";
    const url = normalizeSubtitleUrl(item.subtitle_url);
    if (!lan || !url) continue;
    const label = typeof item.lan_doc === "string" && item.lan_doc.trim() ? item.lan_doc.trim() : lan;
    const track: SubtitleTrack = { lang: lan, label, url, ai: isAiSubtitle(lan, item.ai_type) };
    const existing = byLang.get(lan);
    if (!existing || (existing.ai && !track.ai)) byLang.set(lan, track);
  }
  return [...byLang.values()].sort((a, b) => subtitleRank(a) - subtitleRank(b));
}

/**
 * 拉取视频字幕轨道列表。
 * 任何失败都返回空数组并 console.warn（不影响下载主流程）；但任务被取消时抛错，避免吞掉 pause/cancel。
 */
export async function getVideoSubtitles(options: GetVideoSubtitlesOptions): Promise<SubtitleTrack[]> {
  try {
    const keys = await getWbiKeys(options.cookie);
    const mixinKey = getMixinKey(keys.imgKey + keys.subKey);
    const query = buildWbiQuery({ aid: options.aid, cid: options.cid }, mixinKey);
    const scope = createAbortScope(options.signal, SUBTITLE_LIST_TIMEOUT_MS);
    try {
      const response = await fetch(SUBTITLE_API + "?" + query, {
        method: "GET",
        headers: buildBiliHeaders(options.cookie),
        cache: "no-store",
        redirect: "follow",
        signal: scope.signal,
      });
      if (!response.ok) throw new Error("HTTP " + response.status);
      const payload = (await response.json()) as BiliEnvelope<RawPlayerV2Data>;
      if (payload.code !== 0) {
        throw new Error(payload.message ?? payload.msg ?? "接口返回错误码 " + String(payload.code));
      }
      const rawList = payload.data?.subtitle?.subtitles;
      if (!Array.isArray(rawList)) return [];
      return parseSubtitleTracks(rawList);
    } finally {
      scope.cleanup();
    }
  } catch (error) {
    if (options.signal?.aborted) throw error;
    console.warn("[subtitles] 获取视频字幕列表失败:", errorMessage(error));
    return [];
  }
}

/** B站字幕 JSON 的时间单位是秒（浮点），统一换算为毫秒。 */
function secondsToMillis(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value * 1000) : 0;
}

function parseSubtitleCues(raw: unknown): SubtitleCue[] {
  if (!isRecord(raw)) throw new Error("字幕数据不是 JSON 对象");
  const body = (raw as RawSubtitleBody).body;
  if (!Array.isArray(body)) throw new Error("字幕数据缺少 body 数组");
  const cues: SubtitleCue[] = [];
  for (const item of body) {
    if (!isRecord(item)) continue;
    const content = typeof item.content === "string" ? item.content : "";
    cues.push({ from: secondsToMillis(item.from), to: secondsToMillis(item.to), content });
  }
  return cues;
}

/** 下载单条字幕 JSON，并校验 body 数组。失败抛错，由调用方决定跳过该轨道。 */
export async function downloadSubtitleCues(
  track: SubtitleTrack,
  cookie?: BiliCookie,
  signal?: AbortSignal,
): Promise<SubtitleCue[]> {
  if (!track.url) throw new Error("字幕地址为空");
  const scope = createAbortScope(signal, SUBTITLE_FILE_TIMEOUT_MS);
  try {
    const response = await fetch(track.url, {
      method: "GET",
      headers: buildBiliHeaders(cookie),
      cache: "no-store",
      redirect: "follow",
      signal: scope.signal,
    });
    if (!response.ok) throw new Error("HTTP " + response.status);
    const payload = (await response.json()) as unknown;
    return parseSubtitleCues(payload);
  } finally {
    scope.cleanup();
  }
}

function pad(value: number, length: number): string {
  return String(value).padStart(length, "0");
}

/** 毫秒时间戳 -> SRT 的 HH:MM:SS,mmm。 */
function formatSrtTimestamp(milliseconds: number): string {
  const total = Math.max(0, Math.round(milliseconds));
  const hours = Math.floor(total / 3_600_000);
  const minutes = Math.floor((total % 3_600_000) / 60_000);
  const seconds = Math.floor((total % 60_000) / 1000);
  const millis = total % 1000;
  return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(seconds, 2)},${pad(millis, 3)}`;
}

/** 字幕 cue -> 标准 SRT（UTF-8，CRLF，空内容跳过，to<=from 时补 2ms）。 */
export function cuesToSrt(cues: readonly SubtitleCue[]): string {
  const blocks: string[] = [];
  let index = 0;
  for (const cue of cues) {
    const content = cue.content.replace(/\r\n?/g, "\n").replace(/\n/g, "\r\n").trim();
    if (!content) continue;
    const from = Number.isFinite(cue.from) ? Math.max(0, cue.from) : 0;
    let to = Number.isFinite(cue.to) ? cue.to : 0;
    if (to <= from) to = from + 2;
    index += 1;
    blocks.push(`${index}\r\n${formatSrtTimestamp(from)} --> ${formatSrtTimestamp(to)}\r\n${content}\r\n`);
  }
  return blocks.join("\r\n");
}

/** B站 lan -> ISO 639-2 语言码（用于 MKV 字幕轨道 language 元数据）。 */
export function subtitleLanguageCode(lan: string): string {
  const value = (lan ?? "").trim().toLowerCase();
  if (!value) return "und";
  if (value.startsWith("ai-")) return subtitleLanguageCode(value.slice("ai-".length));
  if (value.startsWith("zh")) return "chi";
  if (value.startsWith("en")) return "eng";
  if (value.startsWith("ja")) return "jpn";
  return "und";
}
