import { spawn } from "node:child_process";
import path from "node:path";

import type { FfmpegInfo } from "@/lib/types";

/**
 * ffmpeg 检测与合并。
 * 命令遵循 docs/blueprint.md §4：
 *   ffmpeg -y -i video.m4s -i audio.m4s -c copy -movflags +faststart out.mp4
 */

const VERSION_TIMEOUT_MS = 8000;
const MERGE_TIMEOUT_MS = 30 * 60 * 1000;
const FFMPEG_CACHE_TTL_MS = 60 * 1000;

interface ProcessResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

interface CacheEntry {
  at: number;
  info: FfmpegInfo;
}

const globalScope = globalThis as unknown as { __bilidownFfmpegCache?: Map<string, CacheEntry> };
const cache: Map<string, CacheEntry> = (globalScope.__bilidownFfmpegCache ??= new Map<string, CacheEntry>());

function resolveCommand(ffmpegPath: string | null | undefined): string {
  const value = (ffmpegPath ?? "").trim();
  return value || "ffmpeg";
}

/** 启动子进程并收集输出；超时/中断时终止进程。 */
export function runProcess(
  command: string,
  args: string[],
  options: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<ProcessResult> {
  return new Promise<ProcessResult>((resolve, reject) => {
    let settled = false;
    let stdout = "";
    let stderr = "";
    const child = spawn(command, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });

    const finish = (error: Error | null, result?: ProcessResult) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (options.signal) options.signal.removeEventListener("abort", onAbort);
      if (error) reject(error);
      else resolve(result ?? { code: null, stdout, stderr });
    };

    const kill = () => {
      try {
        child.kill("SIGKILL");
      } catch {
        // 进程可能已经退出，忽略
      }
    };

    const timer =
      options.timeoutMs && options.timeoutMs > 0
        ? setTimeout(() => {
            kill();
            finish(new Error(`${command} 执行超时`));
          }, options.timeoutMs)
        : null;

    const onAbort = () => {
      kill();
      finish(new Error("操作已取消"));
    };
    if (options.signal) {
      if (options.signal.aborted) {
        kill();
        finish(new Error("操作已取消"));
        return;
      }
      options.signal.addEventListener("abort", onAbort, { once: true });
    }

    child.stdout?.on("data", (chunk: Buffer) => {
      if (stdout.length < 256 * 1024) stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      if (stderr.length < 256 * 1024) stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      finish(new Error(`无法执行 ${command}: ${error.message}`));
    });
    child.on("close", (code) => {
      finish(null, { code, stdout, stderr });
    });
  });
}

/** 检测 ffmpeg 是否可用（结果缓存 60s，避免每次请求都启动进程）。 */
export async function detectFfmpeg(ffmpegPath: string | null | undefined): Promise<FfmpegInfo> {
  const command = resolveCommand(ffmpegPath);
  const cached = cache.get(command);
  if (cached && Date.now() - cached.at < FFMPEG_CACHE_TTL_MS) return cached.info;

  let info: FfmpegInfo;
  try {
    const result = await runProcess(command, ["-version"], { timeoutMs: VERSION_TIMEOUT_MS });
    if (result.code === 0) {
      const version = parseVersion(result.stdout) ?? "unknown";
      info = { available: true, version, path: command };
    } else {
      info = { available: false, path: command };
    }
  } catch {
    info = { available: false, path: command };
  }
  cache.set(command, { at: Date.now(), info });
  return info;
}

export function clearFfmpegCache(): void {
  cache.clear();
}

function parseVersion(output: string): string | undefined {
  const match = /ffmpeg version\s+(\S+)/i.exec(output);
  if (!match) return undefined;
  const raw = match[1];
  const numeric = /(\d+\.\d+(?:\.\d+)?)/.exec(raw);
  return numeric ? numeric[1] : raw;
}

async function assertSuccess(command: string, args: string[], signal?: AbortSignal): Promise<void> {
  const result = await runProcess(command, args, { timeoutMs: MERGE_TIMEOUT_MS, signal });
  if (result.code !== 0) {
    const detail = result.stderr.trim().split(/\r?\n/).slice(-3).join(" | ");
    throw new Error(`ffmpeg 处理失败（退出码 ${String(result.code)}）${detail ? "：" + detail : ""}`);
  }
}

