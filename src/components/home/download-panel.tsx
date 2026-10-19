"use client";

import { useState } from "react";
import { Download, Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { CODEC_NAMES, QUALITY_LABELS } from "@/lib/constants";
import { formatBytes } from "@/lib/format";
import { collectSelectedItems, selectionKey } from "@/lib/selection";
import { revealDelay } from "@/components/shared/motion";
import { cn } from "@/lib/utils";
import type { Codec, CollectionEpisode, StreamDetail, VideoInfo, VideoPage } from "@/lib/types";

function playerUrl(bvid: string, page: number): string {
  return (
    "https://player.bilibili.com/player.html?bvid=" +
    encodeURIComponent(bvid) +
    "&page=" +
    String(page) +
    "&high_quality=1&danmaku=0"
  );
}

function SummaryRow({ label, value, index }: { label: string; value: string; index: number }) {
  return (
    <div
      className="anim-fade-up flex items-center justify-between gap-3"
      style={revealDelay(index, 35, 10)}
    >
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

function episodesSummary(episodes: CollectionEpisode[], collectionTitle: string | null): string {
  const count = "已选 " + String(episodes.length) + " 集";
  return collectionTitle ? collectionTitle + "（" + count + "）" : count;
}

/** 选中条目数量文案：番剧/合集用「集」，多P用「个分P」，混合用「个条目」。 */
function countText(count: number, pages: VideoPage[], episodes: CollectionEpisode[]): string {
  if (episodes.length > 0 && pages.length === 0) return String(count) + " 集";
  if (pages.length > 0 && episodes.length === 0) return String(count) + " 个分P";
  return String(count) + " 个条目";
}

interface DownloadPanelProps {
  video: VideoInfo;
  pages: VideoPage[];
  episodes: CollectionEpisode[];
  collectionTitle?: string | null;
  qn: number | null;
  codec: Codec | null;
  audioOnly: boolean;
  embedSubtitles: boolean;
  embedDanmaku: boolean;
  saveDanmaku: boolean;
  listFolder: boolean;
  ffmpegAvailable: boolean;
  stream: StreamDetail | null;
  /** 取流所用的主分P（用于按条目时长折算预估体积） */
  primaryPage: VideoPage | null;
  previewPageNumber?: number;
  creating: boolean;
  disabled: boolean;
  onDownload: () => void;
}

export function DownloadPanel({
  video,
  pages,
  episodes,
  collectionTitle,
  qn,
  codec,
  audioOnly,
  embedSubtitles,
  embedDanmaku,
  saveDanmaku,
  listFolder,
  ffmpegAvailable,
  stream,
  primaryPage,
  previewPageNumber,
  creating,
  disabled,
  onDownload,
}: DownloadPanelProps) {
  const [previewOpen, setPreviewOpen] = useState(false);
  // 分P 与合集剧集合并去重，批量建任务与体积预估都按去重后的条目计算。
  const sizeItems = collectSelectedItems(video.bvid, pages, episodes);
  const selectedCount = sizeItems.length;
  // 无分P也可预览：回退到预览页码或第 1 P。
  const previewPage = previewPageNumber ?? pages[0]?.page ?? 1;
  const qualityName =
    stream?.label || (qn !== null ? QUALITY_LABELS[qn] ?? String(qn) : "未知");
  const codecName = codec ? CODEC_NAMES[codec] : "未知";
  const audioSize = stream?.audio?.size ?? 0;
  const videoSize = stream?.video?.size ?? 0;
  const singleItemSize = audioOnly ? audioSize : audioSize + videoSize;
  // 取流所对应主分P的时长：服务端用该时长把 bandwidth 折算成单个条目的预估体积。
  const referenceDuration =
    primaryPage && primaryPage.duration > 0
      ? primaryPage.duration
      : video.pages[0] && video.pages[0].duration > 0
        ? video.pages[0].duration
        : video.duration;
  // 同一清晰度/编码下各条目码率基本一致，按主分P码率 × 各条目时长累加得到总预估。
  let bytesPerSecond = audioOnly
    ? (stream?.audio?.bandwidth ?? 0) / 8
    : ((stream?.audio?.bandwidth ?? 0) + (stream?.video?.bandwidth ?? 0)) / 8;
  if (bytesPerSecond <= 0 && referenceDuration > 0) {
    bytesPerSecond = singleItemSize / referenceDuration;
  }
  // 主分P 自身的体积直接用服务端返回值（更精确），其余条目按码率 × 时长折算。
  const referenceKey = primaryPage ? selectionKey(video.bvid, primaryPage.cid, primaryPage.page) : null;
  const estimatedSize =
    selectedCount === 0
      ? singleItemSize
      : sizeItems.reduce((sum, item) => {
          if (referenceKey !== null && item.key === referenceKey) return sum + singleItemSize;
          if (item.duration > 0 && bytesPerSecond > 0) return sum + item.duration * bytesPerSecond;
          return sum + singleItemSize;
        }, 0);
  const totalSize = Math.round(estimatedSize);
  // 未选中时展示主分P 本身的体积；仅选中主分P 时也是精确值；其余单条为按码率折算的估算，加「约」提示。
  const singleExact =
    selectedCount === 0 ||
    (selectedCount === 1 && referenceKey !== null && sizeItems[0].key === referenceKey);
  const sizeText =
    totalSize > 0
      ? selectedCount > 1
        ? "约 " + formatBytes(totalSize) + "（" + countText(selectedCount, pages, episodes) + "）"
        : (singleExact ? "" : "约 ") + formatBytes(totalSize)
      : "未知";
  const formatText = audioOnly
    ? "M4A 音频"
    : (embedSubtitles || embedDanmaku) && ffmpegAvailable
      ? "MKV 视频（可含内嵌字幕/弹幕）"
      : "MP4 视频";
  const downloadLabel = selectedCount > 1 ? "开始下载（" + String(selectedCount) + " 个任务）" : "开始下载";

  // 只有「列表批量」才会建子文件夹：合集多集，或多P视频勾选分P。
  const isListBatch = episodes.length > 0 || (pages.length > 0 && video.pages.length > 1);
  const folderName = episodes.length > 0 ? collectionTitle ?? video.title : video.title;
  const showFolder = listFolder && isListBatch;
  const saveLocation = showFolder ? "下载目录 / " + folderName + "/" : "下载目录";

  const danmakuTexts: string[] = [];
  if (embedDanmaku) danmakuTexts.push("内嵌弹幕（ASS 软字幕）");
  if (saveDanmaku) danmakuTexts.push("单独保存到 弹幕/ 文件夹");

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
          {pages.length > 0 ? <SummaryRow label="分P" value={pagesSummary(pages)} index={0} /> : null}
          {episodes.length > 0 ? <SummaryRow label="合集" value={episodesSummary(episodes, collectionTitle ?? null)} index={1} /> : null}
          <SummaryRow label="保存位置" value={saveLocation} index={2} />
          {danmakuTexts.length > 0 ? <SummaryRow label="弹幕" value={danmakuTexts.join("；")} index={3} /> : null}
          <SummaryRow label="清晰度" value={qualityName} index={4} />
          <SummaryRow label="编码" value={audioOnly ? "仅音频" : codecName} index={5} />
          <SummaryRow label="格式" value={formatText} index={6} />
          <SummaryRow label={selectedCount > 1 ? "预计总大小" : "预计大小"} value={sizeText} index={7} />
        </div>

        <Button
          type="button"
          className={cn("w-full", !disabled && !creating && "btn-sheen")}
          size="lg"
          onClick={onDownload}
          disabled={disabled || creating}
        >
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {creating ? "创建中…" : downloadLabel}
        </Button>

        <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
          <DialogTrigger asChild>
            <Button type="button" variant="outline" className="group w-full" size="lg">
              <Play className="h-4 w-4 transition-transform duration-200 group-hover:scale-110" />
              在线预览{pages.length > 1 ? "（首个分P）" : ""}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl gap-0 overflow-hidden p-0">
            <DialogHeader className="border-b px-4 py-3">
              <DialogTitle>在线预览</DialogTitle>
              <DialogDescription>使用 B 站官方播放器预览当前分P，清晰度以播放器自动选择为准。</DialogDescription>
            </DialogHeader>
            <iframe
              key={previewPage}
              title="B站官方播放器"
              src={playerUrl(video.bvid, previewPage)}
              className="aspect-video w-full bg-black"
              allow="autoplay; fullscreen; picture-in-picture"
              allowFullScreen
            />
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
