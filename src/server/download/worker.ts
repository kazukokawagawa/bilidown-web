import fs from "node:fs/promises";
import path from "node:path";
import type { FileHandle } from "node:fs/promises";

import { DANMAKU_FOLDER_NAME } from "@/lib/constants";
import type { Codec, DownloadTask, StreamSource, VideoInfo } from "@/lib/types";

import { buildBiliHeaders, getPlayStreams, getVideoInfo } from "../bili/client";
import { buildDanmakuAss, fetchVideoDanmaku, type DanmakuFetchResult } from "../bili/danmaku";
import { cuesToSrt, downloadSubtitleCues, getVideoSubtitles, subtitleLanguageCode } from "../bili/subtitles";
import {
  detectFfmpeg,
  mergeDashToMkv,
  mergeDashToMp4,
  remuxToContainer,
  type MkvSubtitleInput,
} from "../ffmpeg";
import { ensureDir, resolveDownloadDir, taskTempDir } from "../paths";
import { getSettings } from "../settings";
import { planOutputPath, reserveOutputPath, type NamingContext, type OutputExtension } from "./naming";

/**
 * 单个下载任务的执行器（由 TaskManager 调用）。
 * 流程：刷新播放地址 -> 下载音视频到 .tmp/<taskId>/ -> 合并（可内嵌字幕为 MKV）-> 移动到下载目录。
 * 单个文件的下载支持多连接分片（Range），失败自动回退单连接。
 */

const MAX_URL_ATTEMPTS = 3;
/** 单文件分片下载的最大并发段数（与设置项 downloadThreads 上限一致）。 */
const MAX_DOWNLOAD_THREADS = 8;
/** 每个分片的最小字节数：文件较小时不值得分片。 */
const MIN_SLICE_BYTES = 2 * 1024 * 1024;
/** 单个分片的最大重试次数（每次从已写入位置续传）。 */
const MAX_PART_ATTEMPTS = 3;
/** 最多内嵌的字幕轨道数。 */
const MAX_EMBED_SUBTITLES = 3;

export interface TaskExecutionContext {
  task: DownloadTask;
  signal: AbortSignal;
  patch: (patch: Partial<DownloadTask>) => void;
}

export interface WorkerResult {
  status: "completed" | "error";
  error: string | null;
  filePath?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  /** 服务端未合并时保存的视频分片路径（format=m4s） */
  videoFilePath?: string | null;
  /** 服务端未合并且含音轨时保存的音频分片路径（format=m4s） */
  audioFilePath?: string | null;
  format?: DownloadTask["format"];
  qn?: number;
  qualityName?: string;
  codec?: Codec;
  /** 实际选中的音频质量 id（0 表示无音轨/未指定） */
  audioQualityId?: number;
  /** 实际选中的音频质量名称（如「192K」/「Hi-Res 无损」；无音轨为「自动」） */
  audioQualityName?: string;
  /** 实际内嵌的字幕轨道数（0 表示未内嵌） */
  subtitleCount?: number;
  /** 实际获取到的弹幕条数 */
  danmakuCount?: number;
  /** 单独保存弹幕时的弹幕文件夹绝对路径 */
  danmakuPath?: string | null;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return "未知错误";
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new Error("任务已暂停或取消");
}

/** 可被 AbortSignal 立即中断的延时。 */
function delay(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error("任务已暂停或取消"));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error("任务已暂停或取消"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

async function fileSize(target: string): Promise<number> {
  try {
    const stat = await fs.stat(target);
    return stat.isFile() ? stat.size : 0;
  } catch {
    return 0;
  }
}

async function moveFile(source: string, destination: string): Promise<void> {
  await ensureDir(path.dirname(destination));
  try {
    await fs.rename(source, destination);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EXDEV") {
      await fs.copyFile(source, destination);
      await fs.rm(source, { force: true });
      return;
    }
    throw error;
  }
}

/** 删除任务临时目录（取消/删除/合并完成后调用）。 */
export async function cleanupTaskTemp(downloadDir: string, taskId: string): Promise<void> {
  await fs.rm(taskTempDir(downloadDir, taskId), { recursive: true, force: true }).catch(() => undefined);
}

function collectUrls(sources: StreamSource[]): string[] {
  const urls: string[] = [];
  for (const source of sources) {
    if (source.url) urls.push(source.url);
    for (const backup of source.backupUrls) {
      if (backup) urls.push(backup);
    }
  }
  return [...new Set(urls)];
}

function parseContentRangeTotal(header: string | null): number | null {
  if (!header) return null;
  const match = /bytes\s+\d+-\d+\/(\d+)/i.exec(header);
  return match ? Number.parseInt(match[1], 10) : null;
}

function parseContentRangeStart(header: string | null): number | null {
  if (!header) return null;
  const match = /bytes\s+(\d+)-\d+\/(?:\d+|\*)/i.exec(header);
  return match ? Number.parseInt(match[1], 10) : null;
}

