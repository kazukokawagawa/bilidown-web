"use client";

import type { CSSProperties, ReactNode } from "react";
import { CircleCheck, CircleX, Loader2, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { SystemInfo } from "@/lib/types";

interface SystemInfoCardProps {
  info: SystemInfo | null;
  loading: boolean;
  error: string | null;
  onReload: () => void;
  reloading: boolean;
  /** 动效：设置页错峰入场时由父级传入 anim-fade-up / revealDelay 的 style（可选） */
  className?: string;
  style?: CSSProperties;
}

function platformLabel(platform: string): string {
  if (platform === "win32") return "Windows";
  if (platform === "darwin") return "macOS";
  if (platform === "linux") return "Linux";
  return platform || "未知";
}

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b py-2 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-sm font-medium">{value}</dd>
    </div>
  );
}

export function SystemInfoCard({
  info,
  loading,
  error,
  onReload,
  reloading,
  className,
  style,
}: SystemInfoCardProps) {
  return (
    <Card className={className} style={style}>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div className="space-y-1">
          <CardTitle>系统信息</CardTitle>
          <CardDescription>服务端运行环境与 ffmpeg 检测结果</CardDescription>
        </div>
        <Button variant="outline" size="sm" disabled={reloading} onClick={onReload}>
          {reloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          重新检测
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">检测中…</p>
        ) : error ? (
          <p className="text-sm text-destructive">系统信息获取失败：{error}</p>
        ) : info ? (
          <dl>
            <InfoRow label="应用版本" value={"v" + info.version} />
            <InfoRow label="运行平台" value={platformLabel(info.platform)} />
            <InfoRow
              label="ffmpeg"
              value={
                info.ffmpeg.available ? (
                  <span className="inline-flex items-center gap-1.5">
                    <CircleCheck className="h-4 w-4 text-emerald-500" />
                    {info.ffmpeg.version ?? "可用"}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5">
                    <CircleX className="h-4 w-4 text-red-500" />
                    未检测到
                  </span>
                )
              }
            />
            {info.ffmpeg.path ? <InfoRow label="ffmpeg 路径" value={info.ffmpeg.path} /> : null}
            <InfoRow
              label="浏览器合并"
              value={
                info.browserFfmpeg.available ? (
                  <span className="inline-flex items-center gap-1.5">
                    <CircleCheck className="h-4 w-4 text-emerald-500" />
                    ffmpeg.wasm{info.browserFfmpeg.version ? " " + info.browserFfmpeg.version : ""}
                    {info.browserFfmpeg.coreBytes
                      ? "（约 " + Math.round(info.browserFfmpeg.coreBytes / 1024 / 1024) + "MB）"
                      : ""}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5">
                    <CircleX className="h-4 w-4 text-red-500" />
                    资源未就绪（运行 npm run build / dev 生成）
                  </span>
                )
              }
            />
            <InfoRow label="下载目录" value={info.downloadDir} />
            <InfoRow
              label="目录可写"
              value={
                <Badge variant={info.downloadDirWritable ? "secondary" : "destructive"}>
                  {info.downloadDirWritable ? "可写" : "不可写"}
                </Badge>
              }
            />
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">暂无系统信息</p>
        )}
      </CardContent>
    </Card>
  );
}
