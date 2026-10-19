"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { FadeInImage, revealDelay } from "@/components/shared/motion";
import { formatCount, formatUnixDate, stripHtml } from "@/lib/format";
import type { SearchVideoItem } from "@/lib/types";

export function VideoResultCard({ item, index = 0 }: { item: SearchVideoItem; index?: number }) {
  const title = stripHtml(item.title);
  const href = "/?input=" + encodeURIComponent(item.bvid);
  const date = formatUnixDate(item.pubdate).slice(0, 10);
  const author = stripHtml(item.author);

  return (
    <Link
      href={href}
      className="group anim-fade-up block h-full focus-visible:outline-none"
      style={revealDelay(index, 40, 10)}
    >
      <Card className="hover-lift h-full gap-0 overflow-hidden py-0 group-focus-visible:ring-2 group-focus-visible:ring-ring">
        <div className="relative aspect-video overflow-hidden bg-muted">
          {item.cover ? (
            <FadeInImage
              src={item.cover}
              alt={title}
              referrerPolicy="no-referrer"
              loading="lazy"
              className="h-full w-full object-cover transition-[opacity,transform,filter,scale] duration-500 group-hover:scale-105"
            />
          ) : null}
          <Badge variant="secondary" className="absolute right-2 bottom-2 bg-black/70 font-normal text-white">
            {item.duration || "--:--"}
          </Badge>
        </div>
        <CardContent className="space-y-2 p-3">
          <p className="line-clamp-2 text-sm leading-snug font-medium" title={title}>
            {title || "无标题视频"}
          </p>
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span className="truncate">{author || "未知 UP主"}</span>
            <span className="shrink-0">{formatCount(item.play)} 播放</span>
          </div>
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>{date === "--" ? "未知日期" : date}</span>
            <span className="shrink-0">弹幕 {formatCount(item.danmaku)}</span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
