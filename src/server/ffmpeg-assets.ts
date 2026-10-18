import fs from "node:fs";
import path from "node:path";

import type { BrowserFfmpegInfo } from "@/lib/types";

/**
 * 浏览器端 ffmpeg.wasm 资源检测。
 *
 * 资源由 scripts/prepare-ffmpeg-wasm.mjs 从 node_modules 复制到 public/ffmpeg/：
 * - classes.js / worker.js / const.js / errors.js / utils.js：@ffmpeg/ffmpeg 的 ESM 封装
 * - ffmpeg-core.js / ffmpeg-core.wasm：@ffmpeg/core 单线程核心（约 31MB）
 *
 * 运行期 cwd 即服务根目录（dev 为项目根，standalone/Electron 为 .next/standalone 或
 * resources/app，public 已由 scripts/prepare-standalone.mjs 复制过去），因此用
 * process.cwd()/public/ffmpeg 定位即可。
 */

const CACHE_TTL_MS = 60 * 1000;

/** 浏览器合并依赖的最小资源集合；缺任意一个就视为不可用。 */
const REQUIRED_FILES = ["ffmpeg-core.wasm", "ffmpeg-core.js", "classes.js", "worker.js"] as const;

interface CacheEntry {
  at: number;
  info: BrowserFfmpegInfo;
}

function cacheSlot(): { entry: CacheEntry | null } {
  const scope = globalThis as unknown as { __bilidownBrowserFfmpeg?: { entry: CacheEntry | null } };
  scope.__bilidownBrowserFfmpeg ??= { entry: null };
  return scope.__bilidownBrowserFfmpeg;
}

export function browserFfmpegDir(): string {
  return path.join(process.cwd(), "public", "ffmpeg");
}

function readVersion(dir: string): string | null {
  try {
    const raw = fs.readFileSync(path.join(dir, "prepared.json"), "utf8");
    const parsed = JSON.parse(raw) as { packages?: Record<string, string> };
    return parsed.packages?.["@ffmpeg/core"] ?? null;
  } catch {
    return null;
  }
}

/** 检测浏览器端 ffmpeg.wasm 资源是否可用（结果缓存 60s）。 */
export function detectBrowserFfmpeg(): BrowserFfmpegInfo {
  const slot = cacheSlot();
  if (slot.entry && Date.now() - slot.entry.at < CACHE_TTL_MS) return slot.entry.info;

  let info: BrowserFfmpegInfo = { available: false, version: null, coreBytes: null };
  try {
    const dir = browserFfmpegDir();
    const available = REQUIRED_FILES.every((file) => {
      try {
        return fs.statSync(path.join(dir, file)).isFile();
      } catch {
        return false;
      }
    });
    if (available) {
      let coreBytes: number | null = null;
      try {
        coreBytes = fs.statSync(path.join(dir, "ffmpeg-core.wasm")).size;
      } catch {
        coreBytes = null;
      }
      info = { available: true, version: readVersion(dir), coreBytes };
    }
  } catch {
    info = { available: false, version: null, coreBytes: null };
  }

  slot.entry = { at: Date.now(), info };
  return info;
}

export function clearBrowserFfmpegCache(): void {
  cacheSlot().entry = null;
}
