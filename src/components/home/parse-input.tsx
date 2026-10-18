"use client";

import type { FormEvent } from "react";
import { ClipboardPaste, Link2, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface ParseInputProps {
  value: string;
  loading: boolean;
  onChange: (value: string) => void;
  onParse: () => void;
}

export function ParseInput({ value, loading, onChange, onParse }: ParseInputProps) {
  async function handlePaste() {
    if (!navigator.clipboard || typeof navigator.clipboard.readText !== "function") {
      toast.error("当前浏览器不支持读取剪贴板，请使用 Ctrl+V 粘贴");
      return;
    }
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (!text) {
        toast.error("剪贴板是空的");
        return;
      }
      onChange(text);
      toast.success("已从剪贴板读取内容");
    } catch {
      toast.error("读取剪贴板失败，请手动粘贴（Ctrl+V）");
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!value.trim()) {
      toast.error("请输入视频链接或 BV 号");
      return;
    }
    onParse();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Search className="h-4 w-4" />
          解析视频
        </CardTitle>
        <CardDescription>支持 BV 号 / av 号 / 视频链接 / b23.tv 短链 / 番剧 ep、ss</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder="例如：BV1GJ411x7h7 或 https://www.bilibili.com/video/BV1GJ411x7h7"
            aria-label="视频链接或 BV 号"
            autoComplete="off"
            spellCheck={false}
            disabled={loading}
            className="h-11 flex-1"
          />
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="h-11" onClick={handlePaste} disabled={loading}>
              <ClipboardPaste className="h-4 w-4" />
              粘贴
            </Button>
            <Button type="submit" className="h-11" disabled={loading || !value.trim()}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
              {loading ? "解析中…" : "解析"}
            </Button>
          </div>
        </form>
        <p className="text-xs text-muted-foreground">回车即可解析；解析后可选择分P、清晰度和编码，再创建下载任务。</p>
      </CardContent>
    </Card>
  );
}
