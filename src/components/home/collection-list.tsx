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
  /** 合集标题（用于说明文案与列表文件夹名提示） */
  title: string;
  sections: CollectionSection[];
  /** 当前解析视频对应的剧集 id，命中时显示「当前」徽标 */
  currentEpisodeId: number | null;
  selectedIds: number[];
  disabled?: boolean;
  onToggle: (id: number) => void;
  onToggleAll: (checked: boolean) => void;
}

export function CollectionList({
  title,
  sections,
  currentEpisodeId,
  selectedIds,
  disabled,
  onToggle,
  onToggleAll,
}: CollectionListProps) {
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
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <ListVideo className="h-4 w-4" />
              合集列表（{total}）
            </CardTitle>
            <CardDescription>
              {title ? <span className="font-medium text-foreground">{title}</span> : null}
              {title ? " · " : ""}
              可批量勾选，下载时按合集名建子文件夹。
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Checkbox
              id="select-all-collection"
              checked={allSelected}
              onCheckedChange={(checked) => onToggleAll(checked === true)}
              disabled={disabled}
            />
            <label htmlFor="select-all-collection" className="cursor-pointer select-none">
              全选 / 取消全选（已选 {selectedCount} / {total}）
            </label>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="max-h-96 space-y-3 overflow-y-auto pr-1">
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
