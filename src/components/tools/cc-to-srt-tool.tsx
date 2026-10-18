"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { Download, FileJson, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  cuesToSrt,
  downloadTextFile,
  MAX_SUBTITLE_FILE_SIZE,
  parseCcJson,
  stripFileExtension,
  type CcCue,
} from "./subtitle-utils";

interface CcConvertResult {
  fileName: string;
  cues: CcCue[];
  srt: string;
}

export function CcToSrtTool() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pickedName, setPickedName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CcConvertResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setPickedName(file.name);
    setResult(null);
    setError(null);

    if (file.size > MAX_SUBTITLE_FILE_SIZE) {
      const message = "文件大于 50MB，不予处理";
      setError(message);
      toast.error(message);
      return;
    }

    setLoading(true);
    try {
      const text = await file.text();
      const cues = parseCcJson(text);
      setResult({
        fileName: stripFileExtension(file.name) + ".srt",
        cues,
        srt: cuesToSrt(cues),
      });
      toast.success("转换成功，共 " + cues.length + " 条字幕");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "转换失败，请检查文件格式";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  function handleDownload() {
    if (!result) return;
    downloadTextFile(result.fileName, result.srt, "application/x-subrip;charset=utf-8");
    toast.success("SRT 字幕已开始下载");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileJson className="h-4 w-4" />
          CC 字幕（JSON）→ SRT
        </CardTitle>
        <CardDescription>
          选择 B 站 CC 字幕 JSON 文件，转换为标准 SRT 字幕并下载（文件上限 50MB）
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <input
          ref={inputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(event) => void handleFileChange(event)}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" disabled={loading} onClick={() => inputRef.current?.click()}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            选择 CC 字幕（.json）
          </Button>
          {pickedName ? <span className="truncate text-sm text-muted-foreground">{pickedName}</span> : null}
        </div>

        {error ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        {result ? (
          <div className="space-y-3 rounded-lg border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">共 {result.cues.length} 条字幕</Badge>
              <Badge variant="outline" className="font-mono text-xs">
                {result.fileName}
              </Badge>
              <Button size="sm" className="ml-auto" onClick={handleDownload}>
                <Download className="h-4 w-4" />
                下载 SRT
              </Button>
            </div>
            <pre className="max-h-60 overflow-auto rounded-md bg-muted/40 p-3 text-xs whitespace-pre-wrap break-words">
              {result.srt.slice(0, 4000)}
            </pre>
          </div>
        ) : null}

        <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          <p>
            JSON 需包含 body 数组，每个元素形如
            <code className="mx-1 rounded bg-muted px-1 py-0.5 font-mono text-foreground">
              {"{ from: 0.0, to: 2.5, content: '字幕内容' }"}
            </code>
            即可。
          </p>
          <p className="mt-1">
            格式示例：
            <a
              href="https://zhouql.vip/bilibili/pc/example/cc.json"
              target="_blank"
              rel="noreferrer"
              className="text-primary underline underline-offset-2"
            >
              点我查看 CC 字幕格式
            </a>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
