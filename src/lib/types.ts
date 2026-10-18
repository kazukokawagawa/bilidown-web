/**
 * Shared type contracts for bilidown-web (used by both server and client).
 * Keep this file in sync with docs/blueprint.md.
 */

/* ------------------------------------------------------------------ Bilibili */

export type InputType = "bvid" | "av" | "b23" | "ep" | "ss" | "url";

export interface ParsedInput {
  type: InputType;
  bvid?: string;
  aid?: number;
  epId?: number;
  seasonId?: number;
  url?: string;
}

export interface VideoOwner {
  mid: number;
  name: string;
  face: string;
}

export interface VideoStat {
  view: number;
  danmaku: number;
  reply: number;
  favorite: number;
  coin: number;
  share: number;
  like: number;
}

export interface VideoPage {
  cid: number;
  page: number;
  title: string;
  duration: number;
}

export interface VideoInfo {
  bvid: string;
  aid: number;
  title: string;
  cover: string;
  desc: string;
  duration: number;
  pubdate: number;
  owner: VideoOwner;
  stat: VideoStat;
  pages: VideoPage[];
  videos: number;
}

export type Codec = "avc" | "hevc" | "av1";

export interface QualityOption {
  qn: number;
  label: string;
  codec: Codec;
  needsLogin: boolean;
}

export interface StreamSource {
  url: string;
  backupUrls: string[];
  size?: number;
  bandwidth?: number;
}

export interface StreamDetail {
  qn: number;
  label: string;
  codec: Codec;
  video?: StreamSource;
  audio?: StreamSource;
  audioOnly: boolean;
}

/** B 站 CC 字幕轨道（由 /x/player/wbi/v2 返回）。 */
export interface SubtitleTrack {
  /** 语言标识，如 zh-CN / ai-zh / en-US */
  lang: string;
  /** 展示名，如「中文（自动生成）」 */
  label: string;
  /** 字幕 JSON 的绝对地址 */
  url: string;
  /** 是否为 AI 生成字幕 */
  ai: boolean;
}

export interface BiliCookie {
  SESSDATA?: string;
  bili_jct?: string;
  DedeUserID?: string;
  DedeUserID__ckMd5?: string;
  sid?: string;
  buvid3?: string;
}

export interface BiliUser {
  mid: number;
  name: string;
  face: string;
  isLogin: boolean;
  vipStatus?: number;
}

export interface SearchVideoItem {
  type: "video";
  bvid: string;
  aid: number;
  title: string;
  cover: string;
  author: string;
  mid: number;
  duration: string;
  play: number;
  danmaku: number;
  pubdate: number;
  description: string;
}

export interface SearchUserItem {
  type: "user";
  mid: number;
  name: string;
  face: string;
  fans: number;
  videos: number;
  sign: string;
}

export type SearchItem = SearchVideoItem | SearchUserItem;

/* --------------------------------------------------------------- Downloads */

export type TaskStatus =
  | "queued"
  | "downloading"
  | "merging"
  | "completed"
  | "error"
  | "paused"
  | "cancelled";

export interface DownloadTask {
  id: string;
  bvid: string;
  aid: number;
  cid: number;
  page: number;
  title: string;
  partTitle: string;
  cover: string;
  upName: string;
  qn: number;
  qualityName: string;
  codec: Codec;
  /** 最终文件容器；embedSubtitles 生效且找到字幕时为 mkv */
  format: "mp4" | "m4a" | "m4s" | "mkv";
  status: TaskStatus;
  progress: number;
  downloadedBytes: number;
  totalBytes: number;
  speed: number;
  filePath: string | null;
  fileName: string | null;
  fileSize: number | null;
  error: string | null;
  createdAt: number;
  updatedAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  sourceUrl: string;
  audioOnly: boolean;
  /** 是否请求把 B 站字幕内嵌进 MKV（最终以 subtitleCount 为准） */
  embedSubtitles: boolean;
  /** 实际内嵌的字幕轨道数（0 表示未内嵌） */
  subtitleCount: number;
}

export interface CreateTaskInput {
  bvid: string;
  aid: number;
  cid: number;
  page: number;
  title: string;
  partTitle: string;
  cover: string;
  upName: string;
  qn: number;
  codec: Codec;
  audioOnly: boolean;
  sourceUrl: string;
  /** 可选：是否把字幕内嵌为 MKV，缺省使用设置项 embedSubtitles */
  embedSubtitles?: boolean;
}

export type TaskAction = "pause" | "resume" | "cancel" | "retry" | "delete";

/* ---------------------------------------------------------------- Settings */

export interface AppSettings {
  downloadDir: string;
  namingTemplate: string;
  maxConcurrent: number;
  defaultQn: number;
  preferCodec: Codec;
  mergeWithFfmpeg: boolean;
  ffmpegPath: string;
  cookie: BiliCookie;
  proxy: string;
  theme: "light" | "dark" | "system";
  clipboardWatch: boolean;
  autoCheckUpdate: boolean;
  saveTaskHistory: boolean;
  deleteTempAfterMerge: boolean;
  /** 单个音/视频文件的下载线程数（1-8，1 表示单连接） */
  downloadThreads: number;
  /** 默认是否拉取字幕并内嵌为 MKV（需要 ffmpeg） */
  embedSubtitles: boolean;
}

export type PublicSettings = Omit<AppSettings, "cookie"> & {
  loggedIn: boolean;
  cookiePreview?: { DedeUserID?: string };
};

/* ------------------------------------------------------------------ System */

export interface FfmpegInfo {
  available: boolean;
  version?: string;
  path?: string;
}

export interface SystemInfo {
  version: string;
  platform: string;
  ffmpeg: FfmpegInfo;
  downloadDir: string;
  downloadDirWritable: boolean;
}

/* ------------------------------------------------------------- API payloads */

export interface ApiErrorBody {
  error: string;
  code?: string;
}

export interface VideoResponse {
  input: ParsedInput;
  video: VideoInfo;
}

export interface StreamsResponse {
  qualities: QualityOption[];
  selected: StreamDetail;
}

export interface SearchResponse {
  items: SearchItem[];
  page: number;
  total: number;
  hasMore: boolean;
}

export interface SuggestResponse {
  items: string[];
}

export interface NavResponse {
  isLogin: boolean;
  user?: BiliUser;
}

export interface LoginQrcodeResponse {
  key: string;
  url: string;
  image: string;
}

export type LoginPollStatus = "waiting" | "scanned" | "expired" | "confirmed";

export interface LoginPollResponse {
  status: LoginPollStatus;
  user?: BiliUser;
  message?: string;
}

export interface TasksResponse {
  tasks: DownloadTask[];
}

export interface TaskResponse {
  task: DownloadTask;
}

export interface SettingsResponse {
  settings: PublicSettings;
}

export interface UpdateCheckResponse {
  current: string;
  latest?: string;
  hasUpdate: boolean;
  error?: string;
}

export type ResolveResponse = ParsedInput;

export type TaskEvent =
  | { type: "init"; tasks: DownloadTask[] }
  | { type: "task-updated"; task: DownloadTask }
  | { type: "task-deleted"; id: string };
