"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { Download, Film, Loader2, Music, Upload } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

function baseName(fileName: string): string {
  const index = fileName.lastIndexOf(".");
  return index > 0 ? fileName.slice(0, index) : fileName;
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
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

function AudioToMp3Card() {
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
      const data = await upload("/api/tools/audio-to-mp3", formData, baseName(file.name) + ".mp3");
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
        <CardDescription>上传音频文件，由服务端 ffmpeg 转为 MP3（上限 200MB）</CardDescription>
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
          <Button variant="outline" disabled={busy} onClick={() => inputRef.current?.click()}>
            <Upload className="h-4 w-4" />
            选择音频文件
          </Button>
          <span className="truncate text-sm text-muted-foreground">
            {file ? file.name + "（" + formatBytes(file.size) + "）" : "支持 aac / m4a / m4s / mp3 / flac"}
          </span>
        </div>
        <Button disabled={busy || !file} onClick={() => void handleConvert()}>
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

function MuxCard() {
  const audioRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function pickFile(kind: "audio" | "video") {
    return (event: ChangeEvent<HTMLInputElement>) => {
      const picked = event.target.files?.[0];
      event.target.value = "";
      if (!picked) return;
      setResult(null);
      setError(null);
      if (picked.size > MAX_MUX_SIZE) {
        const message = "文件大于 500MB，请压缩或分段后再上传";
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
    try {
      const formData = new FormData();
      formData.append("audio", audioFile);
      formData.append("video", videoFile);
      const data = await upload("/api/tools/mux", formData, baseName(audioFile.name) + ".mp4");
      setResult(data);
      toast.success("音视频封装完成");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "封装失败";
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
          <Film className="h-4 w-4" />
          手动音视频混流
        </CardTitle>
        <CardDescription>
          分别上传音频与视频分片，由服务端 ffmpeg 无损封装为 MP4（单文件上限 500MB）
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
            <Button variant="outline" size="sm" disabled={busy} onClick={() => audioRef.current?.click()}>
              <Upload className="h-4 w-4" />
              选择音频
            </Button>
            <p className="truncate text-xs text-muted-foreground">
              {audioFile ? audioFile.name + "（" + formatBytes(audioFile.size) + "）" : "未选择"}
            </p>
          </div>
          <div className="space-y-2 rounded-lg border p-3">
            <p className="text-sm font-medium">视频</p>
            <Button variant="outline" size="sm" disabled={busy} onClick={() => videoRef.current?.click()}>
              <Upload className="h-4 w-4" />
              选择视频
            </Button>
            <p className="truncate text-xs text-muted-foreground">
              {videoFile ? videoFile.name + "（" + formatBytes(videoFile.size) + "）" : "未选择"}
            </p>
          </div>
        </div>
        <Button disabled={busy || !audioFile || !videoFile} onClick={() => void handleMux()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Film className="h-4 w-4" />}
          {busy ? "正在封装…" : "开始混流"}
        </Button>
        {error ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        {result ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/40 px-3 py-2">
            <div className="flex items-center gap-2 text-sm">
              <Badge variant="secondary">MP4</Badge>
              <span className="truncate">{result.fileName}</span>
              <span className="text-xs text-muted-foreground">{formatBytes(result.blob.size)}</span>
            </div>
            <Button size="sm" onClick={() => downloadBlob(result.blob, result.fileName)}>
              <Download className="h-4 w-4" />
              保存 MP4
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function MediaTools() {
  return (
    <div className="space-y-4">
      <AudioToMp3Card />
      <MuxCard />
    </div>
  );
}
