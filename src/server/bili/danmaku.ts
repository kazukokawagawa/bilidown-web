import type { BiliCookie } from "@/lib/types";

import { buildBiliHeaders } from "./client";

/**
 * B站弹幕：拉取弹幕 XML、容错解析、生成 ASS 字幕。
 * 弹幕属于可选增强，本模块只负责「取到并转换」；失败直接抛错，由调用方决定是否降级。
 */

/* ---------------------------------------------------------------- 常量 */

/** 主地址：官方弹幕 XML 接口（oid = cid） */
const PRIMARY_DANMAKU_URL = "https://api.bilibili.com/x/v1/dm/list.so?oid=";
/** 回退地址：comment.bilibili.com/{cid}.xml */
const FALLBACK_DANMAKU_URL = "https://comment.bilibili.com/";
/** 单次请求超时（毫秒），两个地址各自计时 */
const REQUEST_TIMEOUT_MS = 20 * 1000;

/** B站弹幕字号基准：p 属性里的 size 相对 25 缩放 */
const BASE_FONT_SIZE = 25;
/** B站默认弹幕颜色（白色） */
const DEFAULT_DANMAKU_COLOR = 0xffffff;

/* ---------------------------------------------------------------- 类型 */

/** 解析后的单条弹幕。 */
export interface DanmakuEntry {
  /** 出现时间（秒，视频内偏移） */
  time: number;
  /** 弹幕模式：1-3 滚动、4 底部、5 顶部、6 逆向；7/8/9 已在解析时过滤 */
  mode: number;
  /** 原始字号（B站以 25 为基准） */
  size: number;
  /** 十进制 RGB 颜色，如 16777215 表示白色 */
  color: number;
  /** 纯文本内容（已反转义、去标签、去控制字符） */
  text: string;
}

/** 拉取结果：解析后的弹幕列表 + 原始 XML（调用方可原样保存到「弹幕」目录）。 */
export interface DanmakuFetchResult {
  entries: DanmakuEntry[];
  /** 接口返回的原始弹幕 XML */
  xml: string;
}

export interface FetchDanmakuOptions {
  /** 视频分P 的 cid（即弹幕接口的 oid） */
  cid: number;
  cookie?: BiliCookie;
  /** 任务取消/暂停信号，取消后立即中断请求 */
  signal?: AbortSignal;
}

export interface DanmakuAssOptions {
  /** ASS 画布宽度（PlayResX），默认 1920 */
  width?: number;
  /** ASS 画布高度（PlayResY），默认 1080 */
  height?: number;
  /** 基准字号，默认 40（与设置项 danmakuFontSize 默认值一致） */
  fontSize?: number;
  /** 不透明度 0~1，默认 0.8（与设置项 danmakuOpacity 默认值一致） */
  opacity?: number;
  /** 滚动弹幕穿过屏幕的时长（秒），默认 8 */
  scrollDuration?: number;
  /** 顶部/底部弹幕的停留时长（秒），默认 5 */
  staticDuration?: number;
  /** 视频时长（秒）；传入后丢弃超出时长的弹幕，并把事件结束时间 clamp 到时长，避免拉长 MKV 容器时长 */
  duration?: number;
}

/* ---------------------------------------------------------------- 工具函数 */

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return "未知错误";
}

interface AbortScope {
  signal: AbortSignal;
  cleanup: () => void;
}

/**
 * 合并外部取消信号与 20s 超时。
 * 外部 signal 已取消时立即 abort；调用方必须在 finally 中 cleanup，避免定时器/监听器泄漏。
 */
function createAbortScope(signal: AbortSignal | undefined): AbortScope {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    },
  };
}

/* ---------------------------------------------------------------- 拉取弹幕 */

/** 响应体必须含弹幕标签才算有效；空体 / 风控页 / 错误页一律视为失败。 */
function isDanmakuXml(xml: string): boolean {
  return xml.includes("<d ") || xml.includes("<i>");
}

