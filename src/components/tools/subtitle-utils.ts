/** CC 字幕 JSON → SRT / SRT → 纯文本 的纯函数工具（与桌面版行为一致）。 */

export const MAX_SUBTITLE_FILE_SIZE = 50 * 1024 * 1024;

export interface CcCue {
  from: number;
  to: number;
  content: string;
}

export interface PlainTextResult {
  /** 每行保留换行 */
  withNewlines: string;
  /** 所有行直接相连 */
  withoutNewlines: string;
  lineCount: number;
}

function pad(value: number, length = 2): string {
  return String(value).padStart(length, "0");
}

/** 秒 → HH:MM:SS,mmm（与桌面版 ga() 一致：向下取整毫秒） */
export function formatSrtTimestamp(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = Math.floor(safe % 60);
  const ms = Math.floor((safe % 1) * 1000);
  return pad(hours) + ":" + pad(minutes) + ":" + pad(secs) + "," + pad(ms, 3);
}

export function stripFileExtension(fileName: string): string {
  const index = fileName.lastIndexOf(".");
  return index > 0 ? fileName.slice(0, index) : fileName;
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") return Number(value);
  return Number.NaN;
}

/** 解析 B 站 CC 字幕 JSON，要求顶层包含 body 数组 */
export function parseCcJson(text: string): CcCue[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("JSON 解析失败，请确认文件是合法的 CC 字幕 JSON");
  }

  if (!data || typeof data !== "object") throw new Error("JSON 格式有误：缺少 body 数组");
  const body = (data as { body?: unknown }).body;
  if (!Array.isArray(body)) throw new Error("JSON 格式有误：缺少 body 数组");

  const cues: CcCue[] = [];
  for (const item of body) {
    if (!item || typeof item !== "object") continue;
    const record = item as { from?: unknown; to?: unknown; content?: unknown };
    const from = toNumber(record.from);
    const to = toNumber(record.to);
    if (!Number.isFinite(from) || !Number.isFinite(to)) continue;
    cues.push({
      from,
      to,
      content: typeof record.content === "string" ? record.content : "",
    });
  }

  if (cues.length === 0) {
    throw new Error("body 中没有任何有效字幕条目（每条需包含 from / to / content）");
  }
  return cues;
}

/** CC 字幕条目 → 标准 SRT 文本（CRLF，与桌面版输出一致） */
export function cuesToSrt(cues: CcCue[]): string {
  let output = "";
  for (let index = 0; index < cues.length; index += 1) {
    const cue = cues[index];
    output += index + 1 + "\r\n";
    output += formatSrtTimestamp(cue.from) + " --> " + formatSrtTimestamp(cue.to) + "\r\n";
    output += cue.content + "\r\n\r\n";
  }
  return output;
}

/** SRT → 纯文本：过滤纯数字序号行与含 --> 的时间轴行 */
export function srtToPlainText(text: string): PlainTextResult {
  const lines = text.split(/\r\n|\r|\n/);
  let withNewlines = "";
  let withoutNewlines = "";
  let lineCount = 0;

  for (const rawLine of lines) {
    if (!rawLine) continue;
    if (!Number.isNaN(Number(rawLine))) continue;
    if (rawLine.includes("-->")) continue;
    withNewlines += rawLine + "\n";
    withoutNewlines += rawLine;
    lineCount += 1;
  }

  return { withNewlines, withoutNewlines, lineCount };
}

/** 通过 Blob + a[download] 触发浏览器下载 */
export function downloadTextFile(
  fileName: string,
  content: string,
  mimeType = "text/plain;charset=utf-8",
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
