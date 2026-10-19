"use client";

import type { LucideIcon } from "lucide-react";
import {
  ChartColumn,
  CircleCheck,
  Clock3,
  Coins,
  FileText,
  Info,
  Lightbulb,
  MessageSquare,
  MessagesSquare,
  Play,
  Share2,
  Star,
  Tags,
  TextAlignStart,
  ThumbsUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { revealDelay } from "@/components/shared/motion";
import { formatCount, formatDuration, formatUnixDate, stripHtml } from "@/lib/format";
import type { VideoInfo, VideoPage } from "@/lib/types";
import { cn } from "@/lib/utils";

const COPYRIGHT_LABELS: Record<number, string> = {
  1: "自制",
  2: "转载",
};

interface StatItem {
  label: string;
  value: string;
  icon: LucideIcon;
}

interface DetailRow {
  label: string;
  value: string;
  /** 技术字段（BV/av 号）用等宽字体展示 */
  mono?: boolean;
}

function StatTile({ label, value, icon: Icon, index }: StatItem & { index: number }) {
  return (
    <div
      className="anim-fade-up flex min-w-0 items-center gap-2 rounded-lg border bg-muted/30 px-2.5 py-2 transition-colors duration-200 hover:border-primary/30 hover:bg-muted/50"
      style={revealDelay(index, 30, 10)}
    >
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-[11px] leading-tight text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-semibold tabular-nums" title={value}>
          {value}
        </p>
      </div>
    </div>
  );
}

interface VideoDetailCardProps {
  /** lg 下拉满父级剩余高度：单P/无列表时填满左栏底部空白（内容内部滚动） */
  fill?: boolean;
  video: VideoInfo;
  /** 当前用于取流的主分P（单P视频通常为 P1） */
  page: VideoPage | null;
  /** 是否已登录，用于展示与清晰度相关的提示 */
  isLogin?: boolean;
}

/**
 * 单P / 无分P列表时展示的详情卡。
 * 视频卡只展示 3 行简介摘要与 4 项数据，这里补充完整简介、全部数据与视频参数，
 * 并像分P列表一样在 lg 下拉满左栏剩余高度，避免左侧留出大片空白。
 */
export function VideoDetailCard({ fill, video, page, isLogin = false }: VideoDetailCardProps) {
  const desc = stripHtml(video.desc).trim();
  const pageLabel = page ? "P" + String(page.page) + (page.title ? " · " + page.title : "") : "当前分P";

  const stats: StatItem[] = [
    { label: "播放", value: formatCount(video.stat.view), icon: Play },
    { label: "点赞", value: formatCount(video.stat.like), icon: ThumbsUp },
    { label: "投币", value: formatCount(video.stat.coin), icon: Coins },
    { label: "收藏", value: formatCount(video.stat.favorite), icon: Star },
    { label: "评论", value: formatCount(video.stat.reply), icon: MessageSquare },
    { label: "分享", value: formatCount(video.stat.share), icon: Share2 },
    { label: "弹幕", value: formatCount(video.stat.danmaku), icon: MessagesSquare },
    { label: "时长", value: formatDuration(video.duration), icon: Clock3 },
  ];

  // 分区名在匿名请求下可能为空（B 站 view 接口现状），为空时不展示该行
  const tname = video.tname?.trim();
  const collectionTitle = video.collection?.title?.trim();
  const rows: DetailRow[] = [
    { label: "视频类型", value: video.pages.length > 1 ? "多P视频" : "单P视频" },
    { label: "版权", value: COPYRIGHT_LABELS[video.copyright ?? 0] ?? "未知" },
  ];
  if (tname) rows.push({ label: "分区", value: tname });
  rows.push(
    { label: "BV 号", value: video.bvid, mono: true },
    { label: "av 号", value: "av" + String(video.aid), mono: true },
    { label: "分P 数", value: String(video.pages.length > 0 ? video.pages.length : video.videos) + " P" },
    { label: "当前分P", value: pageLabel },
  );
  if (collectionTitle) rows.push({ label: "所属合集", value: collectionTitle });
  rows.push({ label: "发布时间", value: formatUnixDate(video.pubdate) });

  const tips = [
    "该视频只有一个分P，已自动选中 " + pageLabel + "，无需再勾选分P。",
    isLogin
      ? "清晰度与编码已按当前账号权限获取，可在右侧自由切换。"
      : "未登录时高清清晰度不可用，登录后可下载 1080P 及以上清晰度。",
    "内嵌字幕 / 弹幕需要本机 ffmpeg；任务创建后可在「下载」页查看进度。",
  ];

  return (
    <Card className={cn("flex min-h-0 flex-col", fill && "lg:flex-1")}>
      <CardHeader className="shrink-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="h-4 w-4" />
          视频详情
        </CardTitle>
        <CardDescription>完整简介、视频数据与参数；解析结果会自动带入右侧下载选项。</CardDescription>
      </CardHeader>
      <CardContent className={cn("flex flex-col", fill && "lg:min-h-0 lg:flex-1")}>
        <div
          className={cn(
            "scroll-area min-h-0 space-y-5 overflow-y-auto pr-1",
            fill && "lg:flex-1 lg:[contain:size]",
          )}
          // 可滚动区域需要可聚焦，键盘用户才能用方向键/PageDown 翻看详情内容
          tabIndex={0}
          role="region"
          aria-label="视频详情内容"
        >
          <section className="space-y-2">
            <h3 className="flex items-center gap-1.5 text-sm font-medium">
              <TextAlignStart className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              视频简介
            </h3>
            <p className="rounded-lg border bg-muted/30 p-3 text-sm leading-relaxed whitespace-pre-line break-words text-muted-foreground">
              {desc || "这个视频没有写简介哦！"}
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="flex items-center gap-1.5 text-sm font-medium">
              <ChartColumn className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              数据总览
            </h3>
            {/* 2 列铺满卡片宽度：单P详情卡通常很高（与右栏下载选项等高），4 列会显得稀疏且底部留白更多 */}
            <div className="grid grid-cols-2 gap-2">
              {stats.map((stat, index) => (
                <StatTile key={stat.label} label={stat.label} value={stat.value} icon={stat.icon} index={index} />
              ))}
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="flex items-center gap-1.5 text-sm font-medium">
              <Info className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              视频信息
            </h3>
            <dl className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
              {rows.map((row, index) => (
                <div
                  key={row.label}
                  className="anim-fade-up flex min-w-0 items-center justify-between gap-3 border-b border-dashed pb-1.5 text-sm last:border-b-0"
                  style={revealDelay(index, 25, 10)}
                >
                  <dt className="shrink-0 text-muted-foreground">{row.label}</dt>
                  <dd
                    className={cn("min-w-0 truncate text-right font-medium", row.mono && "font-mono text-xs")}
                    title={row.value}
                  >
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          {video.tags && video.tags.length > 0 ? (
            <section className="space-y-2">
              <h3 className="flex items-center gap-1.5 text-sm font-medium">
                <Tags className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                视频标签
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {video.tags.map((tag, index) => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className="anim-fade-up max-w-full font-normal"
                    style={revealDelay(index, 25, 10)}
                    title={tag}
                  >
                    <span className="truncate">{tag}</span>
                  </Badge>
                ))}
              </div>
            </section>
          ) : null}

          <section className="space-y-2">
            <h3 className="flex items-center gap-1.5 text-sm font-medium">
              <Lightbulb className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              下载提示
            </h3>
            <ul className="space-y-1.5">
              {tips.map((tip) => (
                <li key={tip} className="flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground">
                  <CircleCheck
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
                    aria-hidden="true"
                  />
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </CardContent>
    </Card>
  );
}
