import { getNav } from "@/server/bili/client";
import { apiOk, errorToResponse } from "@/server/http";
import { getCookie } from "@/server/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/bili/nav — 当前登录态。 */
export async function GET() {
  try {
    const cookie = await getCookie();
    const nav = await getNav(cookie);
    return apiOk(nav);
  } catch (error) {
    return errorToResponse(error);
  }
}
