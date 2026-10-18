import { APP_VERSION } from "@/lib/constants";
import type { UpdateCheckResponse } from "@/lib/types";
import { apiOk } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UPDATE_YML_URL = "https://zhouql.vip/bdupdate/win32/latest.yml";
const UPDATE_TIMEOUT_MS = 8000;

function parseLatestVersion(text: string): string | null {
  const match = /^\s*version\s*:\s*['"]?([^'"\s]+)['"]?\s*$/m.exec(text);
  return match ? match[1].trim() : null;
}

function versionParts(version: string): number[] {
  return version
    .replace(/^v/i, "")
    .split(/[.+-]/)
    .map((part) => {
      const parsed = Number.parseInt(part, 10);
      return Number.isFinite(parsed) ? parsed : 0;
    });
}

function compareVersions(a: string, b: string): number {
  const left = versionParts(a);
  const right = versionParts(b);
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

/** GET /api/update/check — 请求官方 latest.yml 解析版本号；失败不报错，返回 hasUpdate=false + error。 */
export async function GET() {
  const current = APP_VERSION;
  try {
    const response = await fetch(UPDATE_YML_URL, {
      headers: { Accept: "text/yaml, text/plain, */*", "Cache-Control": "no-cache" },
      cache: "no-store",
      signal: AbortSignal.timeout(UPDATE_TIMEOUT_MS),
    });
    if (!response.ok) {
      const payload: UpdateCheckResponse = {
        current,
        hasUpdate: false,
        error: "更新服务器返回 HTTP " + response.status,
      };
      return apiOk(payload);
    }
    const latest = parseLatestVersion(await response.text());
    if (!latest) {
      const payload: UpdateCheckResponse = { current, hasUpdate: false, error: "无法解析版本信息" };
      return apiOk(payload);
    }
    const payload: UpdateCheckResponse = { current, latest, hasUpdate: compareVersions(latest, current) > 0 };
    return apiOk(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const payload: UpdateCheckResponse = { current, hasUpdate: false, error: "检查更新失败：" + message };
    return apiOk(payload);
  }
}
