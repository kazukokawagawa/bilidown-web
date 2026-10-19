import { getCookie } from "@/server/settings";
import { getPgcCollection, getVideoInfo, getVideoTags, resolveInput } from "@/server/bili/client";
import { apiOk, errorToResponse, HttpError, queryValue } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/bili/video?input= — 解析输入并获取视频信息（番剧会附带 season 剧集列表）。 */
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

    // 番剧：把 PGC season 的剧集列表（正片 + PV/预告等小节）挂到 collection，
    // 让首页可以像合集一样展示并批量下载。bv/av 输入用 view.redirect_url 兜底识别。
    try {
      const pgcCollection = await getPgcCollection(
        { epId: parsed.epId, seasonId: parsed.seasonId, redirectUrl: video.redirectUrl },
        cookie,
      );
      if (pgcCollection) video.collection = pgcCollection;
    } catch (error) {
      console.warn(
        "[bili] 获取番剧剧集列表失败，降级为单集信息:",
        error instanceof Error ? error.message : error,
      );
    }

    // 仅单 P 且没有合集/番剧剧集列表时才补充标签（此时首页展示视频详情卡片）。
    const collectionEpisodeCount = (video.collection?.sections ?? []).reduce(
      (total, section) => total + section.episodes.length,
      0,
    );
    if (video.pages.length <= 1 && collectionEpisodeCount <= 1) {
      try {
        const tags = await getVideoTags(video.bvid, cookie);
        if (tags.length > 0) video.tags = tags;
      } catch (error) {
        console.warn(
          "[bili] 获取视频标签失败:",
          error instanceof Error ? error.message : error,
        );
      }
    }

    return apiOk({ input: parsed, video });
  } catch (error) {
    return errorToResponse(error);
  }
}
