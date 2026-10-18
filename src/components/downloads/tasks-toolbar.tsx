"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { FileDown, ListChecks, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
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
import { api, getErrorMessage } from "@/lib/api-client";

interface TasksToolbarProps {
  totalCount: number;
  completedCount: number;
  onChanged: () => void | Promise<void>;
}

type ClearStatus = "completed" | "all";

export function TasksToolbar({ totalCount, completedCount, onChanged }: TasksToolbarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setBusy(true);
    try {
      const text = await file.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        toast.error("JSON 文件解析失败，请检查文件内容");
        return;
      }
      const result = await api.tasks.importTasks(parsed);
      toast.success("已导入 " + result.imported + " 条任务");
      await onChanged();
    } catch (cause) {
      toast.error(getErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function handleClear(status: ClearStatus) {
    setBusy(true);
    try {
      const result = await api.tasks.clear(status);
      toast.success("已清理 " + result.removed + " 条任务");
      await onChanged();
    } catch (cause) {
      toast.error(getErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(event) => void handleFileChange(event)}
      />
      <Button variant="outline" size="sm" onClick={() => window.open(api.tasks.exportUrl, "_blank", "noopener,noreferrer")}>
        <FileDown className="h-4 w-4" />
        导出 JSON
      </Button>
      <Button variant="outline" size="sm" disabled={busy} onClick={() => fileInputRef.current?.click()}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        导入 JSON
      </Button>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="outline" size="sm" disabled={busy || completedCount === 0}>
            <ListChecks className="h-4 w-4" />
            清理已完成
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>清理已完成任务？</AlertDialogTitle>
            <AlertDialogDescription>
              将删除 {completedCount} 条已完成任务的记录，已下载到磁盘的文件不会被删除。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleClear("completed")}>确认清理</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="destructive" size="sm" disabled={busy || totalCount === 0}>
            <Trash2 className="h-4 w-4" />
            清空全部
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>清空全部任务？</AlertDialogTitle>
            <AlertDialogDescription>
              将删除全部 {totalCount} 条任务记录，进行中的任务会被取消，已下载的文件不会被删除。此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => void handleClear("all")}
            >
              清空全部
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
