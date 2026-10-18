import { apiOk, errorToResponse } from "@/server/http";
import { clearCookie } from "@/server/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/bili/logout — 清除服务端保存的 cookie。 */
export async function POST() {
  try {
    await clearCookie();
    return apiOk({ ok: true });
  } catch (error) {
    return errorToResponse(error);
  }
}
