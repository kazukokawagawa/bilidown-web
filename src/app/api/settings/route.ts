import { getTaskManager } from "@/server/download/manager";
import { apiOk, errorToResponse, readJsonBody } from "@/server/http";
import { getPublicSettings, toPublicSettings, updateSettings } from "@/server/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/settings — PublicSettings（cookie 打码）。 */
export async function GET() {
  try {
    return apiOk({ settings: await getPublicSettings() });
  } catch (error) {
    return errorToResponse(error);
  }
}

/** PUT /api/settings — 局部更新（cookie 不允许通过该接口写入）。 */
export async function PUT(request: Request) {
  try {
    const body = await readJsonBody(request);
    const updated = await updateSettings(body);
    getTaskManager().notifySettingsChanged();
    return apiOk({ settings: toPublicSettings(updated) });
  } catch (error) {
    return errorToResponse(error);
  }
}
