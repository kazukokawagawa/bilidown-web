"use client";

import { useState } from "react";
import { Download, Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { CODEC_NAMES, QUALITY_LABELS } from "@/lib/constants";
import { formatBytes } from "@/lib/format";
import type { Codec, StreamDetail, VideoInfo, VideoPage } from "@/lib/types";

function playerUrl(bvid: string, page: number): string {
  return (
    "https://player.bilibili.com/player.html?bvid=" +
    encodeURIComponent(bvid) +
    "&page=" +
    String(page) +
    "&high_quality=1&danmaku=0"
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-right font-medium">{value}</span>
    </div>
  );
}

function pagesSummary(pages: VideoPage[]): string {
  if (pages.length === 0) return "未选择分P";
  if (pages.length === 1) return "P" + String(pages[0].page) + " " + pages[0].title;
  return "已选 " + String(pages.length) + " 个分P";
}

interface DownloadPanelProps {
  video: VideoInfo;
  pages: VideoPage[];
  qn: number | null;
  codec: Codec | null;
  audioOnly: boolean;
  stream: StreamDetail | null;
  creating: boolean;
  disabled: boolean;
  onDownload: () => void;
}

export function DownloadPanel({
  video,
  pages,
  qn,
  codec,
  audioOnly,
  stream,
  creating,
  disabled,
  onDownload,
}: DownloadPanelProps) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const previewPage = pages[0] ?? null;
  const qualityName =
    stream?.label || (qn !== null ? QUALITY_LABELS[qn] ?? String(qn) : "未知");
  const codecName = codec ? CODEC_NAMES[codec] : "未知";
  const audioSize = stream?.audio?.size ?? 0;
  const videoSize = stream?.video?.size ?? 0;
  const totalSize = audioOnly ? audioSize : audioSize + videoSize;
  const sizeText = totalSize > 0 ? formatBytes(totalSize) + (pages.length > 1 ? " / P" : "") : "未知";
  const formatText = audioOnly ? "M4A 音频" : "MP4 视频";
  const downloadLabel =
    pages.length > 1 ? "开始下载（" + String(pages.length) + " 个任务）" : "开始下载";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Download className="h-4 w-4" />
          开始下载
        </CardTitle>
        <CardDescription>确认选择后创建下载任务，可在下载页查看进度。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2 rounded-lg border bg-muted/30 p-3 text-sm">
          <SummaryRow label="分P" value={pagesSummary(pages)} />
          <SummaryRow label="清晰度" value={qualityName} />
          <SummaryRow label="编码" value={audioOnly ? "仅音频" : codecName} />
          <SummaryRow label="格式" value={formatText} />
          <SummaryRow label="预计大小" value={sizeText} />
        </div>

        <Button type="button" className="w-full" size="lg" onClick={onDownload} disabled={disabled || creating}>
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {creating ? "创建中…" : downloadLabel}
        </Button>

        <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
          <DialogTrigger asChild>
            <Button type="button" variant="outline" className="w-full" disabled={!previewPage}>
              <Play className="h-4 w-4" />
              在线预览{pages.length > 1 ? "（首个分P）" : ""}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl gap-0 overflow-hidden p-0">
            <DialogHeader className="border-b px-4 py-3">
              <DialogTitle>在线预览</DialogTitle>
              <DialogDescription>使用 B 站官方播放器预览当前分P，清晰度以播放器自动选择为准。</DialogDescription>
            </DialogHeader>
            {previewPage ? (
              <iframe
                key={previewPage.page}
                title="B站官方播放器"
                src={playerUrl(video.bvid, previewPage.page)}
                className="aspect-video w-full bg-black"
                allow="autoplay; fullscreen; picture-in-picture"
                allowFullScreen
              />
            ) : null}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
