"use client";

import type {
  AppSettings,
  Codec,
  CreateTaskInput,
  LoginPollResponse,
  LoginQrcodeResponse,
  NavResponse,
  ResolveResponse,
  SearchResponse,
  SettingsResponse,
  StreamsResponse,
  SuggestResponse,
  SystemInfo,
  TaskAction,
  TaskResponse,
  TasksResponse,
  UpdateCheckResponse,
  VideoResponse,
} from "./types";

export class ApiRequestError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {};
  if (init && init.body) headers["Content-Type"] = "application/json";
  if (init && init.headers) Object.assign(headers, init.headers as Record<string, string>);

  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers,
      cache: "no-store",
    });
  } catch {
    throw new ApiRequestError("网络请求失败，请确认服务已启动", 0, "NETWORK_ERROR");
  }

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    const body = data as { error?: string; code?: string } | null;
    const message = body && body.error ? body.error : "请求失败（HTTP " + res.status + "）";
    throw new ApiRequestError(message, res.status, body ? body.code : undefined);
  }

  return data as T;
}

function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") sp.set(key, String(value));
  });
  const s = sp.toString();
  return s ? "?" + s : "";
}

export const api = {
  bili: {
    video: (input: string) => request<VideoResponse>("/api/bili/video" + qs({ input })),
    streams: (params: {
      bvid: string;
      cid: number;
      qn?: number;
      codec?: Codec;
      audioOnly?: boolean;
      /** 音频质量 id（0/缺省 = 自动，由服务端按设置与权限选择最佳音轨） */
      audioQualityId?: number;
    }) =>
      request<StreamsResponse>(
        "/api/bili/streams" +
          qs({
            bvid: params.bvid,
            cid: params.cid,
            qn: params.qn,
            codec: params.codec,
            audioOnly: params.audioOnly ? 1 : undefined,
            audioQualityId: params.audioQualityId,
          }),
      ),
    search: (params: { keyword: string; type: "video" | "user"; page?: number; order?: string }) =>
      request<SearchResponse>("/api/bili/search" + qs(params)),
    suggest: (term: string) => request<SuggestResponse>("/api/bili/suggest" + qs({ term })),
    nav: () => request<NavResponse>("/api/bili/nav"),
    qrcode: () => request<LoginQrcodeResponse>("/api/bili/login/qrcode", { method: "POST" }),
    pollLogin: (key: string) => request<LoginPollResponse>("/api/bili/login/poll" + qs({ key })),
    logout: () => request<{ ok: boolean }>("/api/bili/logout", { method: "POST" }),
    resolve: (input: string) =>
      request<ResolveResponse>("/api/bili/resolve", { method: "POST", body: JSON.stringify({ input }) }),
  },
  tasks: {
    list: () => request<TasksResponse>("/api/tasks"),
    create: (input: CreateTaskInput) =>
      request<TaskResponse>("/api/tasks", { method: "POST", body: JSON.stringify(input) }),
    action: (id: string, action: TaskAction) =>
      request<TaskResponse>("/api/tasks/" + encodeURIComponent(id) + "/action", {
        method: "POST",
        body: JSON.stringify({ action }),
      }),
    clear: (status: "completed" | "error" | "all") =>
      request<{ removed: number }>("/api/tasks" + qs({ status }), { method: "DELETE" }),
    importTasks: (payload: unknown) =>
      request<{ imported: number }>("/api/tasks/import", { method: "POST", body: JSON.stringify(payload) }),
    exportUrl: "/api/tasks/export",
    fileUrl: (id: string) => "/api/tasks/" + encodeURIComponent(id) + "/file",
    partFileUrl: (id: string, part: "video" | "audio") =>
      "/api/tasks/" + encodeURIComponent(id) + "/file" + qs({ part }),
    reveal: (id: string) =>
      request<{ path: string }>("/api/tasks/" + encodeURIComponent(id) + "/reveal", { method: "POST" }),
    eventsUrl: "/api/tasks/events",
  },
  settings: {
    get: () => request<SettingsResponse>("/api/settings"),
    update: (patch: Partial<AppSettings>) =>
      request<SettingsResponse>("/api/settings", { method: "PUT", body: JSON.stringify(patch) }),
  },
  system: {
    info: () => request<SystemInfo>("/api/system/info"),
    checkUpdate: () => request<UpdateCheckResponse>("/api/update/check"),
  },
};

export function getErrorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) return error.message;
  if (error instanceof Error) return error.message;
  return "未知错误";
}
