import { spawn } from "node:child_process";

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

/** 单轨封装（音频转 m4a / 无音轨视频转 mp4）。 */
export async function remuxToContainer(options: {
  ffmpegPath: string | null | undefined;
  inputPath: string;
  outputPath: string;
  signal?: AbortSignal;
}): Promise<void> {
  const command = resolveCommand(options.ffmpegPath);
  await assertSuccess(
    command,
    ["-y", "-hide_banner", "-loglevel", "error", "-i", options.inputPath, "-c", "copy", "-movflags", "+faststart", options.outputPath],
    options.signal,
  );
}
