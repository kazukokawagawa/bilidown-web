import type { Codec } from "@/lib/types";
import { getPlayStreams } from "@/server/bili/client";
import { apiOk, errorToResponse, HttpError, optionalQuery, optionalQueryInt, requireQuery } from "@/server/http";
import { getSettings } from "@/server/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CODECS: readonly Codec[] = ["avc", "hevc", "av1"];

/** GET /api/bili/streams?bvid=&cid=&qn=&codec=&audioOnly=&duration= — 清晰度列表 + DASH 播放流。 */
export async function GET(request: Request) {
  try {
    const bvid = requireQuery(request, "bvid", "缺少 bvid 参数");
    if (!/^BV[0-9A-Za-z]{10}$/.test(bvid)) throw new HttpError("bvid 格式不正确", 400, "INVALID_BVID");
    const cid = optionalQueryInt(request, "cid");
    if (!cid || cid <= 0) throw new HttpError("缺少或非法的 cid 参数", 400, "INVALID_CID");

    const settings = await getSettings();
    const qn = optionalQueryInt(request, "qn") ?? settings.defaultQn;
    const codecParam = optionalQuery(request, "codec");
    const codec: Codec = codecParam && CODECS.includes(codecParam as Codec) ? (codecParam as Codec) : settings.preferCodec;
    const audioOnlyParam = optionalQuery(request, "audioOnly");
    const audioOnly = audioOnlyParam === "1" || audioOnlyParam === "true";
    const duration = optionalQueryInt(request, "duration") ?? 0;

    const result = await getPlayStreams({
      bvid,
      cid,
      qn,
      codec,
      audioOnly,
      cookie: settings.cookie,
      duration: duration > 0 ? duration : undefined,
    });
    return apiOk(result);
  } catch (error) {
    return errorToResponse(error);
  }
}
