"use client";

import Link from "next/link";
import { SlidersHorizontal } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { revealDelay } from "@/components/shared/motion";
import { AUTO_AUDIO_QUALITY_LABEL, CODEC_NAMES, QUALITY_LABELS } from "@/lib/constants";
import type { AudioQualityOption, Codec, QualityOption } from "@/lib/types";

interface QualitySelectorProps {
  qualities: QualityOption[];
  codecChoices: Codec[];
  /** 可用音频质量列表（高 -> 低） */
  audioQualities: AudioQualityOption[];
  selectedQn: number | null;
  selectedCodec: Codec | null;
  /** 当前选择的音频质量 id（0 = 自动） */
  selectedAudioQualityId: number;
  /** 实际选中的音频质量（来自取流响应） */
  selectedAudioQuality: AudioQualityOption | null;
  audioOnly: boolean;
  embedSubtitles: boolean;
  embedDanmaku: boolean;
  saveDanmaku: boolean;
  ffmpegAvailable: boolean;
  isLogin: boolean;
  loading: boolean;
  disabled?: boolean;
  selectedPartCount?: number;
  onQnChange: (qn: number) => void;
  onCodecChange: (codec: Codec) => void;
  onAudioQualityChange: (id: number) => void;
  onAudioOnlyChange: (value: boolean) => void;
  onEmbedSubtitlesChange: (value: boolean) => void;
  onEmbedDanmakuChange: (value: boolean) => void;
  onSaveDanmakuChange: (value: boolean) => void;
}

