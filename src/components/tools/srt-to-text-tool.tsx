"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { Download, FileText, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  downloadTextFile,
  MAX_SUBTITLE_FILE_SIZE,
  srtToPlainText,
  stripFileExtension,
  type PlainTextResult,
} from "./subtitle-utils";

interface SrtConvertResult extends PlainTextResult {
  baseName: string;
}

export function SrtToTextTool() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pickedName, setPickedName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SrtConvertResult | null>(null);
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
      const plain = srtToPlainText(text);
      if (plain.lineCount === 0) {
        throw new Error("未从 SRT 中提取到字幕文本，请检查文件格式");
      }
      setResult({ ...plain, baseName: stripFileExtension(file.name) });
      toast.success("转换成功，共提取 " + plain.lineCount + " 行文本");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "转换失败，请检查文件格式";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  function handleDownload(withNewlines: boolean) {
    if (!result) return;
    if (withNewlines) {
      downloadTextFile(result.baseName + ".txt", result.withNewlines);
    } else {
      downloadTextFile(result.baseName + "-no-wrap.txt", result.withoutNewlines);
    }
    toast.success("纯文本已开始下载");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-4 w-4" />
          SRT 字幕 → 纯文本
        </CardTitle>
        <CardDescription>
          选择 SRT 字幕文件，过滤序号与时间轴后导出纯文本（文件上限 50MB）
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <input
          ref={inputRef}
          type="file"
          accept=".srt,application/x-subrip,text/plain"
          className="hidden"
          onChange={(event) => void handleFileChange(event)}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" disabled={loading} onClick={() => inputRef.current?.click()}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            选择 SRT 字幕（.srt）
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
              <Badge variant="secondary">共 {result.lineCount} 行文本</Badge>
              <Button size="sm" className="ml-auto" onClick={() => handleDownload(true)}>
                <Download className="h-4 w-4" />
                下载（带换行）
              </Button>
              <Button size="sm" variant="outline" onClick={() => handleDownload(false)}>
                <Download className="h-4 w-4" />
                下载（不带换行）
              </Button>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">带换行预览</p>
                <pre className="max-h-48 overflow-auto rounded-md bg-muted/40 p-3 text-xs whitespace-pre-wrap break-words">
                  {result.withNewlines.slice(0, 2000)}
                </pre>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">不带换行预览</p>
                <pre className="max-h-48 overflow-auto rounded-md bg-muted/40 p-3 text-xs whitespace-pre-wrap break-words">
                  {result.withoutNewlines.slice(0, 2000)}
                </pre>
              </div>
            </div>
          </div>
        ) : null}

        <p className="text-xs text-muted-foreground">
          转换规则与桌面版一致：按行过滤「纯数字序号行」与「含 --&gt; 的时间轴行」，其余行保留为字幕文本。
        </p>
      </CardContent>
    </Card>
  );
}