function normalizeThreads(threads: number): number {
  const value = Math.trunc(threads);
  if (!Number.isFinite(value) || value < 1) return 1;
  return Math.min(MAX_DOWNLOAD_THREADS, value);
}

interface DownloadPart {
  start: number;
  end: number;
  /** 该分片已写入的字节数（重试时从这里续传） */
  written: number;
}

/** 探测服务器是否支持 Range 并返回文件总大小；不支持/拿不到总大小返回 null。 */
async function probeRangeTotal(
  url: string,
  headers: Record<string, string>,
  signal: AbortSignal,
): Promise<number | null> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: { ...headers, Range: "bytes=0-0" },
      cache: "no-store",
      redirect: "follow",
      signal,
    });
  } catch (error) {
    if (signal.aborted) throw error;
    return null;
  }
  try {
    if (response.status !== 206) return null;
    const total = parseContentRangeTotal(response.headers.get("content-range"));
    return total !== null && total > 0 ? total : null;
  } finally {
    // 探测响应必须关闭，否则连接泄漏
    await response.body?.cancel().catch(() => undefined);
  }
}

/** 把总大小均分为 N 段（N = min(threads, 8, ceil(total/2MiB))，至少 1 段）。 */
function planDownloadParts(total: number, threads: number): DownloadPart[] {
  const byMinSlice = Math.ceil(total / MIN_SLICE_BYTES);
  const count = Math.max(1, Math.min(threads, MAX_DOWNLOAD_THREADS, byMinSlice));
  const partSize = Math.ceil(total / count);
  const parts: DownloadPart[] = [];
  for (let index = 0; index < count; index += 1) {
    const start = index * partSize;
    if (start >= total) break;
    parts.push({ start, end: Math.min(total, start + partSize) - 1, written: 0 });
  }
  return parts;
}

/** 定位写入完整一块数据：fs.write 可能只写入一部分，需要循环直到写完。 */
async function writeAt(handle: FileHandle, chunk: Uint8Array, position: number): Promise<void> {
  let offset = 0;
  while (offset < chunk.byteLength) {
    const result = await handle.write(chunk, offset, chunk.byteLength - offset, position + offset);
    if (result.bytesWritten <= 0) throw new Error("写入文件失败（写入 0 字节）");
    offset += result.bytesWritten;
  }
}

interface DownloadInPartsOptions {
  label: string;
  url: string;
  headers: Record<string, string>;
  destination: string;
  threads: number;
  signal: AbortSignal;
  onBytes: (downloaded: number, total: number) => void;
}

/**
 * 多线程分片下载：Range 探测 -> 均分 N 段并发定位写 -> 最终大小校验。
 * 返回 null 表示服务器不支持 Range 或文件太小，由调用方回退单连接（不视为失败）。
 * 任一分片失败会中断其它分片、关闭 handle、删除半成品后抛错，调用方再回退单连接。
 */
