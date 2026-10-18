import type { ApiErrorBody } from "@/lib/types";

/**
 * Route Handler 共用的请求/响应辅助函数。
 * 统一错误响应格式：{ error: string, code?: string } + 4xx/5xx。
 */

export class HttpError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status = 500, code?: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
  }
}

interface ErrorWithStatus {
  message: string;
  status: number;
  code?: string;
}

function hasStatus(error: unknown): error is ErrorWithStatus {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as { message?: unknown; status?: unknown; code?: unknown };
  return (
    typeof candidate.message === "string" &&
    typeof candidate.status === "number" &&
    Number.isFinite(candidate.status) &&
    (candidate.code === undefined || typeof candidate.code === "string")
  );
}

export function apiError(message: string, status = 500, code?: string): Response {
  const body: ApiErrorBody = code ? { error: message, code } : { error: message };
  return Response.json(body, { status });
}

export function apiOk<T>(data: T, status = 200): Response {
  return Response.json(data, { status });
}

/** 把任意异常转换为统一错误响应（带 status 的异常保留其状态码）。 */
export function errorToResponse(error: unknown): Response {
  if (hasStatus(error)) return apiError(error.message, error.status, error.code);
  console.error("[api] 未处理的异常:", error);
  return apiError("服务器内部错误", 500, "INTERNAL_ERROR");
}

/** 生成支持中文文件名的 Content-Disposition（filename* RFC 5987）。 */
export function contentDisposition(fileName: string): string {
  const fallback =
    fileName
      .replace(/[^\x20-\x7e]/g, "_")
      .replace(/["\\]/g, "_")
      .trim() || "download";
  const encoded = encodeURIComponent(fileName).replace(
    /['()*]/g,
    (char) => "%" + char.charCodeAt(0).toString(16).toUpperCase(),
  );
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return "未知错误";
}

export async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  const raw = await request.text();
  if (!raw.trim()) throw new HttpError("请求体不能为空", 400, "EMPTY_BODY");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new HttpError("请求体不是合法 JSON", 400, "INVALID_JSON");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new HttpError("请求体必须是 JSON 对象", 400, "INVALID_BODY");
  }
  return parsed as Record<string, unknown>;
}

export function queryValue(request: Request, key: string): string | null {
  return new URL(request.url).searchParams.get(key);
}

export function requireQuery(request: Request, key: string, message: string): string {
  const value = queryValue(request, key);
  if (!value || !value.trim()) throw new HttpError(message, 400, "MISSING_QUERY");
  return value.trim();
}

export function optionalQuery(request: Request, key: string): string | null {
  const value = queryValue(request, key);
  return value && value.trim() ? value.trim() : null;
}

export function optionalQueryInt(request: Request, key: string): number | null {
  const value = optionalQuery(request, key);
  if (value === null) return null;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) throw new HttpError(`参数 ${key} 必须是整数`, 400, "INVALID_QUERY");
  return parsed;
}

export function requireString(
  source: Record<string, unknown>,
  key: string,
  message: string,
  maxLength = 2000,
): string {
  const value = source[key];
  if (typeof value !== "string" || !value.trim()) throw new HttpError(message, 400, "INVALID_BODY");
  const trimmed = value.trim();
  if (trimmed.length > maxLength) throw new HttpError(`${message}（长度不能超过 ${maxLength}）`, 400, "INVALID_BODY");
  return trimmed;
}

export function optionalString(
  source: Record<string, unknown>,
  key: string,
  fallback: string | undefined,
  maxLength = 2000,
): string | undefined {
  const value = source[key];
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "string") throw new HttpError(`参数 ${key} 必须是字符串`, 400, "INVALID_BODY");
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  if (trimmed.length > maxLength) throw new HttpError(`参数 ${key} 过长`, 400, "INVALID_BODY");
  return trimmed;
}

export function requireInteger(
  source: Record<string, unknown>,
  key: string,
  message: string,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
): number {
  const value = source[key];
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value)) {
    throw new HttpError(message, 400, "INVALID_BODY");
  }
  if (value < min || value > max) throw new HttpError(`${message}（取值范围 ${min}~${max}）`, 400, "INVALID_BODY");
  return value;
}

export function optionalInteger(
  source: Record<string, unknown>,
  key: string,
  fallback: number,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
): number {
  if (source[key] === undefined || source[key] === null) return fallback;
  return requireInteger(source, key, `参数 ${key} 必须是整数`, min, max);
}

export function requireEnum<T extends string>(
  source: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
  message: string,
): T {
  const value = source[key];
  if (typeof value !== "string" || !allowed.includes(value as T)) throw new HttpError(message, 400, "INVALID_BODY");
  return value as T;
}

export function optionalEnum<T extends string>(
  source: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
  fallback: T,
): T {
  if (source[key] === undefined || source[key] === null) return fallback;
  return requireEnum(source, key, allowed, `参数 ${key} 必须是 ${allowed.join(" / ")} 之一`);
}

export function optionalBoolean(source: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const value = source[key];
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "boolean") throw new HttpError(`参数 ${key} 必须是布尔值`, 400, "INVALID_BODY");
  return value;
}
