import type { LoginPollResponse } from "@/lib/types";
import { getNav, pollQrcode } from "@/server/bili/client";
import { apiOk, errorToResponse, HttpError, requireQuery } from "@/server/http";
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
      // 注意：这是“登录已确认但没换到凭证”，不是二维码过期，不能返回 expired 误导用户。
      console.error("[login] 扫码已确认，但未能从 B 站换取 SESSDATA（ticket 换票可能失败）");
      throw new HttpError(
        "扫码已确认，但未能换取登录凭证（B 站登录接口可能已更新），请刷新二维码重试",
        502,
        "LOGIN_COOKIE_MISSING",
      );
    }
    await saveCookie(cookie);

    const payload: LoginPollResponse = { status: "confirmed" };
    // 刚换到 Cookie 时 B 站 nav 偶发风控/未同步，短暂重试一次再判定。
    let nav = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const current = await getNav(cookie);
        if (current.isLogin && current.user) {
          nav = current;
          break;
        }
        if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 600));
      } catch (error) {
        console.warn("[login] 登录成功但获取用户信息失败:", error);
        if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 600));
      }
    }
    if (nav && nav.user) {
      payload.user = nav.user;
    } else {
      payload.message = "登录凭证已保存，但 B 站暂未返回登录态，请刷新账号状态";
    }
    return apiOk(payload);
  } catch (error) {
    return errorToResponse(error);
  }
}
