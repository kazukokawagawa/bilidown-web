import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { runProcess } from "@/server/ffmpeg";
import { errorToResponse, HttpError } from "@/server/http";
import { getSettings } from "@/server/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;
const FFMPEG_TIMEOUT_MS = 10 * 60 * 1000;

async function saveUpload(formData: FormData, field: string, workDir: string): Promise<{ file: File; filePath: string }> {
  const file = formData.get(field);
  if (!(file instanceof File)) throw new HttpError("缺少 " + field + " 字段", 400, "MISSING_FILE");
  if (file.size <= 0) throw new HttpError(field + " 文件为空", 400, "EMPTY_FILE");
  if (file.size > MAX_UPLOAD_BYTES) throw new HttpError(file.name + " 文件过大（上限 500MB）", 413, "FILE_TOO_LARGE");
  const filePath = path.join(workDir, field + (path.extname(file.name) || ".bin"));
  await fs.writeFile(filePath, Buffer.from(await file.arrayBuffer()));
  return { file, filePath };
}

/** POST /api/tools/mux — multipart 上传 audio/video，ffmpeg 无损封装为 mp4 返回（工具页）。 */
export async function POST(request: Request) {
  const workDir = path.join(os.tmpdir(), "bilidown-tools", randomUUID());
  try {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      throw new HttpError("请求必须是 multipart/form-data 且包含 audio、video 字段", 400, "INVALID_FORM");
    }
    await fs.mkdir(workDir, { recursive: true });
    const { file: audioFile, filePath: audioPath } = await saveUpload(formData, "audio", workDir);
    const { filePath: videoPath } = await saveUpload(formData, "video", workDir);
    const outputPath = path.join(workDir, "output.mp4");

    const settings = await getSettings();
    const result = await runProcess(
      settings.ffmpegPath || "ffmpeg",
      [
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        audioPath,
        "-i",
        videoPath,
        "-strict",
        "-2",
        "-acodec",
        "copy",
        "-vcodec",
        "copy",
        "-f",
        "mp4",
        outputPath,
      ],
      { timeoutMs: FFMPEG_TIMEOUT_MS },
    );
    if (result.code !== 0) {
      throw new HttpError(
        "ffmpeg 封装失败：" + (result.stderr.trim().split(/\r?\n/).slice(-2).join(" ") || "未知错误"),
        500,
        "FFMPEG_FAILED",
      );
    }
    const data = await fs.readFile(outputPath);
    const fileName = (audioFile.name.replace(/\.[^.]+$/, "") || "output") + ".mp4";
    return new Response(new Uint8Array(data), {
      status: 200,
      headers: {
        "Content-Type": "video/mp4",
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