/** 拉取单个地址；HTTP 错误或内容无效都抛错，便于上层回退到下一个地址。 */
async function fetchDanmakuXml(
  url: string,
  cookie: BiliCookie | undefined,
  signal: AbortSignal | undefined,
): Promise<string> {
  const scope = createAbortScope(signal);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { ...buildBiliHeaders(cookie), Accept: "application/xml,text/xml,*/*" },
      cache: "no-store",
      redirect: "follow",
      signal: scope.signal,
    });
    if (!response.ok) throw new Error("HTTP " + response.status);
    // Node 的 fetch 会自动解压 gzip，这里不要手动设置 Accept-Encoding
    const xml = await response.text();
    if (!isDanmakuXml(xml)) throw new Error("返回内容不是弹幕 XML（可能被风控拦截）");
    return xml;
  } finally {
    scope.cleanup();
  }
}

/**
 * 拉取视频弹幕：优先官方接口，失败后回退 comment.bilibili.com。
 * 两个地址都失败时抛错；外部 signal 取消时立即抛错，不再尝试回退地址。
 */
export async function fetchVideoDanmaku(options: FetchDanmakuOptions): Promise<DanmakuFetchResult> {
  const { cid, cookie, signal } = options;
  if (!Number.isInteger(cid) || cid <= 0) throw new Error("cid 无效，无法获取弹幕");
  if (signal?.aborted) throw new Error("弹幕请求已取消");

  const urls = [PRIMARY_DANMAKU_URL + cid, FALLBACK_DANMAKU_URL + cid + ".xml"];
  const failures: string[] = [];
  for (const url of urls) {
    try {
      const xml = await fetchDanmakuXml(url, cookie, signal);
      return { entries: parseDanmakuXml(xml), xml };
    } catch (error) {
      // 外部取消属于流程中断，必须原样抛出，不能吞掉后继续请求回退地址
      if (signal?.aborted) throw error instanceof Error ? error : new Error("弹幕请求已取消");
      failures.push(errorMessage(error));
    }
  }
  throw new Error("获取视频弹幕失败：" + failures.join("；"));
}

/* ---------------------------------------------------------------- XML 解析 */

