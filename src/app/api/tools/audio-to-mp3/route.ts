import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { runProcess } from "@/server/ffmpeg";
import { errorToResponse, HttpError } from "@/server/http";
import { getSettings } from "@/server/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;
const FFMPEG_TIMEOUT_MS = 5 * 60 * 1000;

/** POST /api/tools/audio-to-mp3 — multipart 上传音频，ffmpeg 转为 mp3 返回（工具页）。 */
export async function POST(request: Request) {
  const workDir = path.join(os.tmpdir(), "bilidown-tools", randomUUID());
  try {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      throw new HttpError("请求必须是 multipart/form-data 且包含 file 字段", 400, "INVALID_FORM");
    }
    const file = formData.get("file");
    if (!(file instanceof File)) throw new HttpError("缺少 file 字段", 400, "MISSING_FILE");
    if (file.size <= 0) throw new HttpError("上传文件为空", 400, "EMPTY_FILE");
    if (file.size > MAX_UPLOAD_BYTES) throw new HttpError("文件过大（上限 200MB）", 413, "FILE_TOO_LARGE");

    await fs.mkdir(workDir, { recursive: true });
    const inputPath = path.join(workDir, "input" + (path.extname(file.name) || ".bin"));
    await fs.writeFile(inputPath, Buffer.from(await file.arrayBuffer()));
    const outputPath = path.join(workDir, "output.mp3");

    const settings = await getSettings();
    const result = await runProcess(
      settings.ffmpegPath || "ffmpeg",
      ["-y", "-hide_banner", "-loglevel", "error", "-i", inputPath, "-q:a", "0", "-map", "a", "-f", "mp3", outputPath],
      { timeoutMs: FFMPEG_TIMEOUT_MS },
    );
    if (result.code !== 0) {
      throw new HttpError(
        "ffmpeg 转码失败：" + (result.stderr.trim().split(/\r?\n/).slice(-2).join(" ") || "未知错误"),
        500,
        "FFMPEG_FAILED",
      );
    }
    const data = await fs.readFile(outputPath);
    const fileName = (file.name.replace(/\.[^.]+$/, "") || "audio") + ".mp3";
    return new Response(new Uint8Array(data), {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Disposition": 'attachment; filename="' + fileName.replace(/[^\x20-\x7e]/g, "_") + '"',
        "Content-Length": String(data.byteLength),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return errorToResponse(error);
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
