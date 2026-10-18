import type { AppSettings, TaskStatus } from "./types";

export const APP_NAME = "bilidown";
export const APP_VERSION = "1.2.6";

export const BILI_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
export const BILI_REFERER = "https://www.bilibili.com";
export const BILI_ORIGIN = "https://www.bilibili.com";

export const BILI_API = {
  view: "https://api.bilibili.com/x/web-interface/view",
  nav: "https://api.bilibili.com/x/web-interface/nav",
  playurl: "https://api.bilibili.com/x/player/playurl",
  searchWbi: "https://api.bilibili.com/x/web-interface/wbi/search/type",
  search: "https://api.bilibili.com/x/web-interface/search/type",
  suggest: "https://s.search.bilibili.com/main/suggest",
  qrGenerate: "https://passport.bilibili.com/x/passport-login/web/qrcode/generate",
  qrPoll: "https://passport.bilibili.com/x/passport-login/web/qrcode/poll",
  pgcSeason: "https://api.bilibili.com/pgc/view/web/season",
  navSpi: "https://api.bilibili.com/x/frontend/finger/spi",
  spaceInfo: "https://api.bilibili.com/x/space/wbi/acc/info",
} as const;

/** Bilibili quality id -> display label */
export const QUALITY_LABELS: Record<number, string> = {
  127: "8K 超高清",
  126: "杜比视界",
  125: "HDR 真彩",
  120: "4K 超清",
  116: "1080P 60帧",
  112: "1080P+",
  80: "1080P 高清",
  74: "720P 60帧",
  64: "720P 高清",
  32: "480P 清晰",
  16: "360P 流畅",
  6: "240P 极速",
};

export const DEFAULT_QUALITIES = [127, 126, 125, 120, 116, 112, 80, 74, 64, 32, 16, 6];

/** Bilibili dash codecid -> our codec name */
export const CODEC_BY_ID: Record<number, "avc" | "hevc" | "av1"> = {
  7: "avc",
  12: "hevc",
  13: "av1",
};

export const CODEC_NAMES: Record<"avc" | "hevc" | "av1", string> = {
  avc: "AVC / H.264",
  hevc: "HEVC / H.265",
  av1: "AV1",
};

/** Qualities that require a logged-in cookie on most videos. */
export const LOGIN_REQUIRED_QN = [127, 126, 125, 120, 116, 112, 80];

export const DEFAULT_SETTINGS: AppSettings = {
  downloadDir: "",
  namingTemplate: "{title}",
  maxConcurrent: 1,
  defaultQn: 80,
  preferCodec: "avc",
  mergeWithFfmpeg: true,
  ffmpegPath: "ffmpeg",
  cookie: {},
  proxy: "",
  theme: "system",
  clipboardWatch: false,
  autoCheckUpdate: false,
  saveTaskHistory: true,
  deleteTempAfterMerge: true,
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  queued: "排队中",
  downloading: "下载中",
  merging: "合并中",
  completed: "已完成",
  error: "失败",
  paused: "已暂停",
  cancelled: "已取消",
};

export const TASK_ACTIVE_STATUSES: TaskStatus[] = ["queued", "downloading", "merging"];

export const DOWNLOAD_DIR_NAME = "downloads";
export const DATA_DIR_NAME = "data";
