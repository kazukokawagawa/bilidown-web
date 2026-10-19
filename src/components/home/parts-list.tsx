"use client";

// 合集（ugc_season）剧集列表由同目录的 collection-list.tsx 负责，本组件只展示分P。

import { Layers } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { formatDuration } from "@/lib/format";
import type { VideoPage } from "@/lib/types";
import { cn } from "@/lib/utils";

interface PartsListProps {
  /** lg 下拉满父级剩余高度：用于填满左栏底部空白（列表内部滚动） */
  fill?: boolean;
  pages: VideoPage[];
  selectedPages: number[];
  disabled?: boolean;
  onToggle: (page: number) => void;
  onToggleAll: (checked: boolean) => void;
}

export function PartsList({ pages, selectedPages, disabled, onToggle, onToggleAll, fill }: PartsListProps) {
  if (pages.length <= 1) return null;
  const allSelected = selectedPages.length === pages.length;

  return (
    <Card className={cn("flex min-h-0 flex-col", fill && "lg:flex-1")}>
      <CardHeader className="shrink-0">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="flex min-w-0 items-center gap-2 text-base">
              <Layers className="h-4 w-4 shrink-0" />
              分P 列表（{pages.length}）
            </CardTitle>
            {/* 全选控件固定不换行，单独占一行右侧，避免计数被拆行 */}
            <div className="flex shrink-0 items-center gap-2 rounded-lg border bg-muted/40 px-2.5 py-1.5">
              <Checkbox
                id="select-all-parts"
                checked={allSelected}
                onCheckedChange={(checked) => onToggleAll(checked === true)}
                disabled={disabled}
              />
              <label
                htmlFor="select-all-parts"
                title="全选 / 取消全选"
                className="cursor-pointer select-none whitespace-nowrap text-xs font-medium"
              >
                全选
                <span className="ml-1.5 font-normal text-muted-foreground tabular-nums">
                  已选 {selectedPages.length}/{pages.length}
                </span>
              </label>
            </div>
          </div>
          <CardDescription>勾选要下载的分P，可一次批量创建多个下载任务。</CardDescription>
        </div>
      </CardHeader>
      <CardContent className={cn("flex flex-col", fill && "lg:min-h-0 lg:flex-1")}>
        <div
          className={cn(
            "scroll-area max-h-80 min-h-0 overflow-y-auto pr-1",
            fill && "lg:max-h-none lg:flex-1 lg:[contain:size]",
          )}
        >
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
