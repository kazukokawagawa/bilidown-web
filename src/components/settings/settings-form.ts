import { DEFAULT_SETTINGS } from "@/lib/constants";
import type { AppSettings, PublicSettings } from "@/lib/types";

/** 设置页允许编辑的字段（不含服务端维护的 cookie） */
export type SettingsFormState = Pick<
  AppSettings,
  | "downloadDir"
  | "namingTemplate"
  | "maxConcurrent"
  | "defaultQn"
  | "preferCodec"
  | "mergeWithFfmpeg"
  | "ffmpegPath"
  | "proxy"
  | "theme"
  | "clipboardWatch"
  | "autoCheckUpdate"
  | "saveTaskHistory"
  | "deleteTempAfterMerge"
>;

export function toSettingsForm(settings: AppSettings | PublicSettings): SettingsFormState {
  return {
    downloadDir: settings.downloadDir,
    namingTemplate: settings.namingTemplate,
    maxConcurrent: settings.maxConcurrent,
    defaultQn: settings.defaultQn,
    preferCodec: settings.preferCodec,
    mergeWithFfmpeg: settings.mergeWithFfmpeg,
    ffmpegPath: settings.ffmpegPath,
    proxy: settings.proxy,
    theme: settings.theme,
    clipboardWatch: settings.clipboardWatch,
    autoCheckUpdate: settings.autoCheckUpdate,
    saveTaskHistory: settings.saveTaskHistory,
    deleteTempAfterMerge: settings.deleteTempAfterMerge,
  };
}

export function defaultSettingsForm(): SettingsFormState {
  return toSettingsForm(DEFAULT_SETTINGS);
}