async function downloadInParts(
  options: DownloadInPartsOptions,
): Promise<{ bytes: number; total: number } | null> {
  const total = await probeRangeTotal(options.url, options.headers, options.signal);
  if (total === null) {
    console.log("[worker] 服务器不支持 Range，使用单连接");
    return null;
  }
  const parts = planDownloadParts(total, options.threads);
  if (parts.length <= 1) {
    console.log(`[worker] ${options.label}文件较小（${total} 字节），使用单连接`);
    return null;
  }
  console.log(
    `[worker] 分片下载：${parts.length} 段 · 总大小 ${total} 字节 · URL ${options.url.slice(0, 80)}`,
  );

  await ensureDir(path.dirname(options.destination));
  const handle = await fs.open(options.destination, "w");
  const partsController = new AbortController();
  const partsSignal = partsController.signal;
  const forwardAbort = () => partsController.abort();
  if (options.signal.aborted) partsController.abort();
  else options.signal.addEventListener("abort", forwardAbort, { once: true });

  let closed = false;
  const closeHandle = async () => {
    if (closed) return;
    closed = true;
    await handle.close().catch(() => undefined);
  };
  let downloadedBytes = 0;

  /** 单个分片：独立重试，每次从已写入位置续传。 */
  const fetchPart = async (part: DownloadPart, index: number): Promise<void> => {
    for (let attempt = 0; attempt < MAX_PART_ATTEMPTS; attempt += 1) {
      throwIfAborted(options.signal);
      const start = part.start + part.written;
      if (start > part.end) return;

      let response: Response;
      try {
        response = await fetch(options.url, {
          method: "GET",
          headers: { ...options.headers, Range: `bytes=${start}-${part.end}` },
          cache: "no-store",
          redirect: "follow",
          signal: partsSignal,
        });
      } catch (error) {
        if (options.signal.aborted || partsSignal.aborted) throw error;
        if (attempt + 1 >= MAX_PART_ATTEMPTS) {
          throw new Error(`分片 ${index + 1}/${parts.length} 请求失败：${errorMessage(error)}`);
        }
        await delay(200 * (attempt + 1), partsSignal);
        continue;
      }

      try {
        // 必须校验 206 与 Content-Range 起点，避免服务器忽略 Range 时把整文件写到分片偏移
        if (response.status !== 206) {
          throw new Error(`服务器未返回 206（HTTP ${response.status}）`);
        }
        const contentRange = response.headers.get("content-range");
        const rangeStart = parseContentRangeStart(contentRange);
        if (rangeStart === null || rangeStart !== start) {
          throw new Error(`Content-Range 起点不匹配（期望 ${start}，实际 ${String(rangeStart)}）`);
        }
        const rangeTotal = parseContentRangeTotal(contentRange);
        if (rangeTotal !== null && rangeTotal !== total) {
          throw new Error(`Content-Range 总大小不匹配（期望 ${total}，实际 ${rangeTotal}）`);
        }
        if (!response.body) throw new Error("响应体为空");

        for await (const chunk of response.body) {
          if (!chunk.byteLength) continue;
          const remaining = part.end + 1 - (part.start + part.written);
          const slice = chunk.byteLength > remaining ? chunk.subarray(0, remaining) : chunk;
          await writeAt(handle, slice, part.start + part.written);
          part.written += slice.byteLength;
          downloadedBytes += slice.byteLength;
          options.onBytes(downloadedBytes, total);
        }
        if (part.start + part.written <= part.end) {
          throw new Error(`分片下载不完整（${part.written}/${part.end - part.start + 1} 字节）`);
        }
        return;
      } catch (error) {
        await response.body?.cancel().catch(() => undefined);
        // 取消/暂停立即抛出，不被重试循环吞掉
        if (options.signal.aborted || partsSignal.aborted) throw error;
        if (attempt + 1 >= MAX_PART_ATTEMPTS) {
          throw new Error(`分片 ${index + 1}/${parts.length} 下载失败：${errorMessage(error)}`);
        }
        await delay(200 * (attempt + 1), partsSignal);
      }
    }
  };

  try {
    // 任一分片失败先中断其它分片，等全部结束后再关文件（Windows 上打开中的文件无法删除）
    const failures: unknown[] = [];
    await Promise.all(
      parts.map((part, index) =>
        fetchPart(part, index).catch((error: unknown) => {
          if (failures.length === 0) {
            failures.push(error);
            partsController.abort();
          }
        }),
      ),
    );
    if (failures.length > 0) throw failures[0];

    const stat = await handle.stat();
    if (stat.size !== total) {
      throw new Error(`${options.label}分片下载文件大小校验失败（${stat.size}/${total} 字节）`);
    }
    return { bytes: total, total };
  } catch (error) {
    await closeHandle();
    await fs.rm(options.destination, { force: true }).catch(() => undefined);
    throw error;
  } finally {
    partsController.abort();
    options.signal.removeEventListener("abort", forwardAbort);
    await closeHandle();
  }
}

interface DownloadFileOptions {
  label: string;
  sources: StreamSource[];
  destination: string;
  headers: Record<string, string>;
  /** 单文件下载线程数（1 表示单连接） */
  threads: number;
  signal: AbortSignal;
  onBytes: (downloaded: number, total: number) => void;
}

/**
 * 下载单个文件。
 * - threads>1 且无可续传数据时：先尝试多线程分片，Range 不支持或分片失败自动回退单连接
 * - 已有续传数据（暂停恢复）时：只走单连接 Range 续传，避免分片空洞
 * - 单连接：支持 Range 续传、backupUrl 依次切换、连接中断后重试
 */