/** 合并 DASH 音视频为 mp4。 */
export async function mergeDashToMp4(options: {
  ffmpegPath: string | null | undefined;
  videoPath: string;
  audioPath: string;
  outputPath: string;
  signal?: AbortSignal;
}): Promise<void> {
  const command = resolveCommand(options.ffmpegPath);
  await assertSuccess(
    command,
    [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      options.videoPath,
      "-i",
      options.audioPath,
      "-c",
      "copy",
      "-movflags",
      "+faststart",
      options.outputPath,
    ],
    options.signal,
  );
}

export interface MkvSubtitleInput {
  /** 本地字幕文件路径（SRT 或 ASS） */
  path: string;
  /** ISO 639-2 语言码，如 chi / eng */
  language: string;
  /** 轨道标题（展示名） */
  title: string;
  /** 字幕编码：srt（默认）或 ass（弹幕轨道） */
  codec?: "srt" | "ass";
}

/**
 * 合并 DASH 音视频 + 内嵌字幕（SRT/ASS）为 MKV（docs/blueprint.md §4）。
 * 命令要点：视频/音频/字幕流全部 copy，写入 language/title，首条字幕设为默认轨。
 */
export async function mergeDashToMkv(options: {
  ffmpegPath: string | null | undefined;
  videoPath: string;
  audioPath?: string | null;
  subtitles: MkvSubtitleInput[];
  outputPath: string;
  signal?: AbortSignal;
}): Promise<void> {
  const command = resolveCommand(options.ffmpegPath);
  const hasAudio = Boolean(options.audioPath);
  // 输入顺序：video = 0，audio = 1（可选），字幕依次排在其后
  const subtitleInputBase = hasAudio ? 2 : 1;
  const args: string[] = ["-y", "-hide_banner", "-loglevel", "error", "-i", options.videoPath];
  if (options.audioPath) args.push("-i", options.audioPath);
  for (const subtitle of options.subtitles) args.push("-i", subtitle.path);

  args.push("-map", "0:v:0");
  if (hasAudio) args.push("-map", "1:a:0");
  options.subtitles.forEach((_subtitle, index) => {
    args.push("-map", `${subtitleInputBase + index}:s:0`);
  });

  // 字幕输入本身已是 SRT/ASS，MKV 支持两者，直接 copy 避免重新编码
  args.push("-c", "copy");
  options.subtitles.forEach((subtitle, index) => {
    args.push("-metadata:s:s:" + index, "language=" + subtitle.language);
    args.push("-metadata:s:s:" + index, "title=" + subtitle.title);
  });
  if (options.subtitles.length > 0) args.push("-disposition:s:0", "default");
  args.push(options.outputPath);

  await assertSuccess(command, args, options.signal);
}

/** 支持 -movflags +faststart 的 MP4 系容器扩展名（flac 等原生音频容器不支持该参数）。 */
const FASTSTART_EXTENSIONS = new Set([".mp4", ".m4a", ".mov"]);

/** 输出文件是否需要 faststart 优化（仅 MP4 系容器需要）。 */
function needsFaststart(outputPath: string): boolean {
  return FASTSTART_EXTENSIONS.has(path.extname(outputPath).toLowerCase());
}

/** 单轨封装（音频转 m4a/flac、无音轨视频转 mp4）；仅 MP4 系容器追加 faststart。 */
export async function remuxToContainer(options: {
  ffmpegPath: string | null | undefined;
  inputPath: string;
  outputPath: string;
  signal?: AbortSignal;
}): Promise<void> {
  const command = resolveCommand(options.ffmpegPath);
  const args = ["-y", "-hide_banner", "-loglevel", "error", "-i", options.inputPath, "-c", "copy"];
  if (needsFaststart(options.outputPath)) args.push("-movflags", "+faststart");
  args.push(options.outputPath);
  await assertSuccess(command, args, options.signal);
}
