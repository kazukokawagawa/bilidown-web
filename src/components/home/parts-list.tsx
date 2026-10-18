"use client";

// 合集（ugc_season）剧集列表由同目录的 collection-list.tsx 负责，本组件只展示分P。

import { Layers } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { formatDuration } from "@/lib/format";
import type { VideoPage } from "@/lib/types";
import { cn } from "@/lib/utils";

interface PartsListProps {
  pages: VideoPage[];
  selectedPages: number[];
  disabled?: boolean;
  onToggle: (page: number) => void;
  onToggleAll: (checked: boolean) => void;
}

export function PartsList({ pages, selectedPages, disabled, onToggle, onToggleAll }: PartsListProps) {
  if (pages.length <= 1) return null;
  const allSelected = selectedPages.length === pages.length;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <Layers className="h-4 w-4" />
              分P 列表（{pages.length}）
            </CardTitle>
            <CardDescription>勾选要下载的分P，可一次批量创建多个下载任务。</CardDescription>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Checkbox
              id="select-all-parts"
              checked={allSelected}
              onCheckedChange={(checked) => onToggleAll(checked === true)}
              disabled={disabled}
            />
            <label htmlFor="select-all-parts" className="cursor-pointer select-none">
              全选 / 取消全选（已选 {selectedPages.length} / {pages.length}）
            </label>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="max-h-80 overflow-y-auto pr-1">
          <div className="grid gap-2 sm:grid-cols-2">
            {pages.map((page) => {
              const checked = selectedPages.includes(page.page);
              return (
                <div
                  key={page.cid}
                  role="button"
                  tabIndex={disabled ? -1 : 0}
                  onClick={() => {
                    if (!disabled) onToggle(page.page);
                  }}
                  onKeyDown={(event) => {
                    if (disabled) return;
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onToggle(page.page);
                    }
                  }}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors hover:bg-muted/50",
                    checked ? "border-primary/60 bg-primary/5" : "",
                    disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
                  )}
                >
                  <span onClick={(event) => event.stopPropagation()}>
                    <Checkbox
                      checked={checked}
                      disabled={disabled}
                      onCheckedChange={() => onToggle(page.page)}
                      aria-label={"选择第 " + String(page.page) + " 集"}
                    />
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    第{page.page}集 | {page.title || "未命名分P"}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatDuration(page.duration)}</span>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