async function downloadMediaFile(options: DownloadFileOptions): Promise<{ bytes: number; total: number }> {
  const urls = collectUrls(options.sources);
  if (!urls.length) throw new Error(options.label + "下载地址为空");
  const threads = normalizeThreads(options.threads);
  // 进度单调递增：多线程失败回退单连接时不能让已上报字节数回退
  let reportedBytes = 0;
  const reportBytes = (downloaded: number, total: number) => {
    reportedBytes = Math.max(reportedBytes, downloaded);
    options.onBytes(reportedBytes, total);
  };
  let forceSingle = false;
  let lastError: unknown = null;

  for (const url of urls) {
    for (let attempt = 0; attempt < MAX_URL_ATTEMPTS; attempt += 1) {
      throwIfAborted(options.signal);
      const startSize = await fileSize(options.destination);

      // 1) 多线程分片下载：仅从 0 开始时尝试
      if (threads > 1 && startSize === 0 && !forceSingle) {
        try {
          const partResult = await downloadInParts({
            label: options.label,
            url,
            headers: options.headers,
            destination: options.destination,
            threads,
            signal: options.signal,
            onBytes: reportBytes,
          });
          if (partResult) return partResult;
          forceSingle = true;
        } catch (error) {
          if (options.signal.aborted) throw error;
          console.warn("[worker] 分片下载失败，回退单连接：" + errorMessage(error));
          forceSingle = true;
          lastError = error;
        }
      }

      // 2) 单连接（含 Range 续传 / backupUrl / 断线重试）
      const requestHeaders: Record<string, string> = { ...options.headers };
      if (startSize > 0) requestHeaders.Range = "bytes=" + startSize + "-";

      let response: Response;
      try {
        response = await fetch(url, {
          method: "GET",
          headers: requestHeaders,
          cache: "no-store",
          redirect: "follow",
          signal: options.signal,
        });
      } catch (error) {
        if (options.signal.aborted) throw error;
        lastError = error;
        continue;
      }

      if (response.status === 416) {
        const size = await fileSize(options.destination);
        return { bytes: size, total: size };
      }
      if (!response.ok || !response.body) {
        lastError = new Error("HTTP " + response.status);
        await response.body?.cancel().catch(() => undefined);
        continue;
      }

      const isPartial = response.status === 206;
      const contentLengthHeader = response.headers.get("content-length");
      const contentLength = contentLengthHeader ? Number.parseInt(contentLengthHeader, 10) : 0;
      const rangeTotal = parseContentRangeTotal(response.headers.get("content-range"));
      const total = isPartial && rangeTotal !== null ? rangeTotal : contentLength + (isPartial ? startSize : 0);
      const baseOffset = isPartial ? startSize : 0;
      const flags = isPartial && startSize > 0 ? "a" : "w";

      let handle: FileHandle | null = null;
      let written = baseOffset;
      let streamError: unknown = null;
      try {
        // 取消/重试可能并发清理临时目录，打开文件前确保目录仍存在
        await ensureDir(path.dirname(options.destination));
        try {
          handle = await fs.open(options.destination, flags);
        } catch (openError) {
          if ((openError as NodeJS.ErrnoException).code !== "ENOENT") throw openError;
          await new Promise((resolve) => setTimeout(resolve, 120));
          await ensureDir(path.dirname(options.destination));
          handle = await fs.open(options.destination, flags);
        }
        for await (const chunk of response.body) {
          await handle.write(chunk);
          written += chunk.byteLength;
          reportBytes(written, total > 0 ? total : written);
        }
        // 最终文件大小校验
        const stat = await handle.stat();
        const actual = stat.size > 0 ? stat.size : written;
        if (total > 0 && actual < total) {
          throw new Error(`连接提前中断（${actual}/${total} 字节）`);
        }
        return { bytes: actual, total: total > 0 ? total : actual };
      } catch (error) {
        streamError = error;
      } finally {
        if (handle) await handle.close().catch(() => undefined);
      }

      if (options.signal.aborted) {
        throw streamError instanceof Error ? streamError : new Error("任务已暂停或取消");
      }
      lastError = streamError;
      // 网络抖动：回到循环使用 Range 续传
    }
  }

  throw new Error(options.label + "下载失败：" + errorMessage(lastError));
}

