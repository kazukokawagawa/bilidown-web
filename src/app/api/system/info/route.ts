import { APP_VERSION } from "@/lib/constants";
import type { SystemInfo } from "@/lib/types";
import { detectFfmpeg } from "@/server/ffmpeg";
import { detectBrowserFfmpeg } from "@/server/ffmpeg-assets";
import { apiOk, errorToResponse } from "@/server/http";
import { isDirWritable, resolveDownloadDir } from "@/server/paths";
import { getSettings } from "@/server/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/system/info — 版本 / 平台 / ffmpeg / 浏览器 ffmpeg.wasm / 下载目录可写性。 */
export async function GET() {
  try {
    const settings = await getSettings();
    const downloadDir = resolveDownloadDir(settings.downloadDir);
    const [ffmpeg, downloadDirWritable] = await Promise.all([
      detectFfmpeg(settings.ffmpegPath),
      isDirWritable(downloadDir),
    ]);
    const info: SystemInfo = {
      version: APP_VERSION,
      platform: process.platform,
      ffmpeg,
      browserFfmpeg: detectBrowserFfmpeg(),
      downloadDir,
      downloadDirWritable,
    };
    return apiOk(info);
  } catch (error) {
    return errorToResponse(error);
  }
}
