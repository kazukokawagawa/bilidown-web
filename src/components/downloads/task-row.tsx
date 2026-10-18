"use client";

import { useState } from "react";
import {
  Copy,
  ExternalLink,
  FileAudio,
  FileDown,
  Film,
  FolderOpen,
  Pause,
  Play,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { StatusBadge } from "@/components/shared/status-badge";
import { api, getErrorMessage } from "@/lib/api-client";
import { getDesktopBridge } from "@/lib/desktop";
import { CODEC_NAMES } from "@/lib/constants";
import { formatBytes, formatEta, formatSpeed } from "@/lib/format";
import type { DownloadTask, TaskAction } from "@/lib/types";
import { BrowserMergeButton } from "./browser-merge-button";

interface TaskRowProps {
  task: DownloadTask;
  busy: boolean;
  /** /api/system/info：浏览器端 ffmpeg.wasm 资源是否就绪 */
  browserFfmpegAvailable: boolean;
  /** 浏览器端 ffmpeg 引擎 wasm 字节数（首次使用提示） */
  browserFfmpegBytes: number | null;
  onAction: (id: string, action: TaskAction) => void;
}

function taskPercent(task: DownloadTask): number {
  if (task.status === "completed") return 100;
  if (task.totalBytes > 0) {
    return Math.max(0, Math.min(100, (task.downloadedBytes / task.totalBytes) * 100));
  }
  return Math.max(0, Math.min(100, task.progress));
}

function etaSeconds(task: DownloadTask): number | null {
  if (task.status !== "downloading" || task.totalBytes <= 0 || task.speed <= 0) return null;
  const remaining = task.totalBytes - task.downloadedBytes;
  if (remaining <= 0) return null;
  return remaining / task.speed;
}

function statusDetail(task: DownloadTask): string {
  switch (task.status) {
    case "queued":
      return "排队等待中…";
    case "downloading": {
      // 服务端速度已做 5s 窗口 + EMA 平滑，这里只负责展示；
      // 速度为 0 时（刚开始/网络抖动）不拼接无意义的「0 B/s · 剩余 --」。
      if (task.speed <= 0) {
        return task.downloadedBytes > 0 ? "正在下载…" : "正在连接…";
      }
      const eta = etaSeconds(task);
      if (eta === null) {
        return formatSpeed(task.speed);
      }
      return formatSpeed(task.speed) + " · 剩余 " + formatEta(eta);
    }
    case "merging": {
      const subtitles = task.embedSubtitles && !task.audioOnly;
      const danmaku = task.embedDanmaku && !task.audioOnly;
      if (subtitles && danmaku) return "正在合并音视频、字幕与弹幕…";
      if (subtitles) return "正在合并音视频与字幕…";
      if (danmaku) return "正在合并音视频与弹幕…";
      return "正在合并音视频…";
    }
    case "completed": {
      let detail = "已完成";
      if (task.embedSubtitles && task.subtitleCount > 0) {
        detail += " · 已内嵌 " + task.subtitleCount + " 条字幕";
      }
      if (task.embedDanmaku && task.danmakuCount > 0) {
        detail += " · 已内嵌 " + task.danmakuCount + " 条弹幕";
      }
      if (task.saveDanmaku && task.danmakuCount > 0) {
        detail += " · 已保存 " + task.danmakuCount + " 条弹幕";
      }
      return detail;
    }
    case "paused":
      return "已暂停，可继续下载";
    case "error":
      return "下载失败";
    case "cancelled":
      return "已取消";
  }
}

export function TaskRow({ task, busy, browserFfmpegAvailable, browserFfmpegBytes, onAction }: TaskRowProps) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const percent = taskPercent(task);
  const canPause = task.status === "queued" || task.status === "downloading";
  const canResume = task.status === "paused";
  const canCancel =
    task.status === "queued" ||
    task.status === "downloading" ||
    task.status === "merging" ||
    task.status === "paused";
  const canRetry = task.status === "error" || task.status === "cancelled";
  const canOpenFile = task.status === "completed";
  const totalSize = task.totalBytes > 0 ? task.totalBytes : task.fileSize ?? 0;
  // 服务端未合并（format=m4s）时才能单独取回音视频分片 / 在浏览器内合并
  const isSplitTask = task.format === "m4s" && !task.audioOnly;
  const hasAudioPart =
    isSplitTask && (Boolean(task.audioFilePath) || Boolean(task.fileName && !task.fileName.startsWith("无声-")));

  async function handleReveal() {
    try {
      const data = await api.tasks.reveal(task.id);
      const desktop = getDesktopBridge();
      if (desktop) {
        await desktop.showItemInFolder(data.path);
        toast.success("已在资源管理器中定位文件");
      } else {
        await navigator.clipboard.writeText(data.path);
        toast.success("文件路径已复制到剪贴板");
      }
    } catch (cause) {
      toast.error(getErrorMessage(cause));
    }
  }

  async function handleCopyBv() {
    try {
      await navigator.clipboard.writeText(task.bvid);
      toast.success("BV 号已复制到剪贴板");
    } catch {
      toast.error("复制失败，请手动复制");
    }
  }

  return (
    <Card className="overflow-hidden py-0">
      <div className="flex flex-col gap-3 p-4 sm:flex-row">
        <div className="relative h-[72px] w-32 shrink-0 overflow-hidden rounded-md border bg-muted">
          {task.cover ? (
            // B 站图片需要 no-referrer，否则会被防盗链拦截
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={task.cover}
              alt={task.title}
              referrerPolicy="no-referrer"
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <Film className="h-6 w-6" />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <StatusBadge status={task.status} />
                {task.partTitle ? (
                  <Badge variant="outline" className="max-w-40 truncate font-normal">
                    P{task.page} {task.partTitle}
                  </Badge>
                ) : null}
                {task.listTitle ? (
                  <Badge variant="outline" className="max-w-48 truncate font-normal">
                    列表 · {task.listTitle}
                  </Badge>
                ) : null}
                {task.qualityName ? (
                  <Badge variant="outline" className="font-normal">
                    {task.qualityName}
                  </Badge>
                ) : null}
                <Badge variant="outline" className="font-normal">
                  {CODEC_NAMES[task.codec]}
                </Badge>
                {task.audioOnly ? (
                  <Badge variant="secondary" className="font-normal">
                    仅音频
                  </Badge>
                ) : null}
                {task.embedSubtitles && !task.audioOnly ? (
                  <Badge variant="secondary" className="font-normal">
                    {task.status === "completed" && task.subtitleCount > 0
                      ? "内嵌字幕 ×" + task.subtitleCount
                      : "内嵌字幕"}
                  </Badge>
                ) : null}
                {task.embedDanmaku && !task.audioOnly ? (
                  <Badge variant="secondary" className="font-normal">
                    {task.status === "completed" && task.danmakuCount > 0
                      ? "内嵌弹幕 ×" + task.danmakuCount
                      : "内嵌弹幕"}
                  </Badge>
                ) : null}
                {task.saveDanmaku ? (
                  <Badge variant="secondary" className="font-normal">
                    弹幕文件
                  </Badge>
                ) : null}
              </div>
              <a
                href={task.sourceUrl || "https://www.bilibili.com/video/" + task.bvid}
                target="_blank"
                rel="noreferrer"
                className="block truncate font-medium hover:underline"
                title={task.title}
              >
                {task.title}
              </a>
              <p className="truncate text-xs text-muted-foreground">
                {task.upName ? task.upName + " · " : ""}
                {task.bvid}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {canPause ? (
                <Button
                  size="icon-sm"
                  variant="outline"
                  title="暂停"
                  aria-label="暂停"
                  disabled={busy}
                  onClick={() => onAction(task.id, "pause")}
                >
                  <Pause className="h-4 w-4" />
                </Button>
              ) : null}
              {canResume ? (
                <Button
                  size="icon-sm"
                  variant="outline"
                  title="继续"
                  aria-label="继续"
                  disabled={busy}
                  onClick={() => onAction(task.id, "resume")}
                >
                  <Play className="h-4 w-4" />
                </Button>
              ) : null}
              {canCancel ? (
                <Button
                  size="icon-sm"
                  variant="outline"
                  title="取消"
                  aria-label="取消"
                  disabled={busy}
                  onClick={() => onAction(task.id, "cancel")}
                >
                  <X className="h-4 w-4" />
                </Button>
              ) : null}
              {canRetry ? (
                <Button
                  size="icon-sm"
                  variant="outline"
                  title="重试"
                  aria-label="重试"
                  disabled={busy}
                  onClick={() => onAction(task.id, "retry")}
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
              ) : null}
              {canOpenFile ? (
                <>
                  {isSplitTask ? (
                    <BrowserMergeButton
                      task={task}
                      available={browserFfmpegAvailable}
                      coreBytes={browserFfmpegBytes}
                    />
                  ) : null}
                  <Button
                    size="icon-sm"
                    variant="outline"
                    title="复制 BV 号"
                    aria-label="复制 BV 号"
                    onClick={() => void handleCopyBv()}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button asChild size="icon-sm" variant="outline" title="在浏览器打开视频">
                    <a
                      href={task.sourceUrl || "https://www.bilibili.com/video/" + task.bvid}
                      target="_blank"
                      rel="noreferrer"
                      aria-label="在浏览器打开视频"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </Button>
                  <Button asChild size="sm" variant="outline" title={isSplitTask ? "下载视频分片" : "下载文件"}>
                    <a href={api.tasks.fileUrl(task.id)}>
                      <FileDown className="h-4 w-4" />
                      <span className="hidden sm:inline">{isSplitTask ? "下载视频" : "下载文件"}</span>
                    </a>
                  </Button>
                  {hasAudioPart ? (
                    <Button asChild size="sm" variant="outline" title="下载音频分片">
                      <a href={api.tasks.partFileUrl(task.id, "audio")}>
                        <FileAudio className="h-4 w-4" />
                        <span className="hidden sm:inline">下载音频</span>
                      </a>
                    </Button>
                  ) : null}
                </>
              ) : null}
              {canOpenFile && task.filePath ? (
                <Button
                  size="icon-sm"
                  variant="outline"
                  title="复制文件路径"
                  aria-label="复制文件路径"
                  onClick={() => void handleReveal()}
                >
                  <FolderOpen className="h-4 w-4" />
                </Button>
              ) : null}
              <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                <AlertDialogTrigger asChild>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    title="删除任务"
                    aria-label="删除任务"
                    disabled={busy}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>删除该任务？</AlertDialogTitle>
                    <AlertDialogDescription>
                      「{task.title}」的任务记录将被删除，已下载的文件不会被删除。
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>取消</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-white hover:bg-destructive/90"
                      onClick={() => onAction(task.id, "delete")}
                    >
                      删除
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>

          <Progress value={percent} className="h-2" />

          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>{statusDetail(task)}</span>
            <span className="tabular-nums">
              {task.totalBytes > 0 ? (
                <>
                  {formatBytes(task.downloadedBytes)} / {formatBytes(totalSize)}
                  {" · "}
                  {percent.toFixed(1)}%
                </>
              ) : (
                // 总大小未知时只展示已下载字节（无数据时退回文件大小），避免出现「0 B / 0 B」。
                <>{formatBytes(task.downloadedBytes > 0 ? task.downloadedBytes : totalSize)}</>
              )}
            </span>
          </div>

          {task.status === "error" && task.error ? (
            <p className="rounded-md bg-destructive/10 px-2 py-1 text-xs text-destructive">{task.error}</p>
          ) : null}
          {task.status === "completed" && task.error ? (
            // 已完成任务也可能带告警（如字幕内嵌失败），用琥珀色与失败状态区分。
            <p className="rounded-md bg-amber-500/10 px-2 py-1 text-xs text-amber-700 dark:text-amber-400">
              {task.error}
            </p>
          ) : null}
          {task.status === "completed" && task.fileName ? (
            <p className="truncate text-xs text-muted-foreground" title={task.fileName}>
              文件名：{task.fileName}
            </p>
          ) : null}
          {task.status === "completed" && task.danmakuPath ? (
            <p className="truncate text-xs text-muted-foreground" title={task.danmakuPath}>
              弹幕：{task.danmakuPath}
            </p>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
