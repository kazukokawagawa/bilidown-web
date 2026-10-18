import fs from "node:fs/promises";
import path from "node:path";

import { DATA_DIR_NAME, DOWNLOAD_DIR_NAME } from "@/lib/constants";

/**
 * 运行时路径工具。
 * Next.js 的服务端进程工作目录即项目根目录（next dev / next start / next build 均是）。
 */
export const PROJECT_ROOT = process.cwd();
/** 桌面版（Electron）通过环境变量把数据/下载目录放到用户目录，避免写入安装目录。 */
export const DATA_DIR = process.env.BILIDOWN_DATA_DIR
  ? path.resolve(process.env.BILIDOWN_DATA_DIR)
  : path.join(PROJECT_ROOT, DATA_DIR_NAME);
export const DEFAULT_DOWNLOAD_DIR = process.env.BILIDOWN_DOWNLOAD_DIR
  ? path.resolve(process.env.BILIDOWN_DOWNLOAD_DIR)
  : path.join(PROJECT_ROOT, DOWNLOAD_DIR_NAME);
export const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");
export const TASKS_FILE = path.join(DATA_DIR, "tasks.json");
export const TMP_DIR_NAME = ".tmp";

/** 把设置里的下载目录解析为绝对路径；为空则回退到项目内 downloads/。 */
export function resolveDownloadDir(configured: string | null | undefined): string {
  const value = (configured ?? "").trim();
  if (!value) return DEFAULT_DOWNLOAD_DIR;
  return path.isAbsolute(value) ? path.normalize(value) : path.resolve(PROJECT_ROOT, value);
}

/** downloads/.tmp */
export function tempRoot(downloadDir: string): string {
  return path.join(downloadDir, TMP_DIR_NAME);
}

/** downloads/.tmp/<taskId> */
export function taskTempDir(downloadDir: string, taskId: string): string {
  return path.join(tempRoot(downloadDir), taskId);
}

export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

export async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

/** 目录是否可写（会创建目录并写入一个探针文件）。 */
export async function isDirWritable(dir: string): Promise<boolean> {
  const probe = path.join(dir, `.bilidown-write-test-${process.pid}-${Date.now()}`);
  try {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(probe, "ok", "utf8");
    return true;
  } catch {
    return false;
  } finally {
    await fs.rm(probe, { force: true }).catch(() => undefined);
  }
}

/** 读取 JSON 文件；文件不存在返回 null，解析失败抛错。 */
export async function readJsonFile<T>(file: string): Promise<T | null> {
  let raw: string;
  try {
    raw = await fs.readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  if (!raw.trim()) return null;
  return JSON.parse(raw) as T;
}

/** 原子写 JSON：先写临时文件再 rename，避免进程中途退出留下半个文件。 */
export async function writeJsonAtomic(file: string, value: unknown): Promise<void> {
  await ensureDir(path.dirname(file));
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  const data = JSON.stringify(value, null, 2);
  try {
    await fs.writeFile(tmp, data, "utf8");
    await fs.rename(tmp, file);
  } catch (error) {
    await fs.rm(tmp, { force: true }).catch(() => undefined);
    throw error;
  }
}

/** 生成 20240101-120000 形式的时间戳（用于导出文件名）。 */
export function timestampSlug(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    date.getFullYear() +
    pad(date.getMonth() + 1) +
    pad(date.getDate()) +
    "-" +
    pad(date.getHours()) +
    pad(date.getMinutes()) +
    pad(date.getSeconds())
  );
}
