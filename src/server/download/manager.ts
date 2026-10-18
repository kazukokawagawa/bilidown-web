import { randomUUID } from "node:crypto";

import { QUALITY_LABELS } from "@/lib/constants";
import type { CreateTaskInput, DownloadTask, TaskAction, TaskStatus } from "@/lib/types";

import { publishTaskEvent } from "../events";
import { resolveDownloadDir } from "../paths";
import { getSettings } from "../settings";
import { flushTasks, loadTasksFromDisk, saveTasksDebounced } from "../store";
import { cleanupTaskTemp, executeTask, type WorkerResult } from "./worker";

/**
 * 下载任务管理器。
 * - globalThis 单例（避免 Next dev 热更新产生多个实例）
 * - 并发队列（maxConcurrent）
 * - 每个任务独立 AbortController，支持暂停 / 取消 / 重试 / 删除
 * - 进度 500ms 节流推送（SSE），速度按最近 2s 采样
 * - 任务列表持久化到 data/tasks.json（防抖原子写）
 */

const PROGRESS_EMIT_INTERVAL_MS = 500;
const SPEED_WINDOW_MS = 2500;
const SPEED_MIN_SPAN_MS = 500;
/** 采样节流：多线程分片时 onBytes 触发频率很高，按 ~10Hz 采样即可 */
const SPEED_SAMPLE_INTERVAL_MS = 100;
const SPEED_MAX_SAMPLES = 1024;
const SPEED_EMA_ALPHA = 0.5;
const MAX_CONCURRENT_LIMIT = 5;
const ACTIVE_STATUSES: ReadonlyArray<TaskStatus> = ["queued", "downloading", "merging"];

export class TaskManagerError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status = 400, code?: string) {
    super(message);
    this.name = "TaskManagerError";
    this.status = status;
    this.code = code;
  }
}

interface RunningEntry {
  controller: AbortController;
  pauseRequested: boolean;
  cancelRequested: boolean;
}

interface ProgressSample {
  at: number;
  bytes: number;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return "未知错误";
}

function taskKey(task: Pick<DownloadTask, "bvid" | "cid" | "page">): string {
  return task.bvid + ":" + task.cid + ":" + task.page;
}

export class TaskManager {
  private readonly tasks = new Map<string, DownloadTask>();
  private readonly running = new Map<string, RunningEntry>();
  private readonly queue: string[] = [];
  private readonly lastEmitAt = new Map<string, number>();
  private readonly samples = new Map<string, ProgressSample[]>();
  private readonly smoothedSpeed = new Map<string, number>();
  private initPromise: Promise<void> | null = null;
  private pumping = false;
  private pumpAgain = false;

  /* --------------------------------------------------------------- 初始化 */

  private ensureInitialized(): Promise<void> {
    if (!this.initPromise) this.initPromise = this.restore();
    return this.initPromise;
  }

  /** 启动恢复：downloading / merging / queued 一律重置为 paused（进程重启后没有执行上下文）。 */
  private async restore(): Promise<void> {
    let restored: DownloadTask[] = [];
    try {
      restored = await loadTasksFromDisk();
    } catch (error) {
      console.error("[manager] 恢复任务列表失败:", errorMessage(error));
    }
    for (const task of restored) {
      if (task.status === "downloading" || task.status === "merging" || task.status === "queued") {
        task.status = "paused";
        task.speed = 0;
        task.updatedAt = Date.now();
      }
      this.tasks.set(task.id, task);
      this.lastEmitAt.set(task.id, 0);
    }
    if (restored.length) this.persist();
  }

  /* --------------------------------------------------------------- 查询 */

  async list(): Promise<DownloadTask[]> {
    await this.ensureInitialized();
    return this.snapshot();
  }

  async get(id: string): Promise<DownloadTask | null> {
    await this.ensureInitialized();
    const task = this.tasks.get(id);
    return task ? { ...task } : null;
  }

