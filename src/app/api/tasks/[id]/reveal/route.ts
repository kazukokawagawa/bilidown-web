import { getTaskManager } from "@/server/download/manager";
import { apiOk, errorToResponse, HttpError } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/tasks/[id]/reveal — 返回文件绝对路径（浏览器无法打开资源管理器，UI 展示/复制）。 */
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const task = await getTaskManager().get(id);
    if (!task) throw new HttpError("任务不存在或已被删除", 404, "TASK_NOT_FOUND");
    if (!task.filePath) throw new HttpError("任务尚未生成文件", 404, "TASK_FILE_NOT_READY");
    return apiOk({ path: task.filePath });
  } catch (error) {
    return errorToResponse(error);
  }
}
