"use client";

import Link from "next/link";
import { useState } from "react";
import { ExternalLink, ImageDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { CopyButton } from "@/components/shared/copy-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api, getErrorMessage } from "@/lib/api-client";
import { formatDuration } from "@/lib/format";
import type { VideoInfo } from "@/lib/types";

export function CoverExtractor() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [video, setVideo] = useState<VideoInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleExtract() {
    const raw = input.trim();
    if (!raw) {
      toast.error("请输入 BV 号或视频链接");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await api.bili.video(raw);
      setVideo(data.video);
      toast.success("封面获取成功");
    } catch (cause) {
      const message = getErrorMessage(cause);
      setVideo(null);
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ImageDown className="h-4 w-4" />
          封面提取
        </CardTitle>
        <CardDescription>输入 BV 号获取视频信息与封面大图，可复制封面直链</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void handleExtract();
            }}
            placeholder="输入 BV 号或视频链接，例如 BV1xx411c7mD"
            autoComplete="off"
          />
          <Button onClick={() => void handleExtract()} disabled={loading} className="shrink-0">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageDown className="h-4 w-4" />}
            提取封面
          </Button>
        </div>

        {error ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        {video ? (
          <div className="space-y-3 rounded-lg border p-3">
            {/* B 站封面需要 no-referrer */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={video.cover}
              alt={video.title}
              referrerPolicy="no-referrer"
              className="max-h-[420px] w-full rounded-md bg-muted object-contain"
            />
            <div className="space-y-1">
              <p className="line-clamp-2 font-medium">{video.title}</p>
              <p className="text-xs text-muted-foreground">
                {video.owner.name} · {formatDuration(video.duration)} · {video.bvid}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <CopyButton value={video.cover} label="复制封面链接" variant="default" size="default" />
              <CopyButton value={video.bvid} label="复制 BV 号" />
              <Button asChild variant="outline" size="sm">
                <a href={video.cover} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4" />
                  打开原图
                </a>
              </Button>
              <Button asChild size="sm">
                <Link href={"/?input=" + encodeURIComponent(video.bvid)}>
                  去首页下载
                  <ExternalLink className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
