"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { Download, Film, Loader2, Music, Upload } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useSystemInfo } from "@/hooks/use-settings";
import { mergeVideoAudioInBrowser } from "@/lib/browser-ffmpeg";
import { downloadBlob, fileBaseName } from "@/lib/download";
import { formatBytes } from "@/lib/format";

const MAX_AUDIO_SIZE = 200 * 1024 * 1024;
const MAX_MUX_SIZE = 500 * 1024 * 1024;

interface UploadResult {
  blob: Blob;
  fileName: string;
}

async function readErrorMessage(response: Response): Promise<string> {
  const text = await response.text();
  if (!text) return "请求失败（HTTP " + response.status + "）";
  try {
    const data: unknown = JSON.parse(text);
    if (data && typeof data === "object" && "error" in data) {
      const value = (data as { error?: unknown }).error;
      if (typeof value === "string") return value;
    }
  } catch {
    /* 非 JSON 错误响应，直接使用文本 */
  }
  return text.slice(0, 200);
}

function fileNameFromDisposition(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const match = header.match(/filename="?([^";]+)"?/i);
  return match ? match[1] : fallback;
}

async function upload(
  url: string,
  formData: FormData,
  fallbackFileName: string,
): Promise<UploadResult> {
  const response = await fetch(url, { method: "POST", body: formData });
  if (!response.ok) throw new Error(await readErrorMessage(response));
  const blob = await response.blob();
  if (blob.size === 0) throw new Error("服务端返回了空文件");
  return {
    blob,
    fileName: fileNameFromDisposition(response.headers.get("Content-Disposition"), fallbackFileName),
  };
}

