import type { FFmpeg as FfmpegInstance, LogEvent, ProgressEvent } from "@ffmpeg/ffmpeg";

import { formatBytes } from "./format";

/**
 * 浏览器端 ffmpeg.wasm 合并（服务端没有 ffmpeg 时的兜底能力）。
 *
 * 设计要点：
 * - 资源不走打包器：public/ffmpeg/ 下是从 node_modules 复制出来的 @ffmpeg/ffmpeg 封装
 *   与 @ffmpeg/core 单线程核心（scripts/prepare-ffmpeg-wasm.mjs 生成），运行时用原生
 *   `import()` + module worker 懒加载，构建链与 Next/Turbopack 完全解耦；
 * - 单线程核心不需要 SharedArrayBuffer，因此无需 COOP/COEP 响应头，手机浏览器（iOS
 *   Safari 16+ / Android Chrome）也可用；首次点击时才下载约 31MB 的 wasm，之后走浏览器
 *   缓存；
 * - 只做 `-c copy` 无损封装：把服务端已下载好的 video.m4s + audio.m4s 合成 mp4；
 *   若音轨编码无法放进 mp4（如 Hi-Res FLAC），自动回退 mkv 容器；
 * - 同一时刻只跑一个合并任务（队列串行），避免手机内存峰值翻倍。
 */

export type BrowserFfmpegStage = "engine" | "video" | "audio" | "merge";

export interface BrowserFfmpegProgress {
  stage: BrowserFfmpegStage;
  /** 面向用户的阶段描述（可直接展示） */
  label: string;
  /** 0~1；无法计算时为 null（合并阶段通常没有精确进度） */
  ratio: number | null;
  loadedBytes?: number;
  totalBytes?: number;
}

export interface BrowserMergeResult {
  blob: Blob;
  fileName: string;
}

export interface MergeVideoAudioOptions {
  video: Blob | Uint8Array;
  audio?: Blob | Uint8Array | null;
  /** 期望输出文件名（扩展名 .mp4，无法放入 mp4 时输出 .mkv） */
  fileName: string;
  onProgress?: (progress: BrowserFfmpegProgress) => void;
}

type FfmpegConstructor = new () => FfmpegInstance;

interface EngineState {
  promise: Promise<FfmpegInstance> | null;
  instance: FfmpegInstance | null;
  error: Error | null;
  loadingListeners: Set<(progress: BrowserFfmpegProgress) => void>;
}

const ENGINE_STATE: EngineState = {
  promise: null,
  instance: null,
  error: null,
  loadingListeners: new Set(),
};

const engineLogs: string[] = [];
const MAX_ENGINE_LOGS = 60;
const ASSET_BASE = "/ffmpeg";

/* ---------------------------------------------------------------- 资源/加载 */

function assetUrl(file: string): string {
  return new URL(ASSET_BASE + "/" + file, window.location.href).href;
}

function engineProgressLabel(loadedBytes: number, totalBytes: number): string {
  if (totalBytes > 0) {
    return "正在加载 ffmpeg 引擎 " + formatBytes(loadedBytes) + " / " + formatBytes(totalBytes);
  }
  return "正在加载 ffmpeg 引擎（首次约 31MB）";
}

function emitEngineProgress(progress: BrowserFfmpegProgress): void {
  for (const listener of ENGINE_STATE.loadingListeners) {
    try {
      listener(progress);
    } catch {
      // 监听器异常不影响加载流程
    }
  }
}

