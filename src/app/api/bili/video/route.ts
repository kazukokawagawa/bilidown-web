import { getCookie } from "@/server/settings";
import { getVideoInfo, resolveInput } from "@/server/bili/client";
import { apiOk, errorToResponse, HttpError, queryValue } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/bili/video?input= — 解析输入并获取视频信息。 */
export async function GET(request: Request) {
  try {
    const input = queryValue(request, "input");
    if (!input || !input.trim()) throw new HttpError("缺少 input 参数", 400, "MISSING_INPUT");
    const cookie = await getCookie();
    const parsed = await resolveInput(input.trim(), cookie);
    if (!parsed.bvid && !parsed.aid) {
      throw new HttpError("无法从输入中解析出视频编号，请检查链接", 400, "INVALID_INPUT");
    }
    const video = await getVideoInfo({ bvid: parsed.bvid, aid: parsed.aid }, cookie);
    return apiOk({ input: parsed, video });
  } catch (error) {
    return errorToResponse(error);
  }
}
