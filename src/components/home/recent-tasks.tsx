"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, DownloadCloud } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { FadeInImage, revealDelay } from "@/components/shared/motion";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api-client";
import { QUALITY_LABELS } from "@/lib/constants";
import { formatBytes } from "@/lib/format";
import type { DownloadTask } from "@/lib/types";

const RECENT_LIMIT = 3;

export function RecentTasks() {
  const [tasks, setTasks] = useState<DownloadTask[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.tasks
      .list()
      .then((response) => {
        if (!cancelled) setTasks(response.tasks.slice(0, RECENT_LIMIT));
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <DownloadCloud className="h-4 w-4" />
            最近任务
          </CardTitle>
          <Button variant="ghost" size="sm" asChild className="group">
            <Link href="/downloads">
              查看全部
              <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {tasks === null && !failed ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-16 w-full rounded-xl" />
          </div>
        ) : failed ? (
          <p className="py-6 text-center text-sm text-muted-foreground">无法获取最近任务，请确认本地服务已启动。</p>
        ) : tasks && tasks.length === 0 ? (
          <EmptyState
            icon={DownloadCloud}
            title="暂无下载任务"
            description="解析视频并点击「开始下载」后，任务会显示在这里。"
            className="border-0 py-8"
          />
        ) : (
          <div className="divide-y">
            {(tasks ?? []).map((task, index) => {
              const quality = task.qualityName || (QUALITY_LABELS[task.qn] ?? "未知清晰度");
              const total = task.totalBytes || task.fileSize || 0;
              const percent = Math.min(100, Math.max(0, Math.round(task.progress)));
              return (
                <div
                  key={task.id}
                  className="anim-fade-up flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                  style={revealDelay(index, 40, 10)}
                >
                  <div className="relative hidden h-14 w-24 shrink-0 overflow-hidden rounded-md border bg-muted sm:block">
                    {task.cover ? (
                      <FadeInImage
                        src={task.cover}
                        alt={task.title}
                        referrerPolicy="no-referrer"
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <Link href="/downloads" className="min-w-0 truncate text-sm font-medium hover:underline">
                        {task.title}
                      </Link>
                      <StatusBadge status={task.status} />
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {task.partTitle} · {quality} · {formatBytes(total)}
                    </p>
                    <Progress
                      value={percent}
                      animated={task.status === "downloading" || task.status === "merging"}
                      className="h-1.5"
                    />
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{percent}%</span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