async function fetchBlobUrl(
  url: string,
  mimeType: string,
  onProgress: (loadedBytes: number, totalBytes: number) => void,
): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("浏览器版 ffmpeg 资源加载失败（HTTP " + response.status + "）：" + url);
  }
  const totalHeader = Number(response.headers.get("content-length") ?? 0);
  const totalBytes = Number.isFinite(totalHeader) && totalHeader > 0 ? totalHeader : 0;

  if (!response.body) {
    const buffer = new Uint8Array(await response.arrayBuffer());
    onProgress(buffer.byteLength, totalBytes || buffer.byteLength);
    return URL.createObjectURL(new Blob([buffer], { type: mimeType }));
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loadedBytes = 0;
  onProgress(0, totalBytes);
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value || value.byteLength === 0) continue;
    chunks.push(value);
    loadedBytes += value.byteLength;
    onProgress(loadedBytes, totalBytes);
  }
  const blob = new Blob(chunks as BlobPart[], { type: mimeType });
  return URL.createObjectURL(blob);
}

/**
 * 用原生 `import()` 加载 public/ffmpeg/classes.js。
 * 用 Function 构造而非字面量 `import("/ffmpeg/classes.js")`，避免 Next/Turbopack 把
 * 该路径当成构建期模块去解析（它只是运行期静态资源）。
 */
async function importFfmpegClass(): Promise<FfmpegConstructor> {
  const dynamicImport = new Function("url", "return import(url)") as (
    url: string,
  ) => Promise<{ FFmpeg?: FfmpegConstructor }>;
  const loaded = await dynamicImport(assetUrl("classes.js"));
  if (!loaded || typeof loaded.FFmpeg !== "function") {
    throw new Error("浏览器版 ffmpeg 模块格式不正确（缺少 FFmpeg 导出）");
  }
  return loaded.FFmpeg;
}

function assertSupported(): void {
  if (typeof window === "undefined") throw new Error("浏览器端 ffmpeg 只能在浏览器中使用");
  if (typeof Worker === "undefined" || typeof WebAssembly === "undefined") {
    throw new Error("当前浏览器不支持 Web Worker / WebAssembly，无法使用浏览器端 ffmpeg");
  }
}

function describeLogs(): string {
  const lines = engineLogs
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("frame=") && !line.startsWith("size="))
    .slice(-3);
  return lines.length > 0 ? "（" + lines.join(" | ").slice(0, 300) + "）" : "";
}

async function createEngine(): Promise<FfmpegInstance> {
  try {
    assertSupported();
    const Ffmpeg = await importFfmpegClass();
    const ffmpeg = new Ffmpeg();
    ffmpeg.on("log", (event: LogEvent) => {
      engineLogs.push(event.message);
      if (engineLogs.length > MAX_ENGINE_LOGS) engineLogs.shift();
    });

    let wasmBlobUrl: string | null = null;
    try {
      wasmBlobUrl = await fetchBlobUrl(assetUrl("ffmpeg-core.wasm"), "application/wasm", (loaded, total) => {
        emitEngineProgress({
          stage: "engine",
          label: engineProgressLabel(loaded, total),
          ratio: total > 0 ? Math.min(1, loaded / total) : null,
          loadedBytes: loaded,
          totalBytes: total,
        });
      });
      await ffmpeg.load({
        classWorkerURL: assetUrl("worker.js"),
        coreURL: assetUrl("ffmpeg-core.js"),
        wasmURL: wasmBlobUrl,
      });
    } finally {
      if (wasmBlobUrl) URL.revokeObjectURL(wasmBlobUrl);
    }

    emitEngineProgress({ stage: "engine", label: "ffmpeg 引擎已就绪", ratio: 1 });
    return ffmpeg;
  } catch (error) {
    const detail = error instanceof Error && error.message ? error.message : String(error);
    throw new Error("浏览器端 ffmpeg 加载失败：" + detail + describeLogs());
  }
}

/**
 * 懒加载浏览器端 ffmpeg（全局单例，后续合并不再重复加载）。
 * 加载期间可通过 onProgress 拿到 wasm 下载进度；已加载时立即返回。
 */
