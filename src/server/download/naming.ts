import path from "node:path";

import { ensureDir, pathExists } from "../paths";

/**
 * 文件命名（docs/blueprint.md §4.1）：
 * - 单 P：<下载目录>/<模板>.mp4
 * - 多 P：<下载目录>/<视频标题>/P<page> <分P标题>.mp4
 * - 非法字符 \\ / : * ? " < > | 替换为 _；去掉结尾的点与空格；长度不超过 180。
 * - 模板占位符：{title} {part} {bvid} {quality} {up} {cid} {page}
 */

const ILLEGAL_CHARS = /[\\/:*?"<>|]/g;
const CONTROL_CHARS = /[\u0000-\u001f]/g;
const MAX_FILE_NAME_LENGTH = 180;

export interface NamingContext {
  title: string;
  partTitle: string;
  bvid: string;
  cid: number;
  page: number;
  qualityName: string;
  upName: string;
}

export function sanitizeFileName(input: string, fallback = "未命名"): string {
  let name = (input ?? "")
    .replace(CONTROL_CHARS, "")
    .replace(ILLEGAL_CHARS, "_")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "");
  if (!name) name = fallback;
  if (name.length > MAX_FILE_NAME_LENGTH) {
    const ext = path.extname(name);
    const maxBase = Math.max(1, MAX_FILE_NAME_LENGTH - ext.length);
    name = name.slice(0, maxBase).replace(/[. ]+$/g, "") + ext;
  }
  return name || fallback;
}

export function renderNamingTemplate(template: string, context: NamingContext): string {
  const values: Record<string, string> = {
    title: context.title,
    part: context.partTitle,
    bvid: context.bvid,
    quality: context.qualityName,
    up: context.upName,
    cid: String(context.cid),
    page: String(context.page),
  };
  return template.replace(/\{(title|part|bvid|quality|up|cid|page)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? values[key] : match,
  );
}

export interface OutputPlan {
  dir: string;
  fileName: string;
}

export type OutputExtension = ".mp4" | ".m4a" | ".m4s" | ".mkv";

export function planOutputPath(options: {
  downloadDir: string;
  namingTemplate: string;
  isMultiPage: boolean;
  context: NamingContext;
  extension: OutputExtension;
}): OutputPlan {
  const { downloadDir, namingTemplate, isMultiPage, context, extension } = options;
  if (isMultiPage) {
    const folder = sanitizeFileName(context.title);
    const partFileName = sanitizeFileName(`P${context.page} ${context.partTitle || context.title}`);
    return { dir: path.join(downloadDir, folder), fileName: partFileName + extension };
  }
  const base = renderNamingTemplate(namingTemplate || "{title}", context);
  return { dir: downloadDir, fileName: sanitizeFileName(base) + extension };
}

/** 预留一个不冲突的目标文件路径（同名时追加 " (2)"、" (3)"...）。 */
export async function reserveOutputPath(
  dir: string,
  fileName: string,
): Promise<{ dir: string; fileName: string; filePath: string }> {
  await ensureDir(dir);
  const parsed = path.parse(fileName);
  let candidate = fileName;
  let index = 1;
  while (await pathExists(path.join(dir, candidate))) {
    index += 1;
    candidate = `${parsed.name} (${index})${parsed.ext}`;
    if (index > 999) break;
  }
  return { dir, fileName: candidate, filePath: path.join(dir, candidate) };
}