/** 逐条匹配 <d p="...">文本</d>；text 可能包含换行，所以用 [\s\S]*? 容错匹配。 */
const DANMAKU_ITEM_PATTERN = /<d\s+p="([^"]*)"[^>]*>([\s\S]*?)<\/d>/g;
/** B站 XML 里的实体：命名实体 + 十进制数字实体 + 十六进制数字实体。 */
const XML_ENTITY_PATTERN = /&(?:#(\d+)|#x([0-9a-fA-F]+)|(amp|lt|gt|quot|apos));/g;
const NAMED_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
/** HTML 标签（如 <br>）：ASS 无法渲染，统一替换成空格。 */
const HTML_TAG_PATTERN = /<[^>]*>/g;
/** 控制字符（换行/制表符已提前转空格，这里清除剩余不可见字符）。 */
const CONTROL_CHAR_PATTERN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

/** 反转义 XML 实体：&amp; &lt; &gt; &quot; &apos; &#NN; &#xHH;。 */
function decodeXmlEntities(text: string): string {
  return text.replace(
    XML_ENTITY_PATTERN,
    (match: string, decimal: string | undefined, hex: string | undefined, named: string | undefined): string => {
      if (named) return NAMED_ENTITIES[named] ?? match;
      const code = decimal ? Number.parseInt(decimal, 10) : Number.parseInt(hex ?? "", 16);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return match;
      return String.fromCodePoint(code);
    },
  );
}

/** 清洗弹幕文本：反转义 -> 去标签 -> 去控制字符 -> trim。 */
function normalizeDanmakuText(raw: string): string {
  return decodeXmlEntities(raw)
    .replace(HTML_TAG_PATTERN, " ")
    .replace(/[\r\n\t]+/g, " ")
    .replace(CONTROL_CHAR_PATTERN, "")
    .trim();
}

/** 解析 p 属性（time,mode,size,color,...，其余字段忽略）；非法时返回 null。 */
function parseDanmakuEntry(params: string, rawText: string): DanmakuEntry | null {
  const parts = params.split(",");
  const time = Number.parseFloat(parts[0] ?? "");
  if (!Number.isFinite(time) || time < 0) return null;
  const mode = Number.parseInt(parts[1] ?? "", 10);
  // 只保留 1-6：1-3 滚动 / 4 底部 / 5 顶部 / 6 逆向；7 高级、8 代码、9 BAS 无法用普通 ASS 文本还原
  if (!Number.isInteger(mode) || mode < 1 || mode > 6) return null;
  const size = Number.parseInt(parts[2] ?? "", 10);
  const color = Number.parseInt(parts[3] ?? "", 10);
  const text = normalizeDanmakuText(rawText);
  if (!text) return null;
  return {
    time,
    mode,
    size: Number.isFinite(size) && size > 0 ? size : BASE_FONT_SIZE,
    color: Number.isFinite(color) && color >= 0 && color <= 0xffffff ? color : DEFAULT_DANMAKU_COLOR,
    text,
  };
}

/**
 * 容错解析弹幕 XML（只关心 <d p="...">text</d>，忽略 <i> 等外层标签）。
 * 跳过非法时间、空文本与 7/8/9 模式；全量保留不截断，按时间升序稳定排序。
 */
export function parseDanmakuXml(xml: string): DanmakuEntry[] {
  const entries: DanmakuEntry[] = [];
  for (const match of xml.matchAll(DANMAKU_ITEM_PATTERN)) {
    const entry = parseDanmakuEntry(match[1] ?? "", match[2] ?? "");
    if (entry) entries.push(entry);
  }
  // Node 的 Array.prototype.sort 是稳定排序：相同时间点保持 XML 原始顺序
  entries.sort((a, b) => a.time - b.time);
  return entries;
}

/* ---------------------------------------------------------------- ASS 生成 */

/** ASS 画布默认尺寸（1080P） */
const ASS_PLAY_RES_WIDTH = 1920;
const ASS_PLAY_RES_HEIGHT = 1080;
/** 默认字号 / 不透明度，与设置项默认值保持一致 */
const ASS_DEFAULT_FONT_SIZE = 40;
const ASS_DEFAULT_OPACITY = 0.8;
/** 默认滚动时长（秒）与固定弹幕停留时长（秒） */
const ASS_DEFAULT_SCROLL_DURATION = 8;
const ASS_DEFAULT_STATIC_DURATION = 5;
/** 轨道上下留白（像素），轨道数 = floor((height - 2 * 20) / laneHeight) */
const ASS_LANE_MARGIN = 20;
/** 轨道高度 = 字号 * 1.35 */
const ASS_LANE_HEIGHT_RATIO = 1.35;

interface ResolvedDanmakuAssOptions {
  width: number;
  height: number;
  fontSize: number;
  opacity: number;
  scrollDuration: number;
  staticDuration: number;
  /** 视频时长（秒），0 表示未知（不裁剪） */
  duration: number;
}

function positiveNumber(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function resolveAssOptions(options: DanmakuAssOptions): ResolvedDanmakuAssOptions {
  const opacity =
    typeof options.opacity === "number" && Number.isFinite(options.opacity) ? options.opacity : ASS_DEFAULT_OPACITY;
  return {
    width: positiveNumber(options.width, ASS_PLAY_RES_WIDTH),
    height: positiveNumber(options.height, ASS_PLAY_RES_HEIGHT),
    fontSize: positiveNumber(options.fontSize, ASS_DEFAULT_FONT_SIZE),
    opacity: clamp(opacity, 0, 1),
    scrollDuration: positiveNumber(options.scrollDuration, ASS_DEFAULT_SCROLL_DURATION),
    staticDuration: positiveNumber(options.staticDuration, ASS_DEFAULT_STATIC_DURATION),
    duration:
      typeof options.duration === "number" && Number.isFinite(options.duration) && options.duration > 0
        ? options.duration
        : 0,
  };
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/** 数字 -> 两位大写十六进制（用于 ASS 的透明度和颜色分量）。 */
function toHex2(value: number): string {
  return clamp(Math.round(value), 0, 255).toString(16).toUpperCase().padStart(2, "0");
}

/** 坐标/字号格式化：最多保留两位小数，去掉多余的 .0。 */
function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return String(Math.round(value * 100) / 100);
}

/** 秒 -> ASS 时间 H:MM:SS.cc。 */
function formatAssTime(seconds: number): string {
  const totalCentis = Math.max(0, Math.round((Number.isFinite(seconds) ? seconds : 0) * 100));
  const hours = Math.floor(totalCentis / 360_000);
  const minutes = Math.floor((totalCentis % 360_000) / 6_000);
  const secs = Math.floor((totalCentis % 6_000) / 100);
  const centis = totalCentis % 100;
  return hours + ":" + pad2(minutes) + ":" + pad2(secs) + "." + pad2(centis);
}

/** 十进制 RGB -> ASS 的 &HBBGGRR&（ASS 颜色是 BGR 顺序）。 */
function toAssColor(color: number): string {
  const value = Number.isInteger(color) && color >= 0 && color <= 0xffffff ? color : DEFAULT_DANMAKU_COLOR;
  const red = (value >> 16) & 0xff;
  const green = (value >> 8) & 0xff;
  const blue = value & 0xff;
  return "&H" + toHex2(blue) + toHex2(green) + toHex2(red) + "&";
}

/** ASS 事件文本转义：换行转空格；花括号/反斜杠会破坏覆盖标签，换成全角字符。 */
function escapeAssText(text: string): string {
  return text
    .replace(/[\r\n]+/g, " ")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\{/g, "｛")
    .replace(/\}/g, "｝")
    .replace(/\\/g, "＼")
    .trim();
}

/** 估算文本宽度（像素）：CJK 记 1 个字宽，ASCII 记 0.55，其余 0.9。 */
function estimateTextWidth(text: string, fontSize: number): number {
  let units = 0;
  for (const char of text) units += charWidthUnits(char.codePointAt(0) ?? 0);
  return Math.max(fontSize, Math.ceil(units * fontSize));
}

function charWidthUnits(codePoint: number): number {
  if (codePoint < 0x80) return 0.55;
  if (isCjkCodePoint(codePoint)) return 1;
  return 0.9;
}

/** 常见 CJK 区段（汉字/假名/谚文/全角标点），用于估算弹幕宽度。 */
function isCjkCodePoint(codePoint: number): boolean {
  return (
    (codePoint >= 0x1100 && codePoint <= 0x11ff) || // 谚文字母
    (codePoint >= 0x2e80 && codePoint <= 0x303f) || // CJK 部首/标点
    (codePoint >= 0x3040 && codePoint <= 0x33ff) || // 假名/注音/韩文兼容/CJK 兼容
    (codePoint >= 0x3400 && codePoint <= 0x4dbf) || // CJK 扩展 A
    (codePoint >= 0x4e00 && codePoint <= 0x9fff) || // CJK 基本区
    (codePoint >= 0xa000 && codePoint <= 0xa4cf) || // 彝文
    (codePoint >= 0xac00 && codePoint <= 0xd7af) || // 韩文音节
    (codePoint >= 0xf900 && codePoint <= 0xfaff) || // CJK 兼容表意文字
    (codePoint >= 0xfe30 && codePoint <= 0xfe4f) || // CJK 兼容形式
    (codePoint >= 0xff00 && codePoint <= 0xff60) || // 全角 ASCII
    (codePoint >= 0xffe0 && codePoint <= 0xffe6) || // 全角符号
    (codePoint >= 0x20000 && codePoint <= 0x3ffff) // CJK 扩展 B 及以后
  );
}

/** 实际字号 = 全局字号 * 弹幕字号 / 25（B站以 25 为基准）。 */
function resolveActualFontSize(fontSize: number, size: number): number {
  if (!Number.isFinite(size) || size <= 0) return fontSize;
  const scaled = Math.round((fontSize * size) / BASE_FONT_SIZE);
  return scaled > 0 ? scaled : fontSize;
}

/** ASS 文件头：Script Info + V4+ Styles + Events 的 Format（空弹幕时也是合法 ASS）。 */
function buildAssHeader(options: ResolvedDanmakuAssOptions): string {
  const alpha = toHex2((1 - options.opacity) * 255);
  return [
    "[Script Info]",
    "ScriptType: v4.00+",
    "PlayResX: " + formatNumber(options.width),
    "PlayResY: " + formatNumber(options.height),
    "WrapStyle: 2",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    "Style: Danmaku,Microsoft YaHei," +
      formatNumber(options.fontSize) +
      ",&H" +
      alpha +
      "FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,1.5,0,7,0,0,0,1",
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ].join("\n");
}

interface PreparedDanmaku {
  /** 开始时间（秒） */
  start: number;
  /** 弹幕模式（1-6） */
  mode: number;
  /** 实际字号（已按 size 缩放） */
  fontSize: number;
  /** ASS 颜色，形如 &HBBGGRR& */
  color: string;
  /** 估算宽度（像素，用于滚动时长与轨道避让） */
  width: number;
  /** 已转义的文本 */
  text: string;
}

/** 滚动轨道上一条弹幕的入场时间与宽度。 */
interface ScrollLaneState {
  start: number;
  width: number;
}

/** 把弹幕整理成可排布的事件：过滤无效项、转义文本、计算实际字号与估算宽度。 */
function prepareDanmaku(entries: readonly DanmakuEntry[], fontSize: number): PreparedDanmaku[] {
  const prepared: PreparedDanmaku[] = [];
  for (const entry of entries) {
    if (!Number.isFinite(entry.time) || entry.time < 0) continue;
    // 7 高级 / 8 代码 / 9 BAS 弹幕无法用 ASS 文本还原
    if (entry.mode === 7 || entry.mode === 8 || entry.mode === 9) continue;
    const text = escapeAssText(entry.text);
    if (!text) continue;
    prepared.push({
      start: entry.time,
      mode: entry.mode,
      fontSize: resolveActualFontSize(fontSize, entry.size),
      color: toAssColor(entry.color),
      width: estimateTextWidth(text, fontSize),
      text,
    });
  }
  // 稳定排序：同一时间点保持传入顺序
  prepared.sort((a, b) => a.start - b.start);
  return prepared;
}

/** 时间差是否足够让前后两条滚动弹幕不重叠。 */
function isScrollLaneFree(
  last: ScrollLaneState,
  start: number,
  width: number,
  screenWidth: number,
  duration: number,
): boolean {
  const elapsed = start - last.start;
  const lastGap = (last.width * duration) / (screenWidth + last.width);
  const currentGap = (width * duration) / (screenWidth + width);
  return elapsed >= Math.max(lastGap, currentGap);
}

/** 为滚动弹幕选轨：优先第一条空闲轨道，全部占用时选最早入场（最快让出）的轨道。 */
function pickScrollLane(
  lanes: Array<ScrollLaneState | null>,
  start: number,
  width: number,
  screenWidth: number,
  duration: number,
): number {
  for (let lane = 0; lane < lanes.length; lane += 1) {
    const last = lanes[lane];
    if (!last) return lane;
    if (isScrollLaneFree(last, start, width, screenWidth, duration)) return lane;
  }
  let bestLane = 0;
  let earliest = Number.POSITIVE_INFINITY;
  for (let lane = 0; lane < lanes.length; lane += 1) {
    const last = lanes[lane];
    if (!last) return lane;
    if (last.start < earliest) {
      earliest = last.start;
      bestLane = lane;
    }
  }
  return bestLane;
}

/** 为顶部/底部弹幕选轨：返回第一条已结束的轨道，全部占用时选最早结束的轨道。 */
function pickFixedLane(laneEnds: number[], start: number): number {
  for (let lane = 0; lane < laneEnds.length; lane += 1) {
    if (start >= laneEnds[lane]) return lane;
  }
  let bestLane = 0;
  let earliestEnd = Number.POSITIVE_INFINITY;
  for (let lane = 0; lane < laneEnds.length; lane += 1) {
    if (laneEnds[lane] < earliestEnd) {
      earliestEnd = laneEnds[lane];
      bestLane = lane;
    }
  }
  return bestLane;
}

/** 生成一行 Dialogue 事件。 */
function buildDialogueLine(start: number, end: number, text: string): string {
  return "Dialogue: 0," + formatAssTime(start) + "," + formatAssTime(end) + ",Danmaku,,0,0,0,," + text;
}

/**
 * 把解析后的弹幕转换为标准 ASS v4+（默认 1920x1080 / Microsoft YaHei）。
 * - 滚动弹幕（mode 1/2/3/6）按轨道避让，从右向左匀速移动；
 * - 顶部（mode 5）/底部（mode 4）弹幕各自从一侧排布，停留 staticDuration 秒；
 * - 无可输出弹幕时返回只含头部与样式的合法空 ASS，事件按开始时间升序输出。
 */
export function buildDanmakuAss(entries: readonly DanmakuEntry[], options: DanmakuAssOptions = {}): string {
  const resolved = resolveAssOptions(options);
  const header = buildAssHeader(resolved);
  const prepared = prepareDanmaku(entries, resolved.fontSize);
  if (prepared.length === 0) return header + "\n";

  const laneHeight = resolved.fontSize * ASS_LANE_HEIGHT_RATIO;
  const laneCount = Math.max(1, Math.floor((resolved.height - ASS_LANE_MARGIN * 2) / laneHeight));
  const scrollLanes: Array<ScrollLaneState | null> = new Array<ScrollLaneState | null>(laneCount).fill(null);
  const topLaneEnds: number[] = new Array<number>(laneCount).fill(Number.NEGATIVE_INFINITY);
  const bottomLaneEnds: number[] = new Array<number>(laneCount).fill(Number.NEGATIVE_INFINITY);

  const dialogues: string[] = [];
  for (const item of prepared) {
    const start = item.start;
    // 超过视频时长的弹幕不输出；结束时间 clamp 到视频时长（否则 MKV 容器时长会被字幕轨拉长）
    if (resolved.duration > 0 && start >= resolved.duration) continue;
    const clipEnd = (plannedEnd: number): number =>
      resolved.duration > 0 ? Math.min(plannedEnd, resolved.duration) : plannedEnd;
    if (item.mode === 5) {
      // 顶部弹幕：an8 让 pos 坐标定位在文本顶部中心
      const lane = pickFixedLane(topLaneEnds, start);
      const y = ASS_LANE_MARGIN + lane * laneHeight;
      const end = clipEnd(start + resolved.staticDuration);
      topLaneEnds[lane] = end;
      const text =
        "{\\an8\\pos(" +
        formatNumber(resolved.width / 2) +
        "," +
        formatNumber(y) +
        ")\\fs" +
        item.fontSize +
        "\\c" +
        item.color +
        "}" +
        item.text;
      dialogues.push(buildDialogueLine(start, end, text));
    } else if (item.mode === 4) {
      // 底部弹幕：an2 让 pos 坐标定位在文本底部中心，lane 从最底部向上排
      const lane = pickFixedLane(bottomLaneEnds, start);
      const y = resolved.height - ASS_LANE_MARGIN - lane * laneHeight;
      const end = clipEnd(start + resolved.staticDuration);
      bottomLaneEnds[lane] = end;
      const text =
        "{\\an2\\pos(" +
        formatNumber(resolved.width / 2) +
        "," +
        formatNumber(y) +
        ")\\fs" +
        item.fontSize +
        "\\c" +
        item.color +
        "}" +
        item.text;
      dialogues.push(buildDialogueLine(start, end, text));
    } else {
      // mode 1/2/3/6 统一按滚动处理（同一 ASS 事件无法再区分逆向/低速）
      const lane = pickScrollLane(scrollLanes, start, item.width, resolved.width, resolved.scrollDuration);
      scrollLanes[lane] = { start, width: item.width };
      const y = ASS_LANE_MARGIN + lane * laneHeight;
      const end = clipEnd(start + resolved.scrollDuration);
      const text =
        "{\\move(" +
        formatNumber(resolved.width) +
        "," +
        formatNumber(y) +
        "," +
        formatNumber(-item.width) +
        "," +
        formatNumber(y) +
        ")\\fs" +
        item.fontSize +
        "\\c" +
        item.color +
        "}" +
        item.text;
      dialogues.push(buildDialogueLine(start, end, text));
    }
  }
  return [header, ...dialogues].join("\n") + "\n";
}
