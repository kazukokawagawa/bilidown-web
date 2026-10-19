"use client";

import type { LucideIcon } from "lucide-react";
import { CircleCheck, CircleX, Download, ListChecks } from "lucide-react";
import { AnimatedNumber, revealDelay } from "@/components/shared/motion";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface TaskStatsProps {
  total: number;
  active: number;
  completed: number;
  failed: number;
}

interface StatItem {
  label: string;
  value: number;
  icon: LucideIcon;
  className: string;
}

export function TaskStats({ total, active, completed, failed }: TaskStatsProps) {
  const items: StatItem[] = [
    { label: "全部任务", value: total, icon: ListChecks, className: "text-foreground" },
    { label: "下载中", value: active, icon: Download, className: "text-blue-600 dark:text-blue-400" },
    { label: "已完成", value: completed, icon: CircleCheck, className: "text-emerald-600 dark:text-emerald-400" },
    { label: "失败", value: failed, icon: CircleX, className: "text-red-600 dark:text-red-400" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map((item, index) => {
        const Icon = item.icon;
        return (
          // 入场放 wrapper、hover 放卡片：两层职责分离，
          // 入场动画进行中也不会与 hover 的位移/图标动效互相覆盖。
          <div key={item.label} className="anim-fade-up h-full" style={revealDelay(index)}>
            <Card className="group hover-lift h-full py-0">
              <CardContent className="flex items-center justify-between gap-2 p-4">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                  <p className="text-2xl font-semibold tabular-nums">
                    <AnimatedNumber value={item.value} />
                  </p>
                </div>
                <Icon
                  className={cn(
                    "h-8 w-8 opacity-80 transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-3",
                    item.className,
                  )}
                />
              </CardContent>
            </Card>
          </div>
        );
      })}
    </div>
  );
}