export async function loadBrowserFfmpeg(
  onProgress?: (progress: BrowserFfmpegProgress) => void,
): Promise<FfmpegInstance> {
  if (ENGINE_STATE.instance) return ENGINE_STATE.instance;
  if (ENGINE_STATE.error) throw ENGINE_STATE.error;

  if (!ENGINE_STATE.promise) {
    ENGINE_STATE.promise = createEngine().then(
      (ffmpeg) => {
        ENGINE_STATE.instance = ffmpeg;
        return ffmpeg;
      },
      (error: unknown) => {
        ENGINE_STATE.promise = null;
        ENGINE_STATE.error = error instanceof Error ? error : new Error(String(error));
        throw ENGINE_STATE.error;
      },
    );
  }

  if (onProgress) ENGINE_STATE.loadingListeners.add(onProgress);
  try {
    return await ENGINE_STATE.promise;
  } finally {
    if (onProgress) ENGINE_STATE.loadingListeners.delete(onProgress);
  }
}

/** 是否已经加载过引擎（不触发加载）。 */
export function isBrowserFfmpegReady(): boolean {
  return ENGINE_STATE.instance !== null;
}

/** 引擎加载失败后可在下次用户重试时清除错误（例如资源重新生成后）。 */
export function resetBrowserFfmpeg(): void {
  if (ENGINE_STATE.instance) return;
  ENGINE_STATE.error = null;
  ENGINE_STATE.promise = null;
  engineLogs.length = 0;
}

/* ------------------------------------------------------------------ 取流 */

/**
 * 下载一个分片到内存，带字节进度。用于从服务端取回 video.m4s / audio.m4s。
 */
export async function fetchBytesWithProgress(
  url: string,
  onProgress?: (loadedBytes: number, totalBytes: number) => void,
): Promise<Uint8Array> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    let detail = "";
    try {
      const body = (await response.json()) as { error?: unknown };
      if (body && typeof body.error === "string") detail = "：" + body.error;
    } catch {
      // 非 JSON 错误响应
    }
    throw new Error("分片下载失败（HTTP " + response.status + "）" + detail);
  }

  const totalHeader = Number(response.headers.get("content-length") ?? 0);
  const totalBytes = Number.isFinite(totalHeader) && totalHeader > 0 ? totalHeader : 0;
  if (!response.body) {
    const buffer = new Uint8Array(await response.arrayBuffer());
    onProgress?.(buffer.byteLength, totalBytes || buffer.byteLength);
    return buffer;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loadedBytes = 0;
  onProgress?.(0, totalBytes);
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value || value.byteLength === 0) continue;
    chunks.push(value);
    loadedBytes += value.byteLength;
    onProgress?.(loadedBytes, totalBytes);
  }

  const output = new Uint8Array(loadedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

/* ------------------------------------------------------------------ 合并 */

const MERGE_QUEUE: { tail: Promise<unknown> } = { tail: Promise.resolve() };

function renameToMkv(fileName: string): string {
  if (/\.mkv$/i.test(fileName)) return fileName;
  if (/\.mp4$/i.test(fileName)) return fileName.replace(/\.mp4$/i, ".mkv");
  return fileName + ".mkv";
}

async function toBytes(input: Blob | Uint8Array): Promise<Uint8Array> {
  if (input instanceof Uint8Array) return input;
  return new Uint8Array(await input.arrayBuffer());
}

interface MergePlan {
  args: string[];
  outputName: string;
  mimeType: string;
  fileName: string;
}

function buildMergePlans(
  tag: string,
  videoName: string,
  audioName: string | null,
  desiredFileName: string,
): MergePlan[] {
  const inputs = ["-i", videoName, ...(audioName ? ["-i", audioName] : [])];
  const maps = audioName ? ["-map", "0:v:0", "-map", "1:a:0"] : ["-map", "0:v:0"];
  const baseArgs = ["-hide_banner", "-loglevel", "error", ...inputs, ...maps, "-c", "copy"];
  return [
    {
      args: [...baseArgs, "-movflags", "+faststart", "out-" + tag + ".mp4"],
      outputName: "out-" + tag + ".mp4",
      mimeType: "video/mp4",
      fileName: /\.mp4$/i.test(desiredFileName)
        ? desiredFileName
        : desiredFileName.replace(/\.[^.]+$/, "") + ".mp4",
    },
    {
      args: [...baseArgs, "out-" + tag + ".mkv"],
      outputName: "out-" + tag + ".mkv",
      mimeType: "video/x-matroska",
      fileName: renameToMkv(desiredFileName),
    },
  ];
}

function takeLogTail(): string {
  const lines = engineLogs
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("frame=") && !line.startsWith("size="))
    .slice(-3);
  return lines.length > 0 ? "（" + lines.join(" | ").slice(0, 300) + "）" : "";
}

