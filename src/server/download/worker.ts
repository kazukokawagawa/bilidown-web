import fs from "node:fs/promises";
import path from "node:path";
import type { FileHandle } from "node:fs/promises";

import type { Codec, DownloadTask, StreamSource, VideoInfo } from "@/lib/types";

import { buildBiliHeaders, getPlayStreams, getVideoInfo } from "../bili/client";
import { detectFfmpeg, mergeDashToMp4, remuxToContainer } from "../ffmpeg";
import { ensureDir, resolveDownloadDir, taskTempDir } from "../paths";
import { getSettings } from "../settings";
import { planOutputPath, reserveOutputPath, type NamingContext } from "./naming";

/**
 * 单个下载任务的执行器（由 TaskManager 调用）。
 * 流程：刷新播放地址 -> 流式下载音视频到 .tmp/<taskId>/ -> ffmpeg 合并 -> 移动到下载目录。
 */

const MAX_URL_ATTEMPTS = 3;

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
  format?: DownloadTask["format"];
  qn?: number;
  qualityName?: string;
  codec?: Codec;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return "未知错误";
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new Error("任务已暂停或取消");
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

interface DownloadFileOptions {
  label: string;
  sources: StreamSource[];
  destination: string;
  headers: Record<string, string>;
  signal: AbortSignal;
  onBytes: (downloaded: number, total: number) => void;
}

/**
 * 流式下载单个文件。
 * - 支持 Range 续传（先探测已有文件大小）
 * - 支持 backupUrl 依次切换
 * - 连接中断后在当前 URL 上续传重试
 */
async function downloadMediaFile(options: DownloadFileOptions): Promise<{ bytes: number; total: number }> {
  const urls = collectUrls(options.sources);
  if (!urls.length) throw new Error(options.label + "下载地址为空");
  let lastError: unknown = null;

  for (const url of urls) {
    for (let attempt = 0; attempt < MAX_URL_ATTEMPTS; attempt += 1) {
      throwIfAborted(options.signal);
      const startSize = await fileSize(options.destination);
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
          options.onBytes(written, total > 0 ? total : written);
        }
        if (total > 0 && written < total) {
          throw new Error(`连接提前中断（${written}/${total} 字节）`);
        }
        return { bytes: written, total: total > 0 ? total : written };
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
  const title = videoInfo?.title ?? task.title;
  const partTitle = pageInfo?.title ?? task.partTitle;
  const upName = videoInfo?.owner.name ?? task.upName;

  // 2. 使用服务端最新 cookie 重新获取播放地址（不信任客户端 URL）
  const streams = await getPlayStreams({
    bvid: task.bvid,
    cid: task.cid,
    qn: task.qn,
    codec: task.codec,
    audioOnly: task.audioOnly,
    cookie: settings.cookie,
    duration,
  });
  throwIfAborted(signal);

  const selected = streams.selected;
  patch({
    qn: selected.qn,
    qualityName: selected.label,
    codec: selected.codec,
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

  // 4. 生成最终文件名
  const namingContext: NamingContext = {
    title,
    partTitle,
    bvid: task.bvid,
    cid: task.cid,
    page: task.page,
    qualityName: selected.label,
    upName,
  };
  const extension = task.audioOnly ? ".m4a" : ".mp4";
  const plan = planOutputPath({
    downloadDir,
    namingTemplate: settings.namingTemplate,
    isMultiPage,
    context: namingContext,
    extension,
  });
  if (!task.audioOnly && !hasAudioTrack) {
    plan.fileName = "无声-" + plan.fileName;
  }
  const output = await reserveOutputPath(plan.dir, plan.fileName);

  // 5. 合并/转封装
  patch({ status: "merging" });
  const ffmpegInfo = await detectFfmpeg(settings.ffmpegPath);
  // mergeWithFfmpeg=false 时不合并，降级为分别保存音视频（docs/blueprint.md §4）
  const canMerge = ffmpegInfo.available && settings.mergeWithFfmpeg;
  throwIfAborted(signal);

  if (task.audioOnly) {
    let sourcePath = audioTmp;
    if (ffmpegInfo.available) {
      const remuxed = path.join(tmpDir, "audio.m4a");
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
      }
    }
    await moveFile(sourcePath, output.filePath);
    const size = await fileSize(output.filePath);
    await cleanupTaskTemp(downloadDir, task.id);
    return {
      status: "completed",
      error: null,
      filePath: output.filePath,
      fileName: output.fileName,
      fileSize: size,
      format: "m4a",
      qn: selected.qn,
      qualityName: selected.label,
      codec: selected.codec,
    };
  }

  const hasAudio = hasAudioTrack;
  if (canMerge) {
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
      await moveFile(merged, output.filePath);
      const size = await fileSize(output.filePath);
      await cleanupTaskTemp(downloadDir, task.id);
      return {
        status: "completed",
        error: null,
        filePath: output.filePath,
        fileName: output.fileName,
        fileSize: size,
        format: "mp4",
        qn: selected.qn,
        qualityName: selected.label,
        codec: selected.codec,
      };
    } catch (error) {
      if (signal.aborted) throw error;
      console.warn("[worker] ffmpeg 合并失败，降级为分别保存:", errorMessage(error));
    }
  }

  // 6. 降级：ffmpeg 不可用/合并失败 -> 分别保存音视频文件
  const baseName = output.fileName.replace(/\.mp4$/i, "");
  const videoOutput = await reserveOutputPath(plan.dir, baseName + ".video.m4s");
  await moveFile(videoTmp, videoOutput.filePath);
  let totalSize = await fileSize(videoOutput.filePath);
  if (hasAudio) {
    const audioOutput = await reserveOutputPath(plan.dir, baseName + ".audio.m4s");
    await moveFile(audioTmp, audioOutput.filePath);
    totalSize += await fileSize(audioOutput.filePath);
  }
  await cleanupTaskTemp(downloadDir, task.id);
  const warning = !settings.mergeWithFfmpeg
    ? "已在设置中关闭 ffmpeg 合并，已分别保存音视频文件"
    : ffmpegInfo.available
      ? "ffmpeg 合并失败，已分别保存音视频文件"
      : "未检测到可用的 ffmpeg，已分别保存音视频文件";
  return {
    status: "completed",
    error: warning,
    filePath: videoOutput.filePath,
    fileName: videoOutput.fileName,
    fileSize: totalSize,
    format: "m4s",
    qn: selected.qn,
    qualityName: selected.label,
    codec: selected.codec,
  };
}