/** 执行任务主体；失败抛错，暂停/取消由 TaskManager 根据 AbortSignal 判定。 */
export async function executeTask(context: TaskExecutionContext): Promise<WorkerResult> {
  const { task, signal, patch } = context;
  const settings = await getSettings();
  const downloadDir = resolveDownloadDir(settings.downloadDir);
  const tmpDir = taskTempDir(downloadDir, task.id);
  await ensureDir(tmpDir);
  throwIfAborted(signal);

  // ffmpeg 检测前移：字幕内嵌判断、合并与降级提示共用一次结果
  const ffmpegInfo = await detectFfmpeg(settings.ffmpegPath);
  throwIfAborted(signal);

  // 1. 刷新视频信息（分P数量、时长、标题）；失败不影响下载主流程
  let videoInfo: VideoInfo | null = null;
  try {
    videoInfo = await getVideoInfo({ bvid: task.bvid }, settings.cookie);
  } catch (error) {
    console.warn("[worker] 获取视频信息失败，沿用任务快照:", errorMessage(error));
  }
  throwIfAborted(signal);

  const pageInfo =
    videoInfo?.pages.find((page) => page.cid === task.cid) ?? videoInfo?.pages[task.page - 1];
  const isMultiPage = Boolean(videoInfo && videoInfo.pages.length > 1);
  const duration = pageInfo?.duration ?? videoInfo?.duration ?? 0;
  // 列表任务（合集/分P批量）以创建任务时的标题为准：合集剧集标题可能与视频自身标题不同，
  // 文件命名应和首页列表显示保持一致；非列表任务仍用最新拉取的视频信息。
  const isListTask = Boolean(task.listTitle && task.listTitle.trim());
  const title = isListTask ? task.title : (videoInfo?.title ?? task.title);
  const partTitle = isListTask ? (task.partTitle || task.title) : (pageInfo?.title ?? task.partTitle);
  const upName = videoInfo?.owner.name ?? task.upName;

  // 2. 使用服务端最新 cookie 重新获取播放地址（不信任客户端 URL）
  const streams = await getPlayStreams({
    bvid: task.bvid,
    cid: task.cid,
    qn: task.qn,
    codec: task.codec,
    audioOnly: task.audioOnly,
    audioQualityId: task.audioQualityId > 0 ? task.audioQualityId : undefined,
    cookie: settings.cookie,
    duration,
  });
  throwIfAborted(signal);

  const selected = streams.selected;
  // 实际选中的音频质量（无音轨时为 0 / 自动），完成后回写任务用于列表展示
  const audioQualityId = selected.audioQuality?.id ?? 0;
  const audioQualityName = selected.audioQuality?.label ?? "自动";
  const audioKind = selected.audioQuality?.kind;
  patch({
    qn: selected.qn,
    qualityName: selected.label,
    codec: selected.codec,
    audioQualityId,
    audioQualityName,
    totalBytes: (selected.video?.size ?? 0) + (selected.audio?.size ?? 0),
  });

  if (!task.audioOnly && !selected.video) throw new Error("该视频没有可用的视频流");
  if (task.audioOnly && !selected.audio) throw new Error("该视频没有可用的音频流");
  // 无音轨视频（原应用行为：文件名加「无声-」前缀）
  const hasAudioTrack = Boolean(selected.audio);

  const headers = buildBiliHeaders(settings.cookie);
  const videoTmp = path.join(tmpDir, "video.m4s");
  const audioTmp = path.join(tmpDir, "audio.m4s");
  const progress = { videoDone: 0, videoTotal: 0, audioDone: 0, audioTotal: 0 };
  const reportProgress = () => {
    patch({
      downloadedBytes: progress.videoDone + progress.audioDone,
      totalBytes: progress.videoTotal + progress.audioTotal,
    });
  };
  const threads = normalizeThreads(settings.downloadThreads);

  // 3. 并发下载音视频（任一失败时中断另一个）
  const inner = new AbortController();
  const forwardAbort = () => inner.abort();
  if (signal.aborted) inner.abort();
  else signal.addEventListener("abort", forwardAbort, { once: true });
  const downloads: Promise<{ bytes: number; total: number }>[] = [];
  try {
    if (!task.audioOnly && selected.video) {
      downloads.push(
        downloadMediaFile({
          label: "视频",
          sources: [selected.video],
          destination: videoTmp,
          headers,
          threads,
          signal: inner.signal,
          onBytes: (done, total) => {
            progress.videoDone = done;
            progress.videoTotal = total;
            reportProgress();
          },
        }),
      );
    }
    if (selected.audio) {
      downloads.push(
        downloadMediaFile({
          label: "音频",
          sources: [selected.audio],
          destination: audioTmp,
          headers,
          threads,
          signal: inner.signal,
          onBytes: (done, total) => {
            progress.audioDone = done;
            progress.audioTotal = total;
            reportProgress();
          },
        }),
      );
    }
    await Promise.all(downloads);
  } catch (error) {
    inner.abort();
    throw error;
  } finally {
    signal.removeEventListener("abort", forwardAbort);
  }
  throwIfAborted(signal);

  // 下载完成校验
  const videoDownloadedSize = task.audioOnly ? 0 : await fileSize(videoTmp);
  if (!task.audioOnly && videoDownloadedSize <= 0) throw new Error("视频流下载为空文件");
  if (hasAudioTrack) {
    const audioDownloadedSize = await fileSize(audioTmp);
    if (audioDownloadedSize <= 0) throw new Error("音频流下载为空文件");
  }

  const namingContext: NamingContext = {
    title,
    partTitle,
    bvid: task.bvid,
    cid: task.cid,
    page: task.page,
    qualityName: selected.label,
    upName,
  };

  // 4. 字幕准备（内嵌 MKV 用；任何失败都降级，不影响下载主流程）
  const wantEmbed = !task.audioOnly && task.embedSubtitles && ffmpegInfo.available && settings.mergeWithFfmpeg;
  const subtitleInputs: MkvSubtitleInput[] = [];
  let embedWarning: string | null = null;
  if (wantEmbed) {
    const aid = videoInfo?.aid ?? task.aid;
    if (aid > 0) {
      const tracks = await getVideoSubtitles({ aid, cid: task.cid, cookie: settings.cookie, signal });
      throwIfAborted(signal);
      const selectedTracks = tracks.slice(0, MAX_EMBED_SUBTITLES);
      for (let index = 0; index < selectedTracks.length; index += 1) {
        const track = selectedTracks[index];
        try {
          const cues = await downloadSubtitleCues(track, settings.cookie, signal);
          const srt = cuesToSrt(cues);
          if (!srt.trim()) {
            console.warn("[worker] 字幕「" + track.label + "」内容为空，已跳过");
            continue;
          }
          const subtitlePath = path.join(tmpDir, "subtitle-" + index + ".srt");
          await fs.writeFile(subtitlePath, srt, "utf8");
          subtitleInputs.push({
            path: subtitlePath,
            language: subtitleLanguageCode(track.lang),
            title: track.label || track.lang,
          });
        } catch (error) {
          if (signal.aborted) throw error;
          console.warn("[worker] 字幕「" + track.label + "」下载失败，已跳过:", errorMessage(error));
        }
      }
    } else {
      console.warn("[worker] 缺少 aid，跳过字幕获取");
    }
    if (subtitleInputs.length === 0) embedWarning = "未找到可用的 B 站字幕，已跳过字幕内嵌";
  } else if (task.embedSubtitles && !task.audioOnly) {
    embedWarning = !settings.mergeWithFfmpeg
      ? "已在设置中关闭 ffmpeg 合并，无法内嵌字幕"
      : "未检测到可用的 ffmpeg，无法内嵌字幕";
  }
  throwIfAborted(signal);

  // 4.5 弹幕准备：可内嵌为 MKV 的 ASS 软字幕轨道，也可单独保存 XML/ASS 到「弹幕」文件夹
  const wantEmbedDanmaku = !task.audioOnly && task.embedDanmaku;
  const wantSaveDanmaku = task.saveDanmaku;
  let danmaku: DanmakuFetchResult | null = null;
  let danmakuWarning: string | null = null;
  if (wantEmbedDanmaku || wantSaveDanmaku) {
    try {
      danmaku = await fetchVideoDanmaku({ cid: task.cid, cookie: settings.cookie, signal });
    } catch (error) {
      if (signal.aborted) throw error;
      danmakuWarning = "弹幕获取失败：" + errorMessage(error);
      console.warn("[worker] 弹幕获取失败，跳过弹幕处理:", errorMessage(error));
    }
    if (danmaku && danmaku.entries.length === 0) {
      danmakuWarning = danmakuWarning ?? "该视频没有可用弹幕";
    }
  }
  let danmakuAssPath: string | null = null;
  if (danmaku && danmaku.entries.length > 0) {
    danmakuAssPath = path.join(tmpDir, "danmaku.ass");
    await fs.writeFile(
      danmakuAssPath,
      buildDanmakuAss(danmaku.entries, {
        fontSize: settings.danmakuFontSize,
        opacity: settings.danmakuOpacity,
        duration,
      }),
      "utf8",
    );
  }
  const canEmbedDanmaku =
    wantEmbedDanmaku &&
    ffmpegInfo.available &&
    settings.mergeWithFfmpeg &&
    Boolean(danmakuAssPath);
  if (wantEmbedDanmaku && !canEmbedDanmaku && !danmakuWarning) {
    danmakuWarning =
      ffmpegInfo.available && settings.mergeWithFfmpeg
        ? "未能生成弹幕字幕，跳过内嵌"
        : "未检测到可用的 ffmpeg，无法内嵌弹幕";
  }
  throwIfAborted(signal);

  // 5. 生成最终文件名（内嵌字幕/弹幕成功时为 .mkv；列表下载时放入列表子文件夹）
  // 仅音频：Hi-Res 无损输出 .flac，其余音轨（AAC/杜比）统一转封装为 .m4a
  const audioExtension: OutputExtension = audioKind === "flac" ? ".flac" : ".m4a";
  const audioFormat: DownloadTask["format"] = audioKind === "flac" ? "flac" : "m4a";
  // 非 AAC 音轨（Hi-Res 无损/杜比全景声）封装进 MKV 兼容性更好；普通 AAC 视频仍保持 MP4
  const wantMkv =
    subtitleInputs.length > 0 || canEmbedDanmaku || (!task.audioOnly && audioKind !== undefined && audioKind !== "aac");
  const extension: OutputExtension = task.audioOnly ? audioExtension : wantMkv ? ".mkv" : ".mp4";
  // 列表文件夹：优先使用任务记录的列表名；旧任务（无 listTitle）沿用「多P视频按标题建文件夹」行为
  let listFolder: string | null = null;
  let listIndex: number | null = null;
  if (settings.listFolder) {
    if (task.listTitle) {
      listFolder = task.listTitle;
      listIndex = task.listIndex ?? null;
    } else if (isMultiPage) {
      listFolder = title;
      listIndex = task.page;
    }
  }
  const plan = planOutputPath({
    downloadDir,
    namingTemplate: settings.namingTemplate,
    context: namingContext,
    extension,
    folder: listFolder,
    index: listIndex,
  });
  if (!task.audioOnly && !hasAudioTrack) {
    plan.fileName = "无声-" + plan.fileName;
  }
  const output = await reserveOutputPath(plan.dir, plan.fileName);

  /** 汇总非致命告警（字幕/弹幕/降级），写入任务 error 字段展示。 */
  const buildWarning = (): string | null => {
    const parts = [embedWarning, danmakuWarning].filter((item): item is string => Boolean(item));
    return parts.length ? parts.join("；") : null;
  };

  /** 把弹幕 XML/ASS 单独保存到视频同目录的「弹幕」子文件夹。 */
  const saveDanmakuFiles = async (
    dir: string,
    fileName: string,
  ): Promise<{ count: number; path: string | null }> => {
    const count = danmaku?.entries.length ?? 0;
    if (!wantSaveDanmaku || !danmaku || count === 0) return { count, path: null };
    try {
      const danmakuDir = path.join(dir, DANMAKU_FOLDER_NAME);
      await ensureDir(danmakuDir);
      const base = path.parse(fileName).name;
      await fs.writeFile(path.join(danmakuDir, base + ".xml"), danmaku.xml, "utf8");
      await fs.writeFile(
        path.join(danmakuDir, base + ".ass"),
        buildDanmakuAss(danmaku.entries, {
          fontSize: settings.danmakuFontSize,
          opacity: settings.danmakuOpacity,
          duration,
        }),
        "utf8",
      );
      return { count, path: danmakuDir };
    } catch (error) {
      console.warn("[worker] 保存弹幕文件失败:", errorMessage(error));
      return { count, path: null };
    }
  };

  // 6. 合并/转封装
  patch({ status: "merging" });
  const canMerge = ffmpegInfo.available && settings.mergeWithFfmpeg;
  throwIfAborted(signal);

  if (task.audioOnly) {
    let sourcePath = audioTmp;
    let audioOutput = output;
    let audioOutputFormat: DownloadTask["format"] = audioFormat;
    let audioWarning: string | null = null;
    if (ffmpegInfo.available) {
      const remuxed = path.join(tmpDir, "audio" + audioExtension);
      try {
        await remuxToContainer({
          ffmpegPath: settings.ffmpegPath,
          inputPath: audioTmp,
          outputPath: remuxed,
          signal,
        });
        sourcePath = remuxed;
      } catch (error) {
        console.warn("[worker] 音频转封装失败，直接保存原始 m4s 数据:", errorMessage(error));
        if (audioKind === "flac") {
          audioWarning = "无损音轨转封装为 FLAC 失败，已保存原始 m4s 分片";
        }
      }
    } else if (audioKind === "flac") {
      audioWarning = "未检测到可用的 ffmpeg，无法把 Hi-Res 无损音轨转封装为 FLAC，已保存原始 m4s 分片";
    }
    // FLAC 转封装失败时源文件仍是 fMP4 分片，不能伪装成 .flac 保存，改为 .m4s
    if (audioKind === "flac" && sourcePath === audioTmp) {
      const m4sPlan = planOutputPath({
        downloadDir,
        namingTemplate: settings.namingTemplate,
        context: namingContext,
        extension: ".m4s",
        folder: listFolder,
        index: listIndex,
      });
      audioOutput = await reserveOutputPath(m4sPlan.dir, m4sPlan.fileName);
      audioOutputFormat = "m4s";
    }
    await moveFile(sourcePath, audioOutput.filePath);
    const size = await fileSize(audioOutput.filePath);
    const danmakuInfo = await saveDanmakuFiles(audioOutput.dir, audioOutput.fileName);
    await cleanupTaskTemp(downloadDir, task.id);
    const audioWarningText = [buildWarning(), audioWarning]
      .filter((item): item is string => Boolean(item))
      .join("；");
    return {
      status: "completed",
      error: audioWarningText || null,
      filePath: audioOutput.filePath,
      fileName: audioOutput.fileName,
      fileSize: size,
      format: audioOutputFormat,
      qn: selected.qn,
      qualityName: selected.label,
      codec: selected.codec,
      audioQualityId,
      audioQualityName,
      subtitleCount: 0,
      danmakuCount: danmakuInfo.count,
      danmakuPath: danmakuInfo.path,
    };
  }

  const hasAudio = hasAudioTrack;
  if (canMerge) {
    // 6.1 有字幕：优先内嵌字幕输出 MKV
    if (wantMkv) {
      const mergedMkv = path.join(tmpDir, "merged.mkv");
      try {
        const mkvSubtitles: MkvSubtitleInput[] = [...subtitleInputs];
        if (canEmbedDanmaku && danmakuAssPath) {
          mkvSubtitles.push({ path: danmakuAssPath, language: "chi", title: "弹幕", codec: "ass" });
        }
        await mergeDashToMkv({
          ffmpegPath: settings.ffmpegPath,
          videoPath: videoTmp,
          audioPath: hasAudio ? audioTmp : null,
          subtitles: mkvSubtitles,
          outputPath: mergedMkv,
          signal,
        });
        await moveFile(mergedMkv, output.filePath);
        const size = await fileSize(output.filePath);
        const danmakuInfo = await saveDanmakuFiles(output.dir, output.fileName);
        await cleanupTaskTemp(downloadDir, task.id);
        return {
          status: "completed",
          error: buildWarning(),
          filePath: output.filePath,
          fileName: output.fileName,
          fileSize: size,
          format: "mkv",
          qn: selected.qn,
          qualityName: selected.label,
          codec: selected.codec,
          audioQualityId,
          audioQualityName,
          subtitleCount: subtitleInputs.length,
          danmakuCount: danmakuInfo.count,
          danmakuPath: danmakuInfo.path,
        };
      } catch (error) {
        if (signal.aborted) throw error;
        console.warn("[worker] 字幕/弹幕内嵌合并失败，回退 MP4:", errorMessage(error));
        const failedParts = [
          subtitleInputs.length > 0 ? "字幕" : "",
          canEmbedDanmaku ? "弹幕" : "",
        ]
          .filter(Boolean)
          .join("/");
        // 仅因高音质音轨（Hi-Res/杜比）触发 MKV 时没有字幕/弹幕，提示改为容器回退
        embedWarning = failedParts ? failedParts + "内嵌合并失败，已按 MP4 保存" : "MKV 封装失败，已按 MP4 保存";
      }
    }

    // 6.2 普通 MP4 合并（含内嵌失败后的回退）；原预留名是 .mkv 时重新按 .mp4 预留
    let mp4Target = output;
    if (wantMkv) {
      const mp4Plan = planOutputPath({
        downloadDir,
        namingTemplate: settings.namingTemplate,
        context: namingContext,
        extension: ".mp4",
        folder: listFolder,
        index: listIndex,
      });
      if (!hasAudioTrack) mp4Plan.fileName = "无声-" + mp4Plan.fileName;
      mp4Target = await reserveOutputPath(mp4Plan.dir, mp4Plan.fileName);
    }
    const merged = path.join(tmpDir, "merged.mp4");
    try {
      if (hasAudio) {
        await mergeDashToMp4({
          ffmpegPath: settings.ffmpegPath,
          videoPath: videoTmp,
          audioPath: audioTmp,
          outputPath: merged,
          signal,
        });
      } else {
        await remuxToContainer({
          ffmpegPath: settings.ffmpegPath,
          inputPath: videoTmp,
          outputPath: merged,
          signal,
        });
      }
      await moveFile(merged, mp4Target.filePath);
      const size = await fileSize(mp4Target.filePath);
      const danmakuInfo = await saveDanmakuFiles(mp4Target.dir, mp4Target.fileName);
      await cleanupTaskTemp(downloadDir, task.id);
      return {
        status: "completed",
        error: buildWarning(),
        filePath: mp4Target.filePath,
        fileName: mp4Target.fileName,
        fileSize: size,
        format: "mp4",
        qn: selected.qn,
        qualityName: selected.label,
        codec: selected.codec,
        audioQualityId,
        audioQualityName,
        subtitleCount: 0,
        danmakuCount: danmakuInfo.count,
        danmakuPath: danmakuInfo.path,
      };
    } catch (error) {
      if (signal.aborted) throw error;
      console.warn("[worker] ffmpeg 合并失败，降级为分别保存:", errorMessage(error));
    }
  }

  // 7. 降级：ffmpeg 不可用/合并失败 -> 分别保存音视频文件
  const degradedPlan = planOutputPath({
    downloadDir,
    namingTemplate: settings.namingTemplate,
    context: namingContext,
    extension: ".mp4",
    folder: listFolder,
    index: listIndex,
  });
  if (!task.audioOnly && !hasAudioTrack) degradedPlan.fileName = "无声-" + degradedPlan.fileName;
  const baseName = degradedPlan.fileName.replace(/\.mp4$/i, "");
  const videoOutput = await reserveOutputPath(degradedPlan.dir, baseName + ".video.m4s");
  await moveFile(videoTmp, videoOutput.filePath);
  let totalSize = await fileSize(videoOutput.filePath);
  let audioOutputPath: string | null = null;
  if (hasAudio) {
    const audioOutput = await reserveOutputPath(degradedPlan.dir, baseName + ".audio.m4s");
    await moveFile(audioTmp, audioOutput.filePath);
    audioOutputPath = audioOutput.filePath;
    totalSize += await fileSize(audioOutput.filePath);
  }
  // 降级时视频文件名为 <name>.video.m4s；弹幕文件改用原始 <name> 作为 basename，避免出现 <name>.video.xml
  const danmakuInfo = await saveDanmakuFiles(videoOutput.dir, degradedPlan.fileName);
  await cleanupTaskTemp(downloadDir, task.id);
  const fallbackWarning = !settings.mergeWithFfmpeg
    ? "已在设置中关闭 ffmpeg 合并，已分别保存音视频文件"
    : ffmpegInfo.available
      ? "ffmpeg 合并失败，已分别保存音视频文件"
      : "未检测到可用的 ffmpeg，已分别保存音视频文件";
  const warning = [buildWarning(), fallbackWarning].filter((item): item is string => Boolean(item)).join("；");
  return {
    status: "completed",
    error: warning || null,
    filePath: videoOutput.filePath,
    fileName: videoOutput.fileName,
    fileSize: totalSize,
    videoFilePath: videoOutput.filePath,
    audioFilePath: audioOutputPath,
    format: "m4s",
    qn: selected.qn,
    qualityName: selected.label,
    codec: selected.codec,
    audioQualityId,
    audioQualityName,
    subtitleCount: 0,
    danmakuCount: danmakuInfo.count,
    danmakuPath: danmakuInfo.path,
  };
}
