import type { SearchResponse } from "@/lib/types";
import { search } from "@/server/bili/client";
import { apiError, apiOk, errorMessage, optionalQuery, optionalQueryInt, requireQuery } from "@/server/http";
import { getCookie } from "@/server/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/bili/search?keyword=&type=video|user&page=&order=
 * 使用 WBI 签名接口；失败自动降级旧接口；仍失败返回 code=SEARCH_UNAVAILABLE。
 */
export async function GET(request: Request) {
  const keyword = requireQuery(request, "keyword", "缺少 keyword 参数");
  const typeParam = optionalQuery(request, "type") ?? "video";
  if (typeParam !== "video" && typeParam !== "user") {
    return apiError("type 必须是 video 或 user", 400, "INVALID_TYPE");
  }
  const page = optionalQueryInt(request, "page") ?? 1;
  const order = optionalQuery(request, "order") ?? undefined;
  try {
    const cookie = await getCookie();
    const result: SearchResponse = await search({ keyword, type: typeParam, page, order, cookie });
    return apiOk(result);
  } catch (error) {
    console.error("[api] 搜索失败:", errorMessage(error));
    return apiError(errorMessage(error), 502, "SEARCH_UNAVAILABLE");
  }
}
