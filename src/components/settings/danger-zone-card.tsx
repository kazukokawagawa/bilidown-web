"use client";

import type { CSSProperties } from "react";
import { Loader2, RotateCcw, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface DangerZoneCardProps {
  resetting: boolean;
  clearing: boolean;
  onReset: () => void;
  onClearTasks: () => void;
  /** 动效：设置页错峰入场时由父级传入 anim-fade-up / revealDelay 的 style（可选） */
  className?: string;
  style?: CSSProperties;
}

export function DangerZoneCard({
  resetting,
  clearing,
  onReset,
  onClearTasks,
  className,
  style,
}: DangerZoneCardProps) {
  return (
    <Card className={cn("border-destructive/40", className)} style={style}>
      <CardHeader>
        <CardTitle className="text-destructive">危险区</CardTitle>
        <CardDescription>以下操作不可撤销，请谨慎操作</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-0.5">
            <p className="text-sm font-medium">恢复默认设置</p>
            <p className="text-xs text-muted-foreground">将下载、行为、网络等设置恢复为默认值，并立即保存。</p>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" disabled={resetting}>
                {resetting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                恢复默认
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>恢复默认设置？</AlertDialogTitle>
                <AlertDialogDescription>
                  下载目录、命名模板、并发、清晰度、编码、代理与行为开关都会恢复默认值，当前登录 Cookie 不受影响。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction onClick={onReset}>恢复默认</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        <div className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-0.5">
            <p className="text-sm font-medium">清空任务记录</p>
            <p className="text-xs text-muted-foreground">删除全部任务记录（已下载的文件保留），进行中的任务会被取消。</p>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm" disabled={clearing}>
                {clearing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                清空任务记录
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>清空全部任务记录？</AlertDialogTitle>
                <AlertDialogDescription>
                  所有任务记录将被删除，进行中的任务会被取消，已下载到磁盘的文件不会被删除。此操作不可撤销。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-white hover:bg-destructive/90"
                  onClick={onClearTasks}
                >
                  清空记录
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
}