async function executeMerge(options: MergeVideoAudioOptions): Promise<BrowserMergeResult> {
  const { onProgress } = options;
  const ffmpeg = await loadBrowserFfmpeg(onProgress);
  const tag = Math.random().toString(36).slice(2, 10);
  const hasAudio = Boolean(options.audio);
  const videoName = "in-" + tag + "-video.m4s";
  const audioName = "in-" + tag + "-audio.m4s";

  const onFfmpegProgress = (event: ProgressEvent) => {
    onProgress?.({
      stage: "merge",
      label: "正在合并音视频…" + (event.progress > 0 ? " " + Math.round(event.progress * 100) + "%" : ""),
      ratio: event.progress > 0 ? Math.min(1, event.progress) : null,
    });
  };

  const plans = buildMergePlans(
    tag,
    videoName,
    hasAudio ? audioName : null,
    options.fileName || "output.mp4",
  );
  let plan: MergePlan | null = null;
  let outputName: string | null = null;

  ffmpeg.on("progress", onFfmpegProgress);
  try {
    onProgress?.({ stage: "merge", label: "正在准备合并…", ratio: null });

    const videoData = await toBytes(options.video);
    await ffmpeg.writeFile(videoName, videoData);
    if (hasAudio && options.audio) {
      const audioData = await toBytes(options.audio);
      await ffmpeg.writeFile(audioName, audioData);
    }

    let lastCode: number | null = null;
    for (const candidate of plans) {
      let code = -1;
      try {
        code = await ffmpeg.exec(candidate.args);
      } catch (error) {
        // worker/core 抛错时继续尝试下一个容器
        lastCode = -1;
        if (error instanceof Error && error.message) engineLogs.push(error.message);
        continue;
      }
      if (code === 0) {
        plan = candidate;
        outputName = candidate.outputName;
        break;
      }
      lastCode = code;
    }

    if (!plan || !outputName) {
      throw new Error("ffmpeg 合并失败（退出码 " + String(lastCode) + "）" + takeLogTail());
    }

    const output = await ffmpeg.readFile(outputName);
    if (!(output instanceof Uint8Array)) {
      throw new Error("ffmpeg 输出读取失败");
    }
    const copy = output.slice();

    return {
      blob: new Blob([copy.buffer], { type: plan.mimeType }),
      fileName: plan.fileName,
    };
  } finally {
    ffmpeg.off("progress", onFfmpegProgress);
    // 释放 WASM 文件系统里的分片与输出，避免连续合并时内存持续增长
    const cleanup = [videoName, audioName, "out-" + tag + ".mp4", "out-" + tag + ".mkv"];
    await Promise.all(
      cleanup.map((name) => ffmpeg.deleteFile(name).catch(() => undefined)),
    ).catch(() => undefined);
  }
}

/**
 * 在浏览器内把视频分片与音频分片无损封装为 MP4（失败时回退 MKV）。
 * 输入可以是服务端分片 URL 下载好的字节，也可以是用户本地选择的 File/Blob。
 */
export async function mergeVideoAudioInBrowser(options: MergeVideoAudioOptions): Promise<BrowserMergeResult> {
  const run = () => executeMerge(options);
  const next = MERGE_QUEUE.tail.then(run, run);
  MERGE_QUEUE.tail = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}
