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

/** 合集（ugc_season）/番剧 season 中的一集 */
export interface CollectionEpisode {
  /** 合集剧集 id（ugc_season.sections[].episodes[].id）；番剧为 ep_id */
  id: number;
  aid: number;
  bvid: string;
  cid: number;
  /** 该剧集视频内部的页码（通常为 1） */
  page: number;
  title: string;
  duration: number;
  cover: string;
  pubdate: number;
  /** 该集在 B 站的原始链接（番剧为 bangumi/play/epXXX；UGC 合集可能缺省） */
  sourceUrl?: string;
}

export interface CollectionSection {
  id: number;
  title: string;
  episodes: CollectionEpisode[];
}

/** 视频所属合集（ugc_season）或番剧 season；非合集/非番剧视频为 null */
export interface VideoCollection {
  id: number;
  /** 合集总标题 / 番剧名，下载时作为列表文件夹名 */
  title: string;
  sections: CollectionSection[];
  /** 当前解析视频对应的剧集 id（用于默认勾选） */
  currentEpisodeId: number | null;
  /** 来源：UGC 合集（缺省）或 PGC 番剧 season（正片 + PV/预告等小节；sections[0] 为正片） */
  source?: "ugc" | "pgc";
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
  /** 分区名（B 站 view.tname），接口未返回时为空字符串 */
  tname?: string;
  /** 版权类型：1=自制，2=转载（B 站 view.copyright） */
  copyright?: number;
  pages: VideoPage[];
  videos: number;
  /** view 接口的 redirect_url（番剧视频通常指向 bangumi/play/epXXX；普通视频为空） */
  redirectUrl?: string;
  /** 视频所属合集（ugc_season）或番剧 season 剧集；非合集/非番剧为 null */
  collection: VideoCollection | null;
  /** 视频标签（仅单P/无列表时由服务端补充，最多 20 个） */
  tags?: string[];
}

export type Codec = "avc" | "hevc" | "av1";

export interface QualityOption {
  qn: number;
  label: string;
  codec: Codec;
  needsLogin: boolean;
}

/** 音频流种类：普通 AAC / 杜比全景声 / Hi-Res 无损 FLAC。 */
export type AudioQualityKind = "aac" | "dolby" | "flac";

/** 可选的音频质量（B 站 DASH audio 流）。 */
export interface AudioQualityOption {
  /** B 站 DASH 音频流 id：30216/30232/30280（AAC）、30250（杜比全景声）、30251（Hi-Res 无损） */
  id: number;
  label: string;
  kind: AudioQualityKind;
  /** 音频码率（bit/s），接口未返回时为 undefined */
  bandwidth?: number;
  /** 未登录时不可用（132K/192K 需登录，杜比全景声/Hi-Res 需大会员） */
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
  /** 实际选中的音频质量；没有音轨时为 undefined */
  audioQuality?: AudioQualityOption;
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
  /** 音频流质量 id（0 表示自动；服务端下载时会写回实际选中的值） */
  audioQualityId: number;
  /** 音频流质量名称（如「192K」「Hi-Res 无损」；自动时为「自动」） */
  audioQualityName: string;
  /** 最终文件容器；embedSubtitles 生效且找到字幕时为 mkv，Hi-Res 无损音轨为 flac */
  format: "mp4" | "m4a" | "m4s" | "mkv" | "flac";
  status: TaskStatus;
  progress: number;
  downloadedBytes: number;
  totalBytes: number;
  speed: number;
  filePath: string | null;
  fileName: string | null;
  fileSize: number | null;
  /** 服务端未合并（format=m4s）时保存的视频分片绝对路径；合并成功时为 null */
  videoFilePath: string | null;
  /** 服务端未合并（format=m4s）且含音轨时保存的音频分片绝对路径；其余情况为 null */
  audioFilePath: string | null;
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
  /** 列表（合集/分P批量）名称；非空时文件保存到以该名称命名的子文件夹 */
  listTitle: string | null;
  /** 列表中的序号（分P页码或合集剧集序号，从 1 开始） */
  listIndex: number | null;
  /** 是否把弹幕内嵌为视频的 ASS 软字幕轨道（输出 MKV） */
  embedDanmaku: boolean;
  /** 是否把弹幕文件（XML + ASS）单独保存到「弹幕」子文件夹 */
  saveDanmaku: boolean;
  /** 实际获取到的弹幕条数（0 表示没有弹幕/未获取） */
  danmakuCount: number;
  /** 单独保存弹幕时的弹幕文件夹绝对路径 */
  danmakuPath: string | null;
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
  /** 可选：音频质量 id（0 或缺省表示自动，按设置与登录权限选择最佳音轨） */
  audioQualityId?: number | null;
  sourceUrl: string;
  /** 可选：是否把字幕内嵌为 MKV，缺省使用设置项 embedSubtitles */
  embedSubtitles?: boolean;
  /** 可选：列表名称（合集标题 / 分P所属视频标题），用于创建列表文件夹 */
  listTitle?: string | null;
  /** 可选：列表序号（分P页码 / 合集剧集序号） */
  listIndex?: number | null;
  /** 可选：是否内嵌弹幕，缺省使用设置项 embedDanmaku */
  embedDanmaku?: boolean;
  /** 可选：是否单独保存弹幕文件，缺省使用设置项 saveDanmaku */
  saveDanmaku?: boolean;
}

export type TaskAction = "pause" | "resume" | "cancel" | "retry" | "delete";

/* ---------------------------------------------------------------- Settings */

export interface AppSettings {
  downloadDir: string;
  namingTemplate: string;
  maxConcurrent: number;
  defaultQn: number;
  /** 默认音频质量 id（0 = 自动：仅音频时优先无损/杜比，视频时优先 192K AAC） */
  defaultAudioQualityId: number;
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
  /** 列表（合集/分P批量）下载时按列表名创建子文件夹 */
  listFolder: boolean;
  /** 默认是否把弹幕内嵌为 MKV 的 ASS 软字幕轨道（需要 ffmpeg） */
  embedDanmaku: boolean;
  /** 默认是否把弹幕文件（XML + ASS）单独保存到「弹幕」子文件夹 */
  saveDanmaku: boolean;
  /** ASS 弹幕字号（PlayRes 1920x1080 坐标系） */
  danmakuFontSize: number;
  /** 弹幕不透明度（0.1 ~ 1） */
  danmakuOpacity: number;
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

/** 浏览器端 ffmpeg.wasm（public/ffmpeg）资源是否就绪。 */
export interface BrowserFfmpegInfo {
  available: boolean;
  /** @ffmpeg/core 版本（读取 public/ffmpeg/prepared.json） */
  version: string | null;
  /** 首次加载需要下载的 wasm 字节数，未知为 null */
  coreBytes: number | null;
}

export interface SystemInfo {
  version: string;
  platform: string;
  ffmpeg: FfmpegInfo;
  /** 浏览器端 ffmpeg.wasm 资源状态（用于“无服务端 ffmpeg 时浏览器合并”能力） */
  browserFfmpeg: BrowserFfmpegInfo;
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
  /** 可用音频质量列表（高 -> 低）；视频没有音频流时为空数组 */
  audioQualities: AudioQualityOption[];
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