  private snapshot(): DownloadTask[] {
    return [...this.tasks.values()]
      .map((task) => ({ ...task }))
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  private persist(): void {
    saveTasksDebounced(this.snapshot());
  }

  private emitTask(task: DownloadTask): void {
    publishTaskEvent({ type: "task-updated", task: { ...task } });
  }

  /* --------------------------------------------------------------- 创建/操作 */

  async create(input: CreateTaskInput): Promise<DownloadTask> {
    await this.ensureInitialized();
    const now = Date.now();
    const task: DownloadTask = {
      id: randomUUID(),
      bvid: input.bvid,
      aid: input.aid,
      cid: input.cid,
      page: input.page,
      title: input.title,
      partTitle: input.partTitle,
      cover: input.cover,
      upName: input.upName,
      qn: input.qn,
      qualityName: QUALITY_LABELS[input.qn] ?? "清晰度 " + input.qn,
      codec: input.codec,
      format: input.audioOnly ? "m4a" : "mp4",
      status: "queued",
      progress: 0,
      downloadedBytes: 0,
      totalBytes: 0,
      speed: 0,
      filePath: null,
      fileName: null,
      fileSize: null,
      error: null,
      createdAt: now,
      updatedAt: now,
      startedAt: null,
      finishedAt: null,
      sourceUrl: input.sourceUrl,
      audioOnly: input.audioOnly,
      embedSubtitles: Boolean(input.embedSubtitles) && !input.audioOnly,
      subtitleCount: 0,
      listTitle: input.listTitle && input.listTitle.trim() ? input.listTitle.trim() : null,
      listIndex:
        typeof input.listIndex === "number" && Number.isFinite(input.listIndex) && input.listIndex > 0
          ? Math.trunc(input.listIndex)
          : null,
      embedDanmaku: Boolean(input.embedDanmaku) && !input.audioOnly,
      saveDanmaku: Boolean(input.saveDanmaku),
      danmakuCount: 0,
      danmakuPath: null,
    };
    this.tasks.set(task.id, task);
    this.queue.push(task.id);
    this.emitTask(task);
    this.persist();
    this.kickPump();
    return { ...task };
  }

  async act(id: string, action: TaskAction): Promise<DownloadTask | null> {
    await this.ensureInitialized();
    const task = this.tasks.get(id);
    if (!task) throw new TaskManagerError("任务不存在或已被删除", 404, "TASK_NOT_FOUND");
    switch (action) {
      case "pause":
        return this.pause(task);
      case "resume":
        return this.resume(task, false);
      case "retry":
        return this.resume(task, true);
      case "cancel":
        return this.cancel(task);
      case "delete":
        return this.remove(task);
      default:
        throw new TaskManagerError("未知的任务操作", 400, "INVALID_ACTION");
    }
  }

  private async pause(task: DownloadTask): Promise<DownloadTask> {
    const entry = this.running.get(task.id);
    if (entry) {
      entry.pauseRequested = true;
      entry.controller.abort();
    }
    if (ACTIVE_STATUSES.includes(task.status) || task.status === "paused") {
      this.dequeue(task.id);
      task.status = "paused";
      task.speed = 0;
      task.updatedAt = Date.now();
      this.emitTask(task);
      this.persist();
    }
    return { ...task };
  }

  private async resume(task: DownloadTask, fresh: boolean): Promise<DownloadTask> {
    // 暂停/取消尚在执行器收尾时再次点「继续/重试」：明确提示稍后再试，避免静默无效果
    if (this.running.has(task.id)) {
      throw new TaskManagerError("任务正在停止或切换状态，请稍后重试", 409, "TASK_BUSY");
    }
    if (task.status === "completed") {
      throw new TaskManagerError("任务已完成，无需继续", 400, "INVALID_TASK_STATE");
    }
    if (fresh) {
      task.downloadedBytes = 0;
      task.totalBytes = 0;
      task.progress = 0;
      task.filePath = null;
      task.fileName = null;
      task.fileSize = null;
      // 等待清理完成，避免与随后启动的 worker 竞争临时目录
      await this.removeTemp(task);
    }
    task.status = "queued";
    task.error = null;
    task.speed = 0;
    task.finishedAt = null;
    task.updatedAt = Date.now();
    if (!this.queue.includes(task.id)) this.queue.push(task.id);
    this.emitTask(task);
    this.persist();
    this.kickPump();
    return { ...task };
  }

  private async cancel(task: DownloadTask): Promise<DownloadTask> {
    const entry = this.running.get(task.id);
    if (entry) {
      entry.cancelRequested = true;
      entry.controller.abort();
    }
    this.dequeue(task.id);
    task.status = "cancelled";
    task.speed = 0;
    task.updatedAt = Date.now();
    task.finishedAt = Date.now();
    this.emitTask(task);
    this.persist();
    await this.removeTemp(task);
    return { ...task };
  }

  private remove(task: DownloadTask): null {
    const entry = this.running.get(task.id);
    if (entry) {
      entry.cancelRequested = true;
      entry.controller.abort();
    }
    this.dequeue(task.id);
    this.tasks.delete(task.id);
    this.lastEmitAt.delete(task.id);
    this.samples.delete(task.id);
    this.smoothedSpeed.delete(task.id);
    publishTaskEvent({ type: "task-deleted", id: task.id });
    this.persist();
    void this.removeTemp(task);
    return null;
  }

  private dequeue(taskId: string): void {
    let index = this.queue.indexOf(taskId);
    while (index >= 0) {
      this.queue.splice(index, 1);
      index = this.queue.indexOf(taskId);
    }
  }

  private async removeTemp(task: DownloadTask): Promise<void> {
    try {
      const settings = await getSettings();
      await cleanupTaskTemp(resolveDownloadDir(settings.downloadDir), task.id);
    } catch (error) {
      console.warn("[manager] 清理临时文件失败:", errorMessage(error));
    }
  }

  /** 批量清理：completed / error / all。返回删除数量（会同步发 task-deleted 事件）。 */
  async clear(status: "completed" | "error" | "all"): Promise<number> {
    await this.ensureInitialized();
    const targets = [...this.tasks.values()].filter((task) => (status === "all" ? true : task.status === status));
    for (const task of targets) {
      this.remove(task);
    }
    return targets.length;
  }

  /** 导入任务：重新生成 id、状态重置 paused、按 bvid+cid+page 去重。 */
  async importTasks(tasks: DownloadTask[]): Promise<number> {
    await this.ensureInitialized();
    const keys = new Set([...this.tasks.values()].map((task) => taskKey(task)));
    const now = Date.now();
    let imported = 0;
    for (const source of tasks) {
      const key = taskKey(source);
      if (keys.has(key)) continue;
      const task: DownloadTask = {
        ...source,
        id: randomUUID(),
        status: "paused",
        progress: 0,
        downloadedBytes: 0,
        totalBytes: 0,
        speed: 0,
        filePath: null,
        fileName: null,
        fileSize: null,
        error: null,
        startedAt: null,
        finishedAt: null,
        createdAt: now - imported,
        updatedAt: now,
      };
      this.tasks.set(task.id, task);
      this.lastEmitAt.set(task.id, 0);
      keys.add(key);
      imported += 1;
      this.emitTask(task);
    }
    if (imported > 0) this.persist();
    return imported;
  }

  /** 设置变更（如并发数）后重新调度队列。 */
  notifySettingsChanged(): void {
    this.kickPump();
  }

  /** 安全触发队列调度（吞掉异常，避免未处理的 Promise rejection）。 */
  private kickPump(): void {
    void this.pump().catch((error: unknown) => {
      console.error("[manager] 调度下载队列失败:", errorMessage(error));
    });
  }

  /* --------------------------------------------------------------- 队列调度 */

  private async pump(): Promise<void> {
    await this.ensureInitialized();
    if (this.pumping) {
      this.pumpAgain = true;
      return;
    }
    this.pumping = true;
    try {
      do {
        this.pumpAgain = false;
        const settings = await getSettings();
        const maxConcurrent = Math.max(1, Math.min(MAX_CONCURRENT_LIMIT, settings.maxConcurrent || 1));
        while (this.running.size < maxConcurrent) {
          const nextId = this.queue.shift();
          if (!nextId) break;
          const task = this.tasks.get(nextId);
          if (!task || task.status !== "queued" || this.running.has(task.id)) continue;
          this.startTask(task);
        }
      } while (this.pumpAgain);
    } finally {
      this.pumping = false;
    }
  }

  private startTask(task: DownloadTask): void {
    const controller = new AbortController();
    const entry: RunningEntry = { controller, pauseRequested: false, cancelRequested: false };
    this.running.set(task.id, entry);
    this.samples.set(task.id, []);
    this.smoothedSpeed.delete(task.id);
    task.status = "downloading";
    task.startedAt = task.startedAt ?? Date.now();
    task.updatedAt = Date.now();
    task.error = null;
    task.speed = 0;
    this.emitTask(task);
    this.persist();
    void this.runTask(task, entry).catch((error: unknown) => {
      console.error("[manager] 任务执行器异常:", errorMessage(error));
    });
  }

  private async runTask(task: DownloadTask, entry: RunningEntry): Promise<void> {
    let result: WorkerResult;
    try {
      const current = this.tasks.get(task.id);
      if (!current) {
        this.running.delete(task.id);
        return;
      }
      result = await executeTask({
        task: current,
        signal: entry.controller.signal,
        patch: (patch) => this.applyPatch(task.id, patch),
      });
    } catch (error) {
      result = { status: "error", error: errorMessage(error) };
    }
    this.running.delete(task.id);
    const current = this.tasks.get(task.id);
    if (!current) return;
    const now = Date.now();
    try {
      if (entry.cancelRequested) {
        current.status = "cancelled";
        current.speed = 0;
        current.progress = 0;
        current.updatedAt = now;
        current.finishedAt = now;
      } else if (entry.pauseRequested) {
        current.status = "paused";
        current.speed = 0;
        current.updatedAt = now;
      } else if (result.status === "completed") {
        current.status = "completed";
        current.progress = 100;
        current.speed = 0;
        current.updatedAt = now;
        current.finishedAt = now;
        current.filePath = result.filePath ?? null;
        current.fileName = result.fileName ?? null;
        current.fileSize = result.fileSize ?? null;
        current.format = result.format ?? current.format;
        if (result.qn) current.qn = result.qn;
        if (result.qualityName) current.qualityName = result.qualityName;
        if (result.codec) current.codec = result.codec;
        if (typeof result.subtitleCount === "number") current.subtitleCount = result.subtitleCount;
        if (typeof result.danmakuCount === "number") current.danmakuCount = result.danmakuCount;
        if (result.danmakuPath !== undefined) current.danmakuPath = result.danmakuPath;
        current.error = result.error ?? null;
        if (current.totalBytes > 0) current.downloadedBytes = current.totalBytes;
      } else {
        current.status = "error";
        current.speed = 0;
        current.updatedAt = now;
        current.finishedAt = now;
        current.error = result.error ?? "下载失败";
      }
    } finally {
      this.samples.delete(task.id);
      this.smoothedSpeed.delete(task.id);
      this.emitTask(current);
      this.persist();
      if (current.status === "cancelled" || current.status === "completed") {
        await this.removeTemp(current);
      }
      this.kickPump();
    }
  }

  /** worker 进度/状态回写：内存立即更新，SSE 最多 500ms 推送一次，速度用最近 2s 采样。 */
  private applyPatch(taskId: string, patch: Partial<DownloadTask>): void {
    const task = this.tasks.get(taskId);
    if (!task) return;
    const entry = this.running.get(taskId);
    const blocked = Boolean(entry && (entry.pauseRequested || entry.cancelRequested));

    for (const [key, value] of Object.entries(patch) as Array<[keyof DownloadTask, unknown]>) {
      if (value === undefined) continue;
      if (key === "status" && blocked) continue;
      (task as unknown as Record<string, unknown>)[key] = value;
    }

    if (typeof patch.downloadedBytes === "number" || typeof patch.totalBytes === "number") {
      const total = Math.max(0, task.totalBytes);
      const downloaded = Math.max(0, task.downloadedBytes);
      if (total > 0) task.progress = Math.min(99.9, Math.round((downloaded / total) * 1000) / 10);
      this.updateSpeed(taskId, task, downloaded);
    }
    task.updatedAt = Date.now();

    const now = Date.now();
    const lastEmit = this.lastEmitAt.get(taskId) ?? 0;
    if (patch.status !== undefined || now - lastEmit >= PROGRESS_EMIT_INTERVAL_MS) {
      this.lastEmitAt.set(taskId, now);
      this.emitTask(task);
      this.persist();
    }
  }

  /**
   * 速度估算：按 ~10Hz 采集最近 2.5s 的已下载字节，计算窗口内平均速度后再做指数平滑。
   * 不能用「固定采样条数」截断（多线程分片时 100+ 次/秒的进度回调会把窗口挤到 <1s），
   * 否则速度会长时间停在旧值或剧烈抖动；这里按时间窗口裁剪，并显式做 EMA。
   */
  private updateSpeed(taskId: string, task: DownloadTask, downloaded: number): void {
    const now = Date.now();
    let samples = this.samples.get(taskId);
    if (!samples) {
      samples = [];
      this.samples.set(taskId, samples);
    }
    const last = samples[samples.length - 1];
    if (!last) {
      samples.push({ at: now, bytes: downloaded });
    } else if (downloaded !== last.bytes) {
      if (now - last.at >= SPEED_SAMPLE_INTERVAL_MS) {
        samples.push({ at: now, bytes: downloaded });
      } else {
        // 同一采样间隔内合并为最新值，保证窗口覆盖真实时间跨度
        last.at = now;
        last.bytes = downloaded;
      }
    }
    while (samples.length > 2 && samples[1].at < now - SPEED_WINDOW_MS) samples.shift();
    if (samples.length > SPEED_MAX_SAMPLES) samples.splice(0, samples.length - SPEED_MAX_SAMPLES);

    const first = samples[0];
    const final = samples[samples.length - 1];
    if (!first || !final || final.bytes <= first.bytes) return;
    const elapsed = (final.at - first.at) / 1000;
    if (elapsed * 1000 < SPEED_MIN_SPAN_MS) return;
    const instant = (final.bytes - first.bytes) / elapsed;
    if (!Number.isFinite(instant) || instant <= 0) return;
    const previous = this.smoothedSpeed.get(taskId) ?? instant;
    const smoothed = previous * (1 - SPEED_EMA_ALPHA) + instant * SPEED_EMA_ALPHA;
    if (!Number.isFinite(smoothed) || smoothed <= 0) return;
    this.smoothedSpeed.set(taskId, smoothed);
    task.speed = Math.round(smoothed);
  }
}

const globalScope = globalThis as unknown as { __bilidownTaskManager?: TaskManager };

/** 获取全局唯一的 TaskManager。 */
export function getTaskManager(): TaskManager {
  if (!globalScope.__bilidownTaskManager) {
    globalScope.__bilidownTaskManager = new TaskManager();
    process.once("beforeExit", () => {
      void flushTasks();
    });
  }
  return globalScope.__bilidownTaskManager;
}
