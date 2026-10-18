import type { Codec, DownloadTask, TaskStatus } from "@/lib/types";

import { readJsonFile, TASKS_FILE, writeJsonAtomic } from "./paths";

/**
 * data/tasks.json 任务持久化。
 * - 原子写（临时文件 + rename）
 * - 防抖写入（默认 300ms），减少进度更新时的磁盘压力
 * - 读取时做宽松规整，损坏的任务条目直接丢弃
 */

const VALID_STATUSES: ReadonlyArray<TaskStatus> = [
  "queued",
  "downloading",
  "merging",
  "completed",
  "error",
  "paused",
  "cancelled",
];
const VALID_CODECS: ReadonlyArray<Codec> = ["avc", "hevc", "av1"];
const VALID_FORMATS: ReadonlyArray<DownloadTask["format"]> = ["mp4", "m4a", "m4s", "mkv"];

interface StoreState {
  timer: ReturnType<typeof setTimeout> | null;
  pending: DownloadTask[] | null;
  writing: Promise<void>;
}

const globalScope = globalThis as unknown as { __bilidownTaskStore?: StoreState };
const state: StoreState = (globalScope.__bilidownTaskStore ??= {
  timer: null,
  pending: null,
  writing: Promise.resolve(),
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function num(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function nullableNum(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function str(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function nullableStr(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

/** 把磁盘上的任意条目规整成 DownloadTask；缺少关键字段的条目返回 null。 */
export function normalizeTask(raw: unknown): DownloadTask | null {
  if (!isRecord(raw)) return null;
  const id = typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : "";
  const bvid = typeof raw.bvid === "string" && raw.bvid.trim() ? raw.bvid.trim() : "";
  const cid = num(raw.cid, 0);
  if (!id || !bvid || cid <= 0) return null;

  const codec = VALID_CODECS.includes(raw.codec as Codec) ? (raw.codec as Codec) : "avc";
  const status = VALID_STATUSES.includes(raw.status as TaskStatus) ? (raw.status as TaskStatus) : "error";
  const format = VALID_FORMATS.includes(raw.format as DownloadTask["format"])
    ? (raw.format as DownloadTask["format"])
    : "mp4";
  const createdAt = num(raw.createdAt, Date.now());

  return {
    id,
    bvid,
    aid: num(raw.aid, 0),
    cid,
    page: Math.max(1, Math.trunc(num(raw.page, 1))),
    title: str(raw.title, bvid),
    partTitle: str(raw.partTitle, str(raw.title, bvid)),
    cover: str(raw.cover, ""),
    upName: str(raw.upName, ""),
    qn: num(raw.qn, 16),
    qualityName: str(raw.qualityName, ""),
    codec,
    format,
    status,
    progress: Math.min(100, Math.max(0, num(raw.progress, 0))),
    downloadedBytes: Math.max(0, num(raw.downloadedBytes, 0)),
    totalBytes: Math.max(0, num(raw.totalBytes, 0)),
    speed: Math.max(0, num(raw.speed, 0)),
    filePath: nullableStr(raw.filePath),
    fileName: nullableStr(raw.fileName),
    fileSize: raw.fileSize === null || raw.fileSize === undefined ? null : num(raw.fileSize, 0),
    error: nullableStr(raw.error),
    createdAt,
    updatedAt: num(raw.updatedAt, createdAt),
    startedAt: nullableNum(raw.startedAt),
    finishedAt: nullableNum(raw.finishedAt),
    sourceUrl: str(raw.sourceUrl, `https://www.bilibili.com/video/${bvid}`),
    audioOnly: raw.audioOnly === true,
    embedSubtitles: raw.embedSubtitles === true,
    subtitleCount: Math.max(0, Math.trunc(num(raw.subtitleCount, 0))),
  };
}

export async function loadTasksFromDisk(): Promise<DownloadTask[]> {
  const raw = await readJsonFile<unknown>(TASKS_FILE).catch((error: unknown) => {
    console.error("[store] 读取 tasks.json 失败:", error);
    return null;
  });
  let list: unknown[] = [];
  if (Array.isArray(raw)) list = raw;
  else if (isRecord(raw) && Array.isArray(raw.tasks)) list = raw.tasks;
  const tasks: DownloadTask[] = [];
  for (const item of list) {
    const task = normalizeTask(item);
    if (task) tasks.push(task);
  }
  return tasks;
}

async function writeSnapshot(tasks: DownloadTask[]): Promise<void> {
  const payload = { version: 1, tasks };
  state.writing = state.writing
    .then(() => writeJsonAtomic(TASKS_FILE, payload))
    .catch((error: unknown) => {
      console.error("[store] 写入 tasks.json 失败:", error);
    });
  await state.writing;
}

/** 防抖保存任务列表；管理器在进度更新时调用。 */
export function saveTasksDebounced(tasks: DownloadTask[], delayMs = 300): void {
  state.pending = tasks.map((task) => ({ ...task }));
  if (state.timer) clearTimeout(state.timer);
  state.timer = setTimeout(() => {
    state.timer = null;
    void flushTasks();
  }, delayMs);
}

/** 立即落盘（导出/关闭前可调用）。 */
export async function flushTasks(): Promise<void> {
  if (state.timer) {
    clearTimeout(state.timer);
    state.timer = null;
  }
  const pending = state.pending;
  state.pending = null;
  if (!pending) return;
  await writeSnapshot(pending);
}