export function QualitySelector({
  qualities,
  codecChoices,
  audioQualities,
  selectedQn,
  selectedCodec,
  selectedAudioQualityId,
  selectedAudioQuality,
  audioOnly,
  embedSubtitles,
  embedDanmaku,
  saveDanmaku,
  ffmpegAvailable,
  isLogin,
  loading,
  disabled,
  selectedPartCount = 0,
  onQnChange,
  onCodecChange,
  onAudioQualityChange,
  onAudioOnlyChange,
  onEmbedSubtitlesChange,
  onEmbedDanmakuChange,
  onSaveDanmakuChange,
}: QualitySelectorProps) {
  const showSkeleton = loading && qualities.length === 0;
  const selectDisabled = disabled || loading || audioOnly;
  // 音频质量在仅音频模式下也是主选择，因此不跟随 audioOnly 禁用
  const audioQualityDisabled = disabled || loading || audioQualities.length === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <SlidersHorizontal className="h-4 w-4" />
          下载选项
        </CardTitle>
        <CardDescription>选择清晰度、编码与音频质量，或只下载音频。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {showSkeleton ? (
          <div className="space-y-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <Label htmlFor="quality-select">清晰度</Label>
              <Select
                value={selectedQn !== null ? String(selectedQn) : ""}
                onValueChange={(value) => onQnChange(Number(value))}
                disabled={selectDisabled || qualities.length === 0}
              >
                <SelectTrigger id="quality-select" className="w-full">
                  <SelectValue placeholder={qualities.length === 0 ? "暂无可用清晰度" : "选择清晰度"} />
                </SelectTrigger>
                <SelectContent>
                  {qualities.map((quality) => {
                    const locked = quality.needsLogin && !isLogin;
                    const label = quality.label || QUALITY_LABELS[quality.qn] || String(quality.qn);
                    return (
                      <SelectItem key={quality.qn} value={String(quality.qn)} disabled={locked}>
                        {label}
                        {locked ? "（登录后可下载）" : ""}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="codec-select">编码</Label>
              <Select
                value={selectedCodec ?? ""}
                onValueChange={(value) => {
                  if (value === "avc" || value === "hevc" || value === "av1") onCodecChange(value);
                }}
                disabled={selectDisabled || codecChoices.length === 0}
              >
                <SelectTrigger id="codec-select" className="w-full">
                  <SelectValue placeholder={codecChoices.length === 0 ? "暂无可用编码" : "选择编码"} />
                </SelectTrigger>
                <SelectContent>
                  {codecChoices.map((codec) => (
                    <SelectItem key={codec} value={codec}>
                      {CODEC_NAMES[codec]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="audio-quality-select">音频质量</Label>
              <Select
                value={String(selectedAudioQualityId)}
                onValueChange={(value) => onAudioQualityChange(Number(value))}
                disabled={audioQualityDisabled}
              >
                <SelectTrigger id="audio-quality-select" className="w-full">
                  <SelectValue
                    placeholder={audioQualities.length === 0 ? "暂无可用音频质量" : "选择音频质量"}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">{AUTO_AUDIO_QUALITY_LABEL}</SelectItem>
                  {audioQualities.map((quality) => {
                    const locked = quality.needsLogin && !isLogin;
                    return (
                      <SelectItem key={quality.id} value={String(quality.id)} disabled={locked}>
                        {quality.label}
                        {locked ? "（需登录/大会员）" : ""}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {selectedAudioQuality
                  ? "实际音轨：" + selectedAudioQuality.label
                  : "自动选择账号可用的最佳音轨"}
              </p>
            </div>
          </>
        )}

        <div
          className="anim-fade-up flex items-start justify-between gap-4 rounded-lg border bg-muted/30 p-3 transition-shadow duration-200 hover:shadow-sm"
          style={revealDelay(0)}
        >
          <div className="space-y-0.5">
            <Label htmlFor="audio-only" className="text-sm font-medium">
              仅下载音频
            </Label>
            <p className="text-xs text-muted-foreground">只保存音频流（M4A / FLAC），不下载视频画面。</p>
          </div>
          <Switch id="audio-only" checked={audioOnly} onCheckedChange={onAudioOnlyChange} disabled={disabled || loading} />
        </div>

        <div
          className="anim-fade-up flex items-start justify-between gap-4 rounded-lg border bg-muted/30 p-3 transition-shadow duration-200 hover:shadow-sm"
          style={revealDelay(1)}
        >
          <div className="space-y-0.5">
            <Label htmlFor="embed-subtitles" className="text-sm font-medium">
              内嵌字幕（MKV）
            </Label>
            <p className="text-xs text-muted-foreground">
              下载时拉取 B 站 CC 字幕并封装为 MKV，需要 ffmpeg；无字幕或未检测到 ffmpeg 时自动回退 MP4。
            </p>
          </div>
          <Switch
            id="embed-subtitles"
            checked={embedSubtitles}
            onCheckedChange={onEmbedSubtitlesChange}
            disabled={disabled || loading || audioOnly || !ffmpegAvailable}
          />
        </div>

        <div
          className="anim-fade-up flex items-start justify-between gap-4 rounded-lg border bg-muted/30 p-3 transition-shadow duration-200 hover:shadow-sm"
          style={revealDelay(2)}
        >
          <div className="space-y-0.5">
            <Label htmlFor="embed-danmaku" className="text-sm font-medium">
              内嵌弹幕（MKV 软字幕）
            </Label>
            <p className="text-xs text-muted-foreground">
              把弹幕转换为 ASS 软字幕轨道封装进 MKV，需要 ffmpeg；无弹幕时自动回退。
            </p>
          </div>
          <Switch
            id="embed-danmaku"
            checked={embedDanmaku}
            onCheckedChange={onEmbedDanmakuChange}
            disabled={disabled || loading || audioOnly || !ffmpegAvailable}
          />
        </div>

        <div
          className="anim-fade-up flex items-start justify-between gap-4 rounded-lg border bg-muted/30 p-3 transition-shadow duration-200 hover:shadow-sm"
          style={revealDelay(3)}
        >
          <div className="space-y-0.5">
            <Label htmlFor="save-danmaku" className="text-sm font-medium">
              单独保存弹幕文件
            </Label>
            <p className="text-xs text-muted-foreground">把弹幕 XML 与 ASS 保存到视频同目录的「弹幕」子文件夹。</p>
          </div>
          <Switch
            id="save-danmaku"
            checked={saveDanmaku}
            onCheckedChange={onSaveDanmakuChange}
            disabled={disabled || loading}
          />
        </div>

        {!ffmpegAvailable ? (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            未检测到 ffmpeg：内嵌字幕与内嵌弹幕不可用，音视频将分别保存；下载完成后可在下载页用「浏览器合并」在浏览器内合成 MP4（无需安装 ffmpeg）。
          </p>
        ) : null}

        {audioOnly ? (
          <p className="text-xs text-muted-foreground">
            仅下载音频时以「音频质量」为准，清晰度与编码设置不生效。自动模式会优先选择账号可用的 Hi-Res 无损 /
            杜比全景声：无损音轨保存为 FLAC，其余保存为 M4A。Hi-Res 无损与杜比全景声需要大会员。
          </p>
        ) : null}

        {selectedPartCount > 1 ? (
          <p className="text-xs text-muted-foreground">
            已选 {selectedPartCount} 个条目（分P/合集），批量创建任务时将统一使用当前清晰度与编码。
          </p>
        ) : null}

        {!isLogin ? (
          <p className="anim-fade-in rounded-md bg-muted/60 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
            未登录时高清清晰度不可用。
            <Link href="/account" className="font-medium text-primary underline-offset-4 hover:underline">
              登录 B 站账号
            </Link>
            后即可下载 1080P 及以上清晰度；音频方面 132K/192K 需登录，Hi-Res 无损与杜比全景声需大会员。
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
