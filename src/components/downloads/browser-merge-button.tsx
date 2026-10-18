"use client";

import { useState } from "react";
import { Download, Film, Loader2, Share2 } from "lucide-react";
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
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";
import {
  fetchBytesWithProgress,
  mergeVideoAudioInBrowser,
  resetBrowserFfmpeg,
  type BrowserFfmpegProgress,
} from "@/lib/browser-ffmpeg";
import { downloadBlob, fileBaseName, saveOrShareBlob } from "@/lib/download";
import { formatBytes } from "@/lib/format";
import type { DownloadTask } from "@/lib/types";

/** 首次使用提示的 localStorage 键（避免手机流量用户被 31MB 引擎“偷袭”）。 */
const FIRST_USE_KEY = "bilidown:browser-ffmpeg-first-use";
/** 超过该大小的任务在合并前额外提示内存风险。 */
const LARGE_TASK_BYTES = 512 * 1024 * 1024;

type Phase =
  | { kind: "idle" }
  | { kind: "running"; label: string; ratio: number | null }
  | { kind: "done"; blob: Blob; fileName: string }
  | { kind: "error"; message: string };

interface BrowserMergeButtonProps {
  task: DownloadTask;
  /** 浏览器端 ffmpeg.wasm 资源是否就绪（/api/system/info 检测） */
  available: boolean;
  /** 引擎 wasm 字节数（用于首次使用提示） */
  coreBytes: number | null;
}

function safeBaseName(task: DownloadTask): string {
  const raw = task.fileName?.trim();
  if (!raw) return task.title || task.bvid;
  return fileBaseName(raw.replace(/\.video\.m4s$/i, "").replace(/\.m4s$/i, ""));
}

/**
 * 服务端没有 ffmpeg 时，在浏览器内用 ffmpeg.wasm 把已下载好的音视频分片合成 MP4。
 * 手机网页端同样可用：首次点击会加载约 31MB 引擎，之后走浏览器缓存。
 */
export function BrowserMergeButton({ task, available, coreBytes }: BrowserMergeButtonProps) {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmLarge, setConfirmLarge] = useState(false);

  const taskBytes = task.fileSize ?? task.totalBytes ?? 0;
  const engineHint = coreBytes && coreBytes > 0 ? formatBytes(coreBytes) : "约 31MB";
  // 旧任务的 audioFilePath 字段可能缺失：按「无声-」文件名约定推断是否有音轨
  const hasAudioPart =
    Boolean(task.audioFilePath) ||
    Boolean(task.fileName && !task.fileName.startsWith("无声-"));

  function applyProgress(progress: BrowserFfmpegProgress): void {
    setPhase({ kind: "running", label: progress.label, ratio: progress.ratio });
  }

  async function startMerge(): Promise<void> {
    setPhase({ kind: "running", label: "正在准备浏览器合并…", ratio: null });
    const toastId = toast.loading("正在准备浏览器端 ffmpeg…");
    try {
      resetBrowserFfmpeg();

      applyProgress({ stage: "video", label: "正在读取视频分片…", ratio: null });
      const videoBytes = await fetchBytesWithProgress(api.tasks.partFileUrl(task.id, "video"), (loaded, total) => {
        applyProgress({
          stage: "video",
          label:
            "正在读取视频分片 " +
            (total > 0 ? Math.round((loaded / total) * 100) + "%" : formatBytes(loaded)),
          ratio: total > 0 ? Math.min(1, loaded / total) : null,
        });
      });

      let audioBytes: Uint8Array | null = null;
      if (hasAudioPart) {
        applyProgress({ stage: "audio", label: "正在读取音频分片…", ratio: null });
        audioBytes = await fetchBytesWithProgress(api.tasks.partFileUrl(task.id, "audio"), (loaded, total) => {
          applyProgress({
            stage: "audio",
            label:
              "正在读取音频分片 " +
              (total > 0 ? Math.round((loaded / total) * 100) + "%" : formatBytes(loaded)),
            ratio: total > 0 ? Math.min(1, loaded / total) : null,
          });
        });
      }

      const result = await mergeVideoAudioInBrowser({
        video: videoBytes,
        audio: audioBytes,
        fileName: safeBaseName(task) + ".mp4",
        onProgress: (progress) => {
          applyProgress(progress);
          toast.loading(progress.label, { id: toastId });
        },
      });

      // 先在用户手势链路内触发一次浏览器下载；iOS 若未自动保存，可再点“再次保存/分享”
      downloadBlob(result.blob, result.fileName);
      setPhase({ kind: "done", blob: result.blob, fileName: result.fileName });
      toast.success(
        "已合并为 " + result.fileName + "（" + formatBytes(result.blob.size) + "），浏览器已开始保存",
        { id: toastId },
      );
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "浏览器合并失败";
      setPhase({ kind: "error", message });
      toast.error(message, { id: toastId });
    }
  }

  function handleClick(): void {
    if (phase.kind === "running") return;
    if (phase.kind === "done") {
      void saveOrShareBlob(phase.blob, phase.fileName)
        .then((result) => {
          if (result === "downloaded") toast.success("已重新保存 " + phase.fileName);
        })
        .catch(() => toast.error("保存失败，请重试"));
      return;
    }
    const firstUse = !window.localStorage.getItem(FIRST_USE_KEY);
    const large = taskBytes > LARGE_TASK_BYTES;
    if (firstUse || large) {
      setConfirmLarge(large);
      setConfirmOpen(true);
      return;
    }
    void startMerge();
  }

  function handleConfirm(): void {
    try {
      window.localStorage.setItem(FIRST_USE_KEY, "1");
    } catch {
      // 隐私模式下 localStorage 不可用：每次提示即可
    }
    setConfirmOpen(false);
    void startMerge();
  }

  const running = phase.kind === "running";
  const label =
    phase.kind === "running"
      ? phase.label
      : phase.kind === "done"
        ? "再次保存 / 分享"
        : phase.kind === "error"
          ? "重试浏览器合并"
          : "浏览器合并";

  if (!available) return null;

  return (
    <>
      <Button
        size="sm"
        variant={phase.kind === "error" ? "outline" : "secondary"}
        disabled={running}
        title={
          running
            ? phase.label
            : phase.kind === "done"
              ? "再次保存或分享合并结果（手机可存到文件/相册）"
              : phase.kind === "error"
                ? "上次合并失败：" + phase.message
                : "在浏览器内用 ffmpeg.wasm 合并音视频分片（无需服务端 ffmpeg）"
        }
        onClick={handleClick}
      >
        {running ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : phase.kind === "done" ? (
          <Share2 className="h-4 w-4" />
        ) : phase.kind === "error" ? (
          <Download className="h-4 w-4" />
        ) : (
          <Film className="h-4 w-4" />
        )}
        <span className="max-w-40 truncate sm:max-w-none">{label}</span>
      </Button>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>在浏览器内合并音视频？</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  服务端没有可用的 ffmpeg，将用浏览器自带的 ffmpeg.wasm 把已下载的音视频分片合成 MP4。
                </p>
                <p>首次使用需要下载 {engineHint} 的合并引擎（之后会走浏览器缓存）；手机端建议在 Wi-Fi 下进行。</p>
                {confirmLarge ? (
                  <p className="text-amber-600 dark:text-amber-400">
                    本任务约 {formatBytes(taskBytes)}，合并时需要约 2~3 倍文件大小的内存，手机上可能失败；失败不会影响已下载的分片文件。
                  </p>
                ) : null}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm}>开始合并</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
