/* eslint-disable @next/next/no-img-element */
"use client";

import type { LucideIcon } from "lucide-react";
import { ExternalLink, MessageSquare, Play, Star, ThumbsUp } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatCount, formatDuration, formatUnixDate, stripHtml } from "@/lib/format";
import type { InputType, ParsedInput, VideoInfo, VideoPage } from "@/lib/types";

const INPUT_TYPE_LABELS: Record<InputType, string> = {
  bvid: "BV 号",
  av: "av 号",
  b23: "b23 短链",
  ep: "番剧 EP",
  ss: "番剧 SS",
  url: "视频链接",
};

interface StatItemProps {
  icon: LucideIcon;
  label: string;
  value: number;
}

function StatItem({ icon: Icon, label, value }: StatItemProps) {
  return (
    <div className="flex items-center gap-1.5 rounded-md bg-muted/50 px-2 py-1.5 text-xs">
      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="text-muted-foreground">{label}</span>
      <span className="ml-auto font-medium">{formatCount(value)}</span>
    </div>
  );
}

function selectedPagesText(pages: VideoPage[]): string {
  if (pages.length === 0) return "未选择分P";
  if (pages.length === 1) return "当前分P：P" + String(pages[0].page) + " " + pages[0].title;
  const numbers = pages
    .slice(0, 4)
    .map((page) => "P" + String(page.page))
    .join("、");
  return "已选 " + String(pages.length) + " 个分P：" + numbers + (pages.length > 4 ? " 等" : "");
}

/** 分P 与合集/剧集勾选合并展示；都没有勾选时提示先选择。 */
function selectionText(pages: VideoPage[], selectedEpisodesCount: number, episodeLabel: string): string {
  const pageText = pages.length > 0 ? selectedPagesText(pages) : null;
  const episodeText =
    selectedEpisodesCount > 0 ? episodeLabel + "已选 " + String(selectedEpisodesCount) + " 集" : null;
  if (pageText && episodeText) return pageText + " · " + episodeText;
  return pageText ?? episodeText ?? "未选择分P/合集";
}

interface VideoCardProps {
  video: VideoInfo;
  parsed: ParsedInput | null;
  selectedPages: VideoPage[];
  /** 已勾选的合集剧集数（用于底部选择摘要） */
  selectedEpisodesCount?: number;
}

export function VideoCard({ video, parsed, selectedPages, selectedEpisodesCount = 0 }: VideoCardProps) {
  const title = stripHtml(video.title);
  const desc = stripHtml(video.desc);
  const isBangumi = video.collection?.source === "pgc";
  // 番剧优先跳转 bangumi 播放页（ep 链接 > view.redirect_url > 普通视频页）
  const externalUrl =
    parsed?.type === "ep" && parsed.epId
      ? "https://www.bilibili.com/bangumi/play/ep" + String(parsed.epId)
      : video.redirectUrl || "https://www.bilibili.com/video/" + video.bvid;

  return (
    <Card className="overflow-hidden">
      <CardContent className="grid gap-4 p-4 sm:grid-cols-[240px_minmax(0,1fr)]">
        <div className="relative aspect-video overflow-hidden rounded-lg border bg-muted">
          {video.cover ? (
            <img
              src={video.cover}
              alt={title}
              referrerPolicy="no-referrer"
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : null}
          <Badge variant="secondary" className="absolute right-2 bottom-2 bg-black/70 font-normal text-white">
            {formatDuration(video.duration)}
          </Badge>
          {video.videos > 1 ? (
            <Badge variant="secondary" className="absolute top-2 left-2 bg-black/70 font-normal text-white">
              共 {video.videos} P
            </Badge>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          <div className="space-y-1.5">
            <h2 className="line-clamp-2 text-lg leading-snug font-semibold">{title || "无标题视频"}</h2>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <a
                href={"https://space.bilibili.com/" + String(video.owner.mid)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 hover:text-foreground"
              >
                <Avatar className="h-5 w-5">
                  <AvatarImage src={video.owner.face} alt={video.owner.name} referrerPolicy="no-referrer" />
                  <AvatarFallback>{video.owner.name.slice(0, 1)}</AvatarFallback>
                </Avatar>
                <span className="max-w-40 truncate">{video.owner.name}</span>
              </a>
              <span aria-hidden="true">·</span>
              <span>{formatUnixDate(video.pubdate)}</span>
              <Badge variant="outline" className="font-mono text-[10px]">
                {video.bvid}
              </Badge>
              {parsed ? (
                <Badge variant="secondary" className="text-[10px]">
                  {INPUT_TYPE_LABELS[parsed.type]}
                </Badge>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatItem icon={Play} label="播放" value={video.stat.view} />
            <StatItem icon={ThumbsUp} label="点赞" value={video.stat.like} />
            <StatItem icon={Star} label="收藏" value={video.stat.favorite} />
            <StatItem icon={MessageSquare} label="弹幕" value={video.stat.danmaku} />
          </div>

          <p className="line-clamp-3 text-sm text-muted-foreground">{desc || "暂无简介"}</p>

          <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
            <span className="max-w-full truncate text-xs text-muted-foreground">
              {selectionText(selectedPages, selectedEpisodesCount, isBangumi ? "剧集" : "合集")}
            </span>
            <Button variant="link" size="sm" asChild className="h-auto px-0 text-xs">
              <a href={externalUrl} target="_blank" rel="noopener noreferrer">
                在 B 站打开
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
