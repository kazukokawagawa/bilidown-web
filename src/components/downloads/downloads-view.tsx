"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { DownloadCloud, FolderOpen, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/shared/empty-state";
import { ListSkeleton } from "@/components/shared/loading";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDesktopBridge, useIsDesktop } from "@/hooks/use-desktop";
import { useSettings, useSystemInfo } from "@/hooks/use-settings";
import { useTasks } from "@/hooks/use-tasks";
import { getErrorMessage } from "@/lib/api-client";
import { TASK_ACTIVE_STATUSES } from "@/lib/constants";
import type { TaskAction, TaskStatus } from "@/lib/types";
import { TaskRow } from "./task-row";
import { TaskStats } from "./task-stats";
import { TasksToolbar } from "./tasks-toolbar";

type TabValue = "all" | "active" | "completed" | "error" | "paused";

const TAB_LABELS: Record<TabValue, string> = {
  all: "全部",
  active: "下载中",
  completed: "已完成",
  error: "失败",
  paused: "已暂停",
};

const ACTION_TOAST: Record<TaskAction, string> = {
  pause: "任务已暂停",
  resume: "任务已继续",
  cancel: "任务已取消",
  retry: "任务已重新排队",
  delete: "任务已删除",
};

function matchesTab(status: TaskStatus, tab: TabValue): boolean {
  switch (tab) {
    case "all":
      return true;
    case "active":
      return TASK_ACTIVE_STATUSES.includes(status);
    case "completed":
      return status === "completed";
    case "error":
      return status === "error";
    case "paused":
      return status === "paused";
  }
}

export function DownloadsView() {
  const { tasks, loading, error, connected, refresh, runAction } = useTasks();
  const { settings } = useSettings();
  const { info: systemInfo } = useSystemInfo();
  const isDesktop = useIsDesktop();
  const desktopBridge = useDesktopBridge();
  const [tab, setTab] = useState<TabValue>("all");
  const [busyId, setBusyId] = useState<string | null>(null);

  const counts = useMemo(() => {
    return {
      total: tasks.length,
      active: tasks.filter((task) => TASK_ACTIVE_STATUSES.includes(task.status)).length,
      completed: tasks.filter((task) => task.status === "completed").length,
      failed: tasks.filter((task) => task.status === "error").length,
      paused: tasks.filter((task) => task.status === "paused").length,
    };
  }, [tasks]);

  const filtered = useMemo(
    () => tasks.filter((task) => matchesTab(task.status, tab)),
    [tasks, tab],
  );

  async function handleAction(id: string, action: TaskAction) {
    setBusyId(id);
    try {
      await runAction(id, action);
      toast.success(ACTION_TOAST[action]);
    } catch (cause) {
      toast.error(getErrorMessage(cause));
    } finally {
      setBusyId(null);
    }
  }

  async function handleChanged() {
    await refresh();
  }

  return (
    <div className="mx-auto w-full max-w-6xl p-4 sm:p-6">
      <PageHeader
        title="下载任务"
        description="服务端下载队列，任务进度通过实时事件自动刷新"
        actions={
          <>
            <Badge
              variant="outline"
              className={
                connected
                  ? "border-emerald-500/40 text-emerald-600 dark:text-emerald-400"
                  : "border-amber-500/40 text-amber-600 dark:text-amber-400"
              }
            >
              <span
                className={
                  "mr-1.5 inline-block h-1.5 w-1.5 rounded-full " +
                  (connected ? "bg-emerald-500" : "bg-amber-500")
                }
              />
              {connected ? "实时已连接" : "实时连接断开，重连中"}
            </Badge>
            {isDesktop && systemInfo ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  void desktopBridge?.openPath(systemInfo.downloadDir).then((result) => {
                    if (result && !result.ok) toast.error(result.error || "无法打开下载目录");
                  });
                }}
              >
                <FolderOpen className="h-4 w-4" />
                打开下载目录
              </Button>
            ) : null}
            <Button variant="outline" size="sm" onClick={() => void refresh()}>
              <RefreshCw className="h-4 w-4" />
              刷新
            </Button>
          </>
        }
      />

      <TaskStats
        total={counts.total}
        active={counts.active}
        completed={counts.completed}
        failed={counts.failed}
      />

      {error ? (
        <div className="mt-4 flex flex-col gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between">
          <span>任务列表加载失败：{error}</span>
          <Button variant="outline" size="sm" onClick={() => void refresh()}>
            重试
          </Button>
        </div>
      ) : null}

      <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Tabs value={tab} onValueChange={(value) => setTab(value as TabValue)}>
          <TabsList className="grid h-auto w-full grid-cols-3 gap-1 sm:grid-cols-5 lg:w-auto">
            {(Object.keys(TAB_LABELS) as TabValue[]).map((key) => (
              <TabsTrigger key={key} value={key} className="px-3">
                {TAB_LABELS[key]}
                <span className="ml-1 text-xs text-muted-foreground">
                  {key === "all" ? counts.total : key === "active" ? counts.active : key === "completed" ? counts.completed : key === "error" ? counts.failed : counts.paused}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <TasksToolbar totalCount={counts.total} completedCount={counts.completed} onChanged={handleChanged} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>最大并发：{settings ? settings.maxConcurrent : "—"}</span>
        <span className="min-w-0 truncate">下载目录：{settings?.downloadDir ? settings.downloadDir : "默认 downloads/"}</span>
      </div>

      <div className="mt-4">
        {loading ? (
          <ListSkeleton rows={5} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={DownloadCloud}
            title={tasks.length === 0 ? "还没有下载任务" : "当前分类下没有任务"}
            description={
              tasks.length === 0
                ? "在首页解析视频并选择清晰度后，任务会出现在这里。"
                : "切换上方的状态分类查看其他任务。"
            }
            action={
              tasks.length === 0 ? (
                <Button asChild>
                  <Link href="/">去解析视频</Link>
                </Button>
              ) : null
            }
          />
        ) : (
          <div className="space-y-3">
            {filtered.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                busy={busyId === task.id}
                onAction={(id, action) => void handleAction(id, action)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
