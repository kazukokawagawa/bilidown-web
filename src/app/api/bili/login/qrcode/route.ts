import { createRequire } from "node:module";
import path from "node:path";

import { generateQrcode } from "@/server/bili/client";
import { apiOk, errorToResponse, HttpError } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface QrcodeModule {
  toDataURL(
    text: string,
    options?: {
      type?: "image/png";
      errorCorrectionLevel?: "L" | "M" | "Q" | "H";
      margin?: number;
      width?: number;
    },
  ): Promise<string>;
}

let cachedModule: QrcodeModule | null | undefined;

/** 动态加载 qrcode（依赖由项目安装；避免打包器在依赖尚未安装时静态解析失败）。 */
function loadQrcodeModule(): QrcodeModule | null {
  if (cachedModule !== undefined) return cachedModule;
  try {
    const requireFromProject = createRequire(path.join(process.cwd(), "package.json"));
    const moduleName = "qr" + "code";
    const loaded = requireFromProject(moduleName) as QrcodeModule;
    cachedModule = loaded ?? null;
  } catch (error) {
    console.error("[qrcode] 无法加载 qrcode 依赖（DedeUserID 登录不可用）:", error);
    cachedModule = null;
  }
  return cachedModule;
}

async function renderQrcodeDataUrl(text: string): Promise<string | null> {
  const qrcode = loadQrcodeModule();
  if (!qrcode) return null;
  try {
    return await qrcode.toDataURL(text, {
      type: "image/png",
      errorCorrectionLevel: "M",
      margin: 1,
      width: 280,
    });
  } catch (error) {
    console.error("[qrcode] 生成二维码 dataURL 失败:", error);
    return null;
  }
}

/** POST /api/bili/login/qrcode — 生成登录二维码（image 为 data:image/png;base64）。 */
export async function POST() {
  try {
    const { key, url } = await generateQrcode();
    const image = await renderQrcodeDataUrl(url);
    if (!image) {
      throw new HttpError(
        "二维码生成组件不可用（服务端缺少 qrcode 依赖），请安装后重试",
        500,
        "QRCODE_UNAVAILABLE",
      );
    }
    return apiOk({ key, url, image });
  } catch (error) {
    return errorToResponse(error);
  }
}
