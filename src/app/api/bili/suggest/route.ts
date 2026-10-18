import { getSuggest } from "@/server/bili/client";
import { apiOk, errorToResponse, requireQuery } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/bili/suggest?term= — 搜索联想。 */
export async function GET(request: Request) {
  try {
    const term = requireQuery(request, "term", "缺少 term 参数");
    const items = await getSuggest(term);
    return apiOk({ items });
  } catch (error) {
    return errorToResponse(error);
  }
}
