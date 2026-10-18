import type { CreateTaskInput, Codec } from "@/lib/types";
import { getTaskManager } from "@/server/download/manager";
import {
  apiOk,
  errorToResponse,
  HttpError,
  optionalBoolean,
  optionalEnum,
  optionalInteger,
  optionalString,
  readJsonBody,
  requireInteger,
  requireQuery,
  requireString,
} from "@/server/http";
import { getSettings } from "@/server/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CODECS: readonly Codec[] = ["avc", "hevc", "av1"];
const BVID_PATTERN = /^BV[0-9A-Za-z]{10}$/;

/** GET /api/tasks — 任务列表（createdAt 倒序）。 */
export async function GET() {
  try {
    const tasks = await getTaskManager().list();
    return apiOk({ tasks });
  } catch (error) {
    return errorToResponse(error);
  }
}

/** POST /api/tasks — 创建并排队。body: CreateTaskInput */
export async function POST(request: Request) {
  try {
    const body = await readJsonBody(request);
    const settings = await getSettings();

    const bvid = requireString(body, "bvid", "缺少 bvid", 20);
    if (!BVID_PATTERN.test(bvid)) throw new HttpError("bvid 格式不正确", 400, "INVALID_BVID");
    const cid = requireInteger(body, "cid", "缺少 cid", 1);
    const aid = optionalInteger(body, "aid", 0, 0);
    const page = optionalInteger(body, "page", 1, 1);
    const qn = optionalInteger(body, "qn", settings.defaultQn, 1);
    const codec = optionalEnum(body, "codec", CODECS, settings.preferCodec);
    const title = requireString(body, "title", "缺少 title", 500);
    const partTitle = optionalString(body, "partTitle", title, 500) ?? title;
    const cover = optionalString(body, "cover", "", 2000) ?? "";
    const upName = optionalString(body, "upName", "", 200) ?? "";
    const audioOnly = optionalBoolean(body, "audioOnly", false);
    const embedSubtitles = optionalBoolean(body, "embedSubtitles", settings.embedSubtitles);
    const sourceUrl =
      optionalString(body, "sourceUrl", "https://www.bilibili.com/video/" + bvid, 2000) ??
      "https://www.bilibili.com/video/" + bvid;

    const input: CreateTaskInput = {
      bvid,
      aid,
      cid,
      page,
      title,
      partTitle,
      cover,
      upName,
      qn,
      codec,
      audioOnly,
      sourceUrl,
      embedSubtitles,
    };
    const task = await getTaskManager().create(input);
    return apiOk({ task }, 201);
  } catch (error) {
    return errorToResponse(error);
  }
}

/** DELETE /api/tasks?status=completed|error|all — 批量清理。 */
export async function DELETE(request: Request) {
  try {
    const status = requireQuery(request, "status", "缺少 status 参数（completed / error / all）");
    if (status !== "completed" && status !== "error" && status !== "all") {
      throw new HttpError("status 必须是 completed / error / all 之一", 400, "INVALID_STATUS");
    }
    const removed = await getTaskManager().clear(status);
    return apiOk({ removed });
  } catch (error) {
    return errorToResponse(error);
  }
}
