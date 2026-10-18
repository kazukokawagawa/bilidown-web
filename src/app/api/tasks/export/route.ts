import { getTaskManager } from "@/server/download/manager";
import { contentDisposition, errorToResponse } from "@/server/http";
import { timestampSlug } from "@/server/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/tasks/export — 导出任务 JSON（attachment）。 */
export async function GET() {
  try {
    const tasks = await getTaskManager().list();
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      tasks,
    };
    const fileName = "bilidown-tasks-" + timestampSlug() + ".json";
    return new Response(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": contentDisposition(fileName),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return errorToResponse(error);
  }
}
