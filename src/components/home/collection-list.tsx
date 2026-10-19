"use client";

import { ListVideo } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { formatDuration } from "@/lib/format";
import type { CollectionEpisode, CollectionSection } from "@/lib/types";
import { cn } from "@/lib/utils";

interface EpisodeRow {
  episode: CollectionEpisode;
  /** 展平后的 1-based 序号（与下载任务的 listIndex 一致） */
  index: number;
}

interface SectionRows {
  key: string;
  title: string;
  rows: EpisodeRow[];
}

/** 按 sections 顺序展平并生成序号；全选/取消全选也基于该顺序。 */
function buildSectionRows(sections: CollectionSection[]): SectionRows[] {
  let index = 0;
  return sections.map((section, sectionIndex) => ({
    key: String(section.id) + "-" + String(sectionIndex),
    title: section.title,
    rows: section.episodes.map((episode) => {
      index += 1;
      return { episode, index };
    }),
  }));
}

interface CollectionListProps {
  /** lg 下拉满父级剩余高度：用于填满左栏底部空白（列表内部滚动） */
  fill?: boolean;
  /** 合集/番剧标题（用于说明文案与列表文件夹名提示） */
  title: string;
  sections: CollectionSection[];
  /** 当前解析视频对应的剧集 id，命中时显示「当前」徽标 */
  currentEpisodeId: number | null;
  /** ugc=UGC 合集；pgc=番剧 season（正片 + PV/预告等小节） */
  source?: "ugc" | "pgc";
  selectedIds: number[];
  disabled?: boolean;
  onToggle: (id: number) => void;
  onToggleAll: (checked: boolean) => void;
}

export function CollectionList({
  title,
  sections,
  currentEpisodeId,
  source,
  selectedIds,
  disabled,
  onToggle,
  onToggleAll,
  fill,
}: CollectionListProps) {
  const isBangumi = source === "pgc";
  const sectionRows = buildSectionRows(sections);
  const total = sectionRows.reduce((count, section) => count + section.rows.length, 0);
  if (total === 0) return null;

  let selectedCount = 0;
  for (const section of sectionRows) {
    for (const row of section.rows) {
      if (selectedIds.includes(row.episode.id)) selectedCount += 1;
    }
  }
  const allSelected = selectedCount === total;

  return (
    <Card className={cn("flex min-h-0 flex-col", fill && "lg:flex-1")}>
      <CardHeader className="shrink-0">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="flex min-w-0 items-center gap-2 text-base">
              <ListVideo className="h-4 w-4 shrink-0" />
              {isBangumi ? "剧集列表" : "合集列表"}（{total}）
            </CardTitle>
            {/* 全选控件固定不换行，单独占一行右侧，避免「已选 1 /」被拆行 */}
            <div className="flex shrink-0 items-center gap-2 rounded-lg border bg-muted/40 px-2.5 py-1.5">
              <Checkbox
                id="select-all-collection"
                checked={allSelected}
                onCheckedChange={(checked) => onToggleAll(checked === true)}
                disabled={disabled}
              />
              <label
                htmlFor="select-all-collection"
                title="全选 / 取消全选"
                className="cursor-pointer select-none whitespace-nowrap text-xs font-medium"
              >
                全选
                <span className="ml-1.5 font-normal text-muted-foreground tabular-nums">
                  已选 {selectedCount}/{total}
                </span>
              </label>
            </div>
          </div>
          <CardDescription>
            {title ? <span className="font-medium text-foreground">{title}</span> : null}
            {title ? " · " : ""}
            可批量勾选，下载时按{isBangumi ? "番剧名" : "合集名"}建子文件夹。
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className={cn("flex flex-col", fill && "lg:min-h-0 lg:flex-1")}>
        {/* fill 时用 contain:size 让滚动区只占剩余高度，不把卡片撑高；小屏仍限制为 max-h-96 */}
        <div
          className={cn(
            "scroll-area max-h-96 min-h-0 space-y-3 overflow-y-auto pr-1",
            fill && "lg:max-h-none lg:flex-1 lg:[contain:size]",
          )}
        >
          {sectionRows.map((section) => (
            <div key={section.key} className="space-y-2">
              {sectionRows.length > 1 ? (
                <p className="px-1 text-xs font-medium text-muted-foreground">{section.title || "未命名小节"}</p>
              ) : null}
              {section.rows.map(({ episode, index }) => {
                const checked = selectedIds.includes(episode.id);
                const isCurrent = currentEpisodeId !== null && episode.id === currentEpisodeId;
                return (
                  <div
                    key={String(episode.id) + "-" + String(index)}
                    role="button"
                    tabIndex={disabled ? -1 : 0}
                    onClick={() => {
                      if (!disabled) onToggle(episode.id);
                    }}
                    onKeyDown={(event) => {
                      if (disabled) return;
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onToggle(episode.id);
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
                        onCheckedChange={() => onToggle(episode.id)}
                        aria-label={"选择第 " + String(index) + " 集"}
                      />
                    </span>
                    <span className="w-7 shrink-0 text-xs tabular-nums text-muted-foreground">{index}</span>
                    <span className="min-w-0 flex-1 truncate">{episode.title || "未命名剧集"}</span>
                    {isCurrent ? (
                      <Badge variant="secondary" className="shrink-0 text-[10px]">
                        当前
                      </Badge>
                    ) : null}
                    <span className="shrink-0 text-xs text-muted-foreground">{formatDuration(episode.duration)}</span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
