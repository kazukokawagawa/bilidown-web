"use client";

import { CircleCheck, CircleX } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useDesktopBridge, useIsDesktop } from "@/hooks/use-desktop";
import {
  CODEC_NAMES,
  DEFAULT_QUALITIES,
  DOWNLOAD_THREAD_OPTIONS,
  LOGIN_REQUIRED_QN,
  QUALITY_LABELS,
} from "@/lib/constants";
import type { Codec, SystemInfo } from "@/lib/types";
import { NAMING_PLACEHOLDERS, renderNamingTemplate } from "./naming-template";
import type { SettingsFormState } from "./settings-form";

interface DownloadSettingsCardProps {
  form: SettingsFormState;
  onChange: <K extends keyof SettingsFormState>(key: K, value: SettingsFormState[K]) => void;
  systemInfo: SystemInfo | null;
  systemLoading: boolean;
}

export function DownloadSettingsCard({ form, onChange, systemInfo, systemLoading }: DownloadSettingsCardProps) {
  const ffmpeg = systemInfo ? systemInfo.ffmpeg : null;
  const isDesktop = useIsDesktop();
  const desktopBridge = useDesktopBridge();

  async function handleBrowseDirectory() {
    if (!desktopBridge) return;
    const dir = await desktopBridge.selectDirectory({
      title: "选择下载目录",
      defaultPath: form.downloadDir || (systemInfo ? systemInfo.downloadDir : undefined),
    });
    if (dir) onChange("downloadDir", dir);
  }

  async function handleOpenDirectory() {
    if (!desktopBridge || !systemInfo) return;
    const result = await desktopBridge.openPath(systemInfo.downloadDir);
    if (!result.ok) toast.error(result.error || "无法打开下载目录");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>下载</CardTitle>
        <CardDescription>下载目录、文件命名、清晰度与 ffmpeg 合并策略</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="downloadDir">下载目录</Label>
            {systemLoading ? (
              <span className="text-xs text-muted-foreground">目录检测中…</span>
            ) : systemInfo ? (
              <Badge variant={systemInfo.downloadDirWritable ? "secondary" : "destructive"}>
                {systemInfo.downloadDirWritable ? "目录可写" : "目录不可写"}
              </Badge>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Input
              id="downloadDir"
              value={form.downloadDir}
              onChange={(event) => onChange("downloadDir", event.target.value)}
              placeholder="留空使用默认 downloads 目录"
              autoComplete="off"
            />
            {isDesktop ? (
              <Button type="button" variant="outline" onClick={() => void handleBrowseDirectory()}>
                选择…
              </Button>
            ) : null}
            {isDesktop ? (
              <Button type="button" variant="outline" onClick={() => void handleOpenDirectory()}>
                打开
              </Button>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            绝对路径，例如 D:\Videos\bilibili；实际生效目录：{systemInfo ? systemInfo.downloadDir : "—"}
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="namingTemplate">文件命名模板</Label>
          <Input
            id="namingTemplate"
            value={form.namingTemplate}
            onChange={(event) => onChange("namingTemplate", event.target.value)}
            placeholder="{title}"
            className="font-mono"
            autoComplete="off"
          />
          <div className="flex flex-wrap gap-1.5">
            {NAMING_PLACEHOLDERS.map((placeholder) => (
              <Button
                key={placeholder.key}
                type="button"
                variant="secondary"
                size="sm"
                className="h-7 px-2 font-mono text-xs"
                title={placeholder.label}
                onClick={() => onChange("namingTemplate", form.namingTemplate + placeholder.key)}
              >
                {placeholder.key}
              </Button>
            ))}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => onChange("namingTemplate", "{title}")}
            >
              重置
            </Button>
          </div>
          <div className="rounded-md bg-muted/50 px-3 py-2 text-xs">
            <span className="text-muted-foreground">文件名预览：</span>
            <span className="break-all font-medium">
              {renderNamingTemplate(form.namingTemplate)}.{form.embedSubtitles ? "mkv" : "mp4"}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            可用占位符：{NAMING_PLACEHOLDERS.map((item) => item.key).join(" ")}；文件名中的非法字符会自动替换为下划线，长度限制 180 字符。
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor="maxConcurrent">最大并发</Label>
            <Select
              value={String(form.maxConcurrent)}
              onValueChange={(value) => onChange("maxConcurrent", Number(value))}
            >
              <SelectTrigger id="maxConcurrent" className="w-full">
                <SelectValue placeholder="选择并发数" />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4, 5].map((value) => (
                  <SelectItem key={value} value={String(value)}>
                    {value} 个任务
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">同时下载的任务数（1-5）</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="downloadThreads">单文件线程数</Label>
            <Select
              value={String(form.downloadThreads)}
              onValueChange={(value) => onChange("downloadThreads", Number(value))}
            >
              <SelectTrigger id="downloadThreads" className="w-full">
                <SelectValue placeholder="选择线程数" />
              </SelectTrigger>
              <SelectContent>
                {DOWNLOAD_THREAD_OPTIONS.map((value) => (
                  <SelectItem key={value} value={String(value)}>
                    {value === 1 ? "1（单连接）" : String(value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              单个音/视频文件的多连接下载线程数（1-8），1 为单连接
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="defaultQn">默认清晰度</Label>
            <Select
              value={String(form.defaultQn)}
              onValueChange={(value) => onChange("defaultQn", Number(value))}
            >
              <SelectTrigger id="defaultQn" className="w-full">
                <SelectValue placeholder="选择清晰度" />
              </SelectTrigger>
              <SelectContent>
                {DEFAULT_QUALITIES.map((qn) => (
                  <SelectItem key={qn} value={String(qn)}>
                    {QUALITY_LABELS[qn] ?? String(qn)}
                    {LOGIN_REQUIRED_QN.includes(qn) ? "（需登录）" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">首页解析后默认选中的清晰度</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="preferCodec">优先编码</Label>
            <Select
              value={form.preferCodec}
              onValueChange={(value) => onChange("preferCodec", value as Codec)}
            >
              <SelectTrigger id="preferCodec" className="w-full">
                <SelectValue placeholder="选择编码" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="avc">{CODEC_NAMES.avc}</SelectItem>
                <SelectItem value="hevc">{CODEC_NAMES.hevc}</SelectItem>
                <SelectItem value="av1">{CODEC_NAMES.av1}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">优先下载的视频编码格式</p>
          </div>
        </div>

        <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
          <div className="space-y-0.5">
            <Label htmlFor="mergeWithFfmpeg" className="cursor-pointer">
              使用 ffmpeg 合并音视频
            </Label>
            <p className="text-xs text-muted-foreground">
              关闭后分别保存 video.m4s 与 audio.m4s 文件；开启后合并为 mp4/m4a。
            </p>
            {systemInfo && !ffmpeg?.available ? (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                当前未检测到 ffmpeg，开启合并可能失败，将自动降级为分别保存。
              </p>
            ) : null}
          </div>
          <Switch
            id="mergeWithFfmpeg"
            checked={form.mergeWithFfmpeg}
            onCheckedChange={(checked) => onChange("mergeWithFfmpeg", checked)}
          />
        </div>

        <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
          <div className="space-y-0.5">
            <Label htmlFor="embedSubtitles" className="cursor-pointer">
              内嵌字幕（输出 MKV）
            </Label>
            <p className="text-xs text-muted-foreground">
              下载时拉取 B 站 CC 字幕并封装为 MKV，需要 ffmpeg；未检测到 ffmpeg 或没有字幕时自动回退 MP4。
            </p>
            {systemInfo && !ffmpeg?.available ? (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                当前未检测到 ffmpeg，内嵌字幕不会生效，将回退为 MP4。
              </p>
            ) : null}
          </div>
          <Switch
            id="embedSubtitles"
            checked={form.embedSubtitles}
            onCheckedChange={(checked) => onChange("embedSubtitles", checked)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="ffmpegPath">ffmpeg 路径</Label>
          <Input
            id="ffmpegPath"
            value={form.ffmpegPath}
            onChange={(event) => onChange("ffmpegPath", event.target.value)}
            placeholder="ffmpeg（使用 PATH 中的命令）"
            autoComplete="off"
          />
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            {systemLoading ? (
              <span>检测中…</span>
            ) : ffmpeg?.available ? (
              <>
                <CircleCheck className="h-3.5 w-3.5 text-emerald-500" />
                <span>已检测到 {ffmpeg.version ?? "ffmpeg"}</span>
              </>
            ) : (
              <>
                <CircleX className="h-3.5 w-3.5 text-red-500" />
                <span>未检测到 ffmpeg，可填写可执行文件绝对路径</span>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
