import type { LucideIcon } from "lucide-react";
import { CircleCheck, CircleX, Download, ListChecks } from "lucide-react";
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
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Card key={item.label} className="py-0">
            <CardContent className="flex items-center justify-between gap-2 p-4">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">{item.label}</p>
                <p className="text-2xl font-semibold tabular-nums">{item.value}</p>
              </div>
              <Icon className={cn("h-8 w-8 opacity-80", item.className)} />
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
