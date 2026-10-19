import type { AppSettings, AudioQualityKind, TaskStatus } from "./types";

export const APP_NAME = "bilidown";
export const APP_VERSION = "1.2.6";

export const BILI_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
export const BILI_REFERER = "https://www.bilibili.com";
export const BILI_ORIGIN = "https://www.bilibili.com";

export const BILI_API = {
  view: "https://api.bilibili.com/x/web-interface/view",
  tags: "https://api.bilibili.com/x/tag/archive/tags",
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

/** Bilibili DASH 音频流 id -> 展示名（30251 Hi-Res 无损 / 30250 杜比全景声 / 30280 192K / 30232 132K / 30216 64K）。 */
export const AUDIO_QUALITY_LABELS: Record<number, string> = {
  30251: "Hi-Res 无损",
  30250: "杜比全景声",
  30280: "192K",
  30232: "132K",
  30216: "64K",
};

/** 音频质量排序权重（数值越小越优先，自动选择时按该顺序取最佳可用音轨）。 */
export const AUDIO_QUALITY_RANK: Record<number, number> = {
  30251: 0,
  30250: 1,
  30280: 2,
  30232: 3,
  30216: 4,
};

/** 音频质量下拉可选值（0 = 自动，按视频/仅音频模式选择最佳音轨）。 */
export const AUDIO_QUALITY_CHOICES = [0, 30251, 30250, 30280, 30232, 30216] as const;

/**
 * 需要大会员（杜比全景声 / Hi-Res 无损）的音频流 id。
 * 132K/192K 是否可用由接口实际返回决定：实测未登录时部分视频仍会返回并可直接下载，
 * 因此不能仅凭 id 静态置灰，只有杜比/Hi-Res 这类会员音轨需要提示登录/大会员。
 */
export const LOGIN_REQUIRED_AUDIO_IDS = [30251, 30250];

/** 自动音频质量在设置页/任务中的展示名。 */
export const AUTO_AUDIO_QUALITY_LABEL = "自动（最佳音质）";

/** 音频质量种类展示名。 */
export const AUDIO_QUALITY_KIND_LABELS: Record<AudioQualityKind, string> = {
  aac: "AAC",
  dolby: "杜比全景声",
  flac: "FLAC 无损",
};

export const DEFAULT_SETTINGS: AppSettings = {
  downloadDir: "",
  namingTemplate: "{title}",
  maxConcurrent: 1,
  defaultQn: 80,
  defaultAudioQualityId: 0,
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
  downloadThreads: 4,
  embedSubtitles: false,
  listFolder: true,
  embedDanmaku: false,
  saveDanmaku: false,
  danmakuFontSize: 40,
  danmakuOpacity: 0.8,
};

/** 单独保存弹幕时使用的子文件夹名（位于视频文件同目录下） */
export const DANMAKU_FOLDER_NAME = "弹幕";

export const MIN_DANMAKU_FONT_SIZE = 20;
export const MAX_DANMAKU_FONT_SIZE = 80;
export const MIN_DANMAKU_OPACITY = 0.1;
export const MAX_DANMAKU_OPACITY = 1;
/** 弹幕不透明度可选项（设置页下拉） */
export const DANMAKU_OPACITY_OPTIONS = [0.3, 0.5, 0.7, 0.8, 0.9, 1] as const;

/** 单文件下载线程数可选值（1 = 单连接，>1 = 多连接分片下载）。 */
export const DOWNLOAD_THREAD_OPTIONS = [1, 2, 4, 8] as const;

export const MIN_DOWNLOAD_THREADS = 1;
export const MAX_DOWNLOAD_THREADS = 8;

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
