import type { DownloadTask } from "@/lib/types";
import { getTaskManager } from "@/server/download/manager";
import { apiOk, errorToResponse, HttpError } from "@/server/http";
import { normalizeTask } from "@/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const XOR_MASK = 54;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 解析导入内容：优先按普通 JSON；失败时按原应用 .bilidownexport 约定整段 XOR 54 再解析。 */
function parseImportPayload(buffer: Buffer): unknown {
  const text = buffer.toString("utf8").replace(/^\uFEFF/, "").trim();
  try {
    return JSON.parse(text);
  } catch {
    // fall through：尝试 XOR 54（原 Electron 应用的导出格式）
  }
  const decoded = Buffer.from(Array.from(buffer, (byte) => byte ^ XOR_MASK))
    .toString("utf8")
    .replace(/^\uFEFF/, "")
    .trim();
  try {
    return JSON.parse(decoded);
  } catch {
    throw new HttpError("导入文件既不是合法 JSON，也不是可解码的 .bilidownexport 文件", 400, "INVALID_IMPORT");
  }
}

/** POST /api/tasks/import — body: { version: 1, tasks: [...] }（兼容 XOR 54 的旧导出）。 */
export async function POST(request: Request) {
  try {
    const buffer = Buffer.from(await request.arrayBuffer());
    if (!buffer.length) throw new HttpError("导入内容为空", 400, "EMPTY_BODY");
    const payload = parseImportPayload(buffer);
    if (!isRecord(payload) || payload.version !== 1 || !Array.isArray(payload.tasks)) {
      throw new HttpError("导入格式不正确，需要 { version: 1, tasks: [] }", 400, "INVALID_IMPORT");
    }
    const tasks: DownloadTask[] = [];
    for (const item of payload.tasks) {
      const task = normalizeTask(item);
      if (task) tasks.push(task);
    }
    if (!tasks.length) throw new HttpError("导入文件中没有可用的任务", 400, "INVALID_IMPORT");
    const imported = await getTaskManager().importTasks(tasks);
    return apiOk({ imported });
  } catch (error) {
    return errorToResponse(error);
  }
}
