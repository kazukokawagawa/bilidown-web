import type { TaskAction } from "@/lib/types";
import { getTaskManager } from "@/server/download/manager";
import { apiOk, errorToResponse, readJsonBody, requireEnum } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIONS: readonly TaskAction[] = ["pause", "resume", "cancel", "retry", "delete"];

/** POST /api/tasks/[id]/action — body: { action: pause|resume|cancel|retry|delete } */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = await readJsonBody(request);
    const action = requireEnum(body, "action", ACTIONS, "无效的 action，必须是 pause / resume / cancel / retry / delete");
    const task = await getTaskManager().act(id, action);
    if (action === "delete") return apiOk({ ok: true });
    return apiOk({ task });
  } catch (error) {
    return errorToResponse(error);
  }
}
