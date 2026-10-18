import type { LoginPollResponse } from "@/lib/types";
import { getNav, pollQrcode } from "@/server/bili/client";
import { apiOk, errorToResponse, requireQuery } from "@/server/http";
import { saveCookie } from "@/server/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/bili/login/poll?key= — 轮询扫码状态；confirmed 时保存 cookie 到服务端设置。 */
export async function GET(request: Request) {
  try {
    const key = requireQuery(request, "key", "缺少 key 参数");
    const result = await pollQrcode(key);

    if (result.status !== "confirmed") {
      const payload: LoginPollResponse = { status: result.status, message: result.message };
      return apiOk(payload);
    }

    const cookie = result.cookie ?? {};
    if (!cookie.SESSDATA) {
      const payload: LoginPollResponse = { status: "expired", message: "登录回调缺少 cookie，请重新扫码" };
      return apiOk(payload);
    }
    await saveCookie(cookie);

    const payload: LoginPollResponse = { status: "confirmed" };
    try {
      const nav = await getNav(cookie);
      if (nav.user) payload.user = nav.user;
    } catch (error) {
      console.warn("[login] 登录成功但获取用户信息失败:", error);
      payload.message = "登录成功，但获取用户信息失败，请刷新页面";
    }
    return apiOk(payload);
  } catch (error) {
    return errorToResponse(error);
  }
}
