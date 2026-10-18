"use client";

import Link from "next/link";
import { useState } from "react";
import { ClipboardPaste, ExternalLink, Link2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { CopyButton } from "@/components/shared/copy-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api, getErrorMessage } from "@/lib/api-client";
import { formatDuration, formatUnixDate } from "@/lib/format";
import type { ParsedInput, VideoInfo } from "@/lib/types";
import { INPUT_TYPE_LABELS, parseInputLocally } from "./link-parser";

interface ResolveResult {
  parsed: ParsedInput;
  video: VideoInfo | null;
  /** 是否使用了本地降级解析 */
  local: boolean;
}

export function LinkResolver() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ResolveResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handlePaste() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setInput(text.trim());
        toast.success("已从剪贴板粘贴");
      } else {
        toast.error("剪贴板为空");
      }
    } catch {
      toast.error("无法读取剪贴板，请手动粘贴");
    }
  }

  async function handleResolve() {
    const raw = input.trim();
    if (!raw) {
      toast.error("请输入 B 站视频链接、b23 短链或 BV/AV 号");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const parsed = await api.bili.resolve(raw);
      let video: VideoInfo | null = null;
      const videoInput = parsed.bvid ?? raw;
      try {
        const data = await api.bili.video(videoInput);
        video = data.video;
      } catch {
        video = null;
      }
      setResult({ parsed, video, local: false });
      toast.success("解析成功");
    } catch (cause) {
      const localParsed = parseInputLocally(raw);
      if (localParsed) {
        setResult({ parsed: localParsed, video: null, local: true });
        setError("服务端解析接口暂不可用，已使用本地规则解析；标题与封面需要后端就绪后才能获取。");
        toast.warning("服务端解析不可用，已降级为本地解析");
      } else {
        const message = getErrorMessage(cause);
        setResult(null);
        setError(message);
        toast.error(message);
      }
    } finally {
      setLoading(false);
    }
  }

  const parsed = result ? result.parsed : null;
  const homeInput = parsed && (parsed.bvid ?? input.trim());

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link2 className="h-4 w-4" />
          链接解析器
        </CardTitle>
        <CardDescription>粘贴 BV/AV 号、bilibili.com 链接、b23 短链或番剧 ep/ss 链接</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void handleResolve();
            }}
            placeholder="例如：https://www.bilibili.com/video/BV1xx411c7mD 或 BV1xx411c7mD"
            autoComplete="off"
          />
          <div className="flex shrink-0 gap-2">
            <Button variant="outline" onClick={() => void handlePaste()}>
              <ClipboardPaste className="h-4 w-4" />
              粘贴
            </Button>
            <Button onClick={() => void handleResolve()} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
              解析
            </Button>
          </div>
        </div>

        {error ? (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
            {error}
          </p>
        ) : null}

        {parsed ? (
          <div className="space-y-4 rounded-lg border p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{INPUT_TYPE_LABELS[parsed.type]}</Badge>
              {result?.local ? <Badge variant="outline">本地解析</Badge> : null}
              {parsed.seasonId ? <Badge variant="outline">season_id：{parsed.seasonId}</Badge> : null}
              {parsed.epId ? <Badge variant="outline">ep_id：{parsed.epId}</Badge> : null}
            </div>

            <div className="grid gap-3 text-sm sm:grid-cols-2">
              {parsed.bvid ? (
                <div className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-3 py-2">
                  <span className="text-muted-foreground">BV 号</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono">{parsed.bvid}</span>
                    <CopyButton value={parsed.bvid} variant="ghost" />
                  </div>
                </div>
              ) : null}
              {parsed.aid ? (
                <div className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-3 py-2">
                  <span className="text-muted-foreground">AV 号</span>
                  <span className="font-mono">av{parsed.aid}</span>
                </div>
              ) : null}
              {parsed.url ? (
                <div className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-3 py-2 sm:col-span-2">
                  <span className="shrink-0 text-muted-foreground">原始 URL</span>
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-mono text-xs">{parsed.url}</span>
                    <CopyButton value={parsed.url} variant="ghost" />
                  </div>
                </div>
              ) : null}
            </div>

            {result?.video ? (
              <div className="flex flex-col gap-3 rounded-md border p-3 sm:flex-row">
                {/* B 站封面需要 no-referrer */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={result.video.cover}
                  alt={result.video.title}
                  referrerPolicy="no-referrer"
                  className="h-24 w-40 shrink-0 rounded-md object-cover"
                />
                <div className="min-w-0 space-y-1">
                  <p className="line-clamp-2 font-medium">{result.video.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {result.video.owner.name} · {formatDuration(result.video.duration)} ·{" "}
                    {formatUnixDate(result.video.pubdate)}
                  </p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {homeInput ? (
                      <Button asChild size="sm">
                        <Link href={"/?input=" + encodeURIComponent(homeInput)}>
                          去首页下载
                          <ExternalLink className="h-4 w-4" />
                        </Link>
                      </Button>
                    ) : null}
                    <Button asChild size="sm" variant="outline">
                      <a
                        href={result.video.redirectUrl || "https://www.bilibili.com/video/" + result.video.bvid}
                        target="_blank"
                        rel="noreferrer"
                      >
                        在 B 站打开
                      </a>
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {homeInput ? (
                  <Button asChild size="sm">
                    <Link href={"/?input=" + encodeURIComponent(homeInput)}>
                      去首页继续解析
                      <ExternalLink className="h-4 w-4" />
                    </Link>
                  </Button>
                ) : null}
              </div>
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
