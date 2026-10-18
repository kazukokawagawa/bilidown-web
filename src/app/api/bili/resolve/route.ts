import { resolveInput } from "@/server/bili/client";
import { apiOk, errorToResponse, HttpError, readJsonBody } from "@/server/http";
import { getCookie } from "@/server/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/bili/resolve — 解析任意输入（工具页）。body: { input } */
export async function POST(request: Request) {
  try {
    const body = await readJsonBody(request);
    const input = body.input;
    if (typeof input !== "string" || !input.trim()) throw new HttpError("缺少 input 参数", 400, "MISSING_INPUT");
    const cookie = await getCookie();
    const parsed = await resolveInput(input.trim(), cookie);
    return apiOk(parsed);
  } catch (error) {
    return errorToResponse(error);
  }
}