function AudioToMp3Card({ serverFfmpegAvailable }: { serverFfmpegAvailable: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files?.[0];
    event.target.value = "";
    if (!picked) return;
    setResult(null);
    setError(null);
    if (picked.size > MAX_AUDIO_SIZE) {
      const message = "文件大于 200MB，请压缩或拆分后再上传";
      setFile(null);
      setError(message);
      toast.error(message);
      return;
    }
    setFile(picked);
  }

  async function handleConvert() {
    if (!file) {
      toast.error("请先选择音频文件");
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const data = await upload("/api/tools/audio-to-mp3", formData, fileBaseName(file.name) + ".mp3");
      setResult(data);
      toast.success("音频已转换为 MP3");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "转换失败";
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Music className="h-4 w-4" />
          音频转 MP3
        </CardTitle>
        <CardDescription>
          {serverFfmpegAvailable
            ? "上传音频文件，由服务端 ffmpeg 转为 MP3（上限 200MB）"
            : "服务端未检测到 ffmpeg：音频转 MP3 暂不可用（可先下载分片用其他工具处理）"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <input
          ref={inputRef}
          type="file"
          accept=".aac,.m4a,.m4s,.mp3,.flac,audio/*"
          className="hidden"
          onChange={handleFileChange}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" disabled={busy || !serverFfmpegAvailable} onClick={() => inputRef.current?.click()}>
            <Upload className="h-4 w-4" />
            选择音频文件
          </Button>
          <span className="truncate text-sm text-muted-foreground">
            {file ? file.name + "（" + formatBytes(file.size) + "）" : "支持 aac / m4a / m4s / mp3 / flac"}
          </span>
        </div>
        <Button disabled={busy || !file || !serverFfmpegAvailable} onClick={() => void handleConvert()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Music className="h-4 w-4" />}
          {busy ? "正在转换…" : "开始转换"}
        </Button>
        {error ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        {result ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/40 px-3 py-2">
            <div className="flex items-center gap-2 text-sm">
              <Badge variant="secondary">MP3</Badge>
              <span className="truncate">{result.fileName}</span>
              <span className="text-xs text-muted-foreground">{formatBytes(result.blob.size)}</span>
            </div>
            <Button size="sm" onClick={() => downloadBlob(result.blob, result.fileName)}>
              <Download className="h-4 w-4" />
              保存 MP3
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function MuxCard({
  serverFfmpegAvailable,
  browserFfmpegAvailable,
}: {
  serverFfmpegAvailable: boolean;
  browserFfmpegAvailable: boolean;
}) {
  const audioRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progressText, setProgressText] = useState<string | null>(null);
  // 服务端没有 ffmpeg 时自动改用浏览器端 ffmpeg.wasm（文件不上传，手机端也可用）
  const browserMode = !serverFfmpegAvailable && browserFfmpegAvailable;
  const unavailable = !serverFfmpegAvailable && !browserFfmpegAvailable;

  function pickFile(kind: "audio" | "video") {
    return (event: ChangeEvent<HTMLInputElement>) => {
      const picked = event.target.files?.[0];
      event.target.value = "";
      if (!picked) return;
      setResult(null);
      setError(null);
      if (picked.size > MAX_MUX_SIZE) {
        const message = "文件大于 500MB，请压缩或分段后再处理";
        setError(message);
        toast.error(message);
        return;
      }
      if (kind === "audio") setAudioFile(picked);
      else setVideoFile(picked);
    };
  }

  async function handleMux() {
    if (!audioFile || !videoFile) {
      toast.error("请同时选择音频与视频文件");
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    setProgressText(null);
    try {
      if (browserMode) {
        const data = await mergeVideoAudioInBrowser({
          video: videoFile,
          audio: audioFile,
          fileName: fileBaseName(videoFile.name) + ".mp4",
          onProgress: (progress) => setProgressText(progress.label),
        });
        setResult({ blob: data.blob, fileName: data.fileName });
        toast.success("已在浏览器内完成封装（文件未上传）");
        return;
      }
      const formData = new FormData();
      formData.append("audio", audioFile);
      formData.append("video", videoFile);
      const data = await upload("/api/tools/mux", formData, fileBaseName(audioFile.name) + ".mp4");
      setResult(data);
      toast.success("音视频封装完成");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "封装失败";
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
      setProgressText(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Film className="h-4 w-4" />
          手动音视频混流
        </CardTitle>
        <CardDescription>
          {browserMode
            ? "服务端未检测到 ffmpeg：改为在浏览器内用 ffmpeg.wasm 无损封装为 MP4（文件不上传，首次约 31MB 引擎）"
            : "分别上传音频与视频分片，由服务端 ffmpeg 无损封装为 MP4（单文件上限 500MB）"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <input
          ref={audioRef}
          type="file"
          accept=".aac,.m4a,.m4s,.mp3,.flac,audio/*"
          className="hidden"
          onChange={pickFile("audio")}
        />
        <input
          ref={videoRef}
          type="file"
          accept=".m4s,.mp4,video/*"
          className="hidden"
          onChange={pickFile("video")}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2 rounded-lg border p-3">
            <p className="text-sm font-medium">音频</p>
            <Button
              variant="outline"
              size="sm"
              disabled={busy || unavailable}
              onClick={() => audioRef.current?.click()}
            >
              <Upload className="h-4 w-4" />
              选择音频
            </Button>
            <p className="truncate text-xs text-muted-foreground">
              {audioFile ? audioFile.name + "（" + formatBytes(audioFile.size) + "）" : "未选择"}
            </p>
          </div>
          <div className="space-y-2 rounded-lg border p-3">
            <p className="text-sm font-medium">视频</p>
            <Button
              variant="outline"
              size="sm"
              disabled={busy || unavailable}
              onClick={() => videoRef.current?.click()}
            >
              <Upload className="h-4 w-4" />
              选择视频
            </Button>
            <p className="truncate text-xs text-muted-foreground">
              {videoFile ? videoFile.name + "（" + formatBytes(videoFile.size) + "）" : "未选择"}
            </p>
          </div>
        </div>
        {unavailable ? (
          <p className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            服务端与浏览器端 ffmpeg 均不可用，无法混流。请安装 ffmpeg 或重新构建以生成 public/ffmpeg 资源。
          </p>
        ) : null}
        <Button disabled={busy || unavailable || !audioFile || !videoFile} onClick={() => void handleMux()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Film className="h-4 w-4" />}
          {busy ? progressText ?? "正在封装…" : browserMode ? "在浏览器内混流" : "开始混流"}
        </Button>
        {error ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        {result ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/40 px-3 py-2">
            <div className="flex items-center gap-2 text-sm">
              <Badge variant="secondary">{/\.mkv$/i.test(result.fileName) ? "MKV" : "MP4"}</Badge>
              <span className="truncate">{result.fileName}</span>
              <span className="text-xs text-muted-foreground">{formatBytes(result.blob.size)}</span>
            </div>
            <Button size="sm" onClick={() => downloadBlob(result.blob, result.fileName)}>
              <Download className="h-4 w-4" />
              保存文件
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function MediaTools() {
  const { info } = useSystemInfo();
  // 系统信息加载中先按“可用”处理，避免按钮闪烁禁用
  const serverFfmpegAvailable = info ? info.ffmpeg.available : true;
  const browserFfmpegAvailable = info ? info.browserFfmpeg.available : false;
  return (
    <div className="space-y-4">
      <AudioToMp3Card serverFfmpegAvailable={serverFfmpegAvailable} />
      <MuxCard
        serverFfmpegAvailable={serverFfmpegAvailable}
        browserFfmpegAvailable={browserFfmpegAvailable}
      />
    </div>
  );
}
