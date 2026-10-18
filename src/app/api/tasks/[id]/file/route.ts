import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

import { getTaskManager } from "@/server/download/manager";
import { apiError, contentDisposition, errorToResponse, HttpError } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ByteRange {
  start: number;
  end: number;
}

function contentTypeFor(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === ".mp4") return "video/mp4";
  if (ext === ".m4a") return "audio/mp4";
  if (ext === ".m4s") return "application/octet-stream";
  if (ext === ".mkv") return "video/x-matroska";
  return "application/octet-stream";
}

function parseByteRange(header: string, fileSize: number): ByteRange | "invalid" {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return "invalid";
  const startRaw = match[1];
  const endRaw = match[2];
  if (!startRaw && !endRaw) return "invalid";

  let start: number;
  let end: number;
  if (!startRaw) {
    const suffixLength = Number.parseInt(endRaw, 10);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return "invalid";
    start = Math.max(0, fileSize - suffixLength);
    end = fileSize - 1;
  } else {
    start = Number.parseInt(startRaw, 10);
    if (!Number.isFinite(start) || start < 0 || start >= fileSize) return "invalid";
    if (!endRaw) {
      end = fileSize - 1;
    } else {
      const parsedEnd = Number.parseInt(endRaw, 10);
      if (!Number.isFinite(parsedEnd)) return "invalid";
      end = Math.min(parsedEnd, fileSize - 1);
    }
  }
  if (end < start) return "invalid";
  return { start, end };
}

/** GET /api/tasks/[id]/file — 下载已完成文件（支持 Range）。 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const task = await getTaskManager().get(id);
    if (!task) throw new HttpError("任务不存在或已被删除", 404, "TASK_NOT_FOUND");
    if (!task.filePath || !task.fileName) throw new HttpError("任务尚未生成文件", 404, "TASK_FILE_NOT_READY");

    let fileSize: number;
    try {
      const stat = await fs.stat(task.filePath);
      if (!stat.isFile()) throw new Error("不是文件");
      fileSize = stat.size;
    } catch {
      throw new HttpError("文件不存在或已被移动", 404, "TASK_FILE_MISSING");
    }

    const headers: Record<string, string> = {
      "Content-Type": contentTypeFor(task.fileName),
      "Content-Disposition": contentDisposition(task.fileName),
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-store",
    };

    const rangeHeader = request.headers.get("range");
    if (rangeHeader) {
      const range = parseByteRange(rangeHeader, fileSize);
      if (range === "invalid") {
        return apiError("请求的 Range 不合法", 416, "INVALID_RANGE");
      }
      const chunkSize = range.end - range.start + 1;
      headers["Content-Range"] = "bytes " + range.start + "-" + range.end + "/" + fileSize;
      headers["Content-Length"] = String(chunkSize);
      const stream = createReadStream(task.filePath, { start: range.start, end: range.end });
      return new Response(Readable.toWeb(stream) as unknown as ReadableStream<Uint8Array>, {
        status: 206,
        headers,
      });
    }

    headers["Content-Length"] = String(fileSize);
    const stream = createReadStream(task.filePath);
    return new Response(Readable.toWeb(stream) as unknown as ReadableStream<Uint8Array>, {
      status: 200,
      headers,
    });
  } catch (error) {
    return errorToResponse(error);
  }
}
