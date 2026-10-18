import QRCode from "qrcode";

import { generateQrcode } from "@/server/bili/client";
import { apiOk, errorToResponse, HttpError } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 渲染二维码 dataURL；依赖静态打包进服务端产物（桌面版 standalone 内同样可用）。 */
async function renderQrcodeDataUrl(text: string): Promise<string> {
  try {
    return await QRCode.toDataURL(text, {
      type: "image/png",
      errorCorrectionLevel: "M",
      margin: 1,
      width: 280,
    });
  } catch (error) {
    console.error("[qrcode] 生成二维码 dataURL 失败:", error);
    throw new HttpError("二维码生成失败，请稍后重试", 500, "QRCODE_UNAVAILABLE");
  }
}

/** POST /api/bili/login/qrcode — 生成登录二维码（image 为 data:image/png;base64）。 */
export async function POST() {
  try {
    const { key, url } = await generateQrcode();
    const image = await renderQrcodeDataUrl(url);
    return apiOk({ key, url, image });
  } catch (error) {
    return errorToResponse(error);
  }
}
