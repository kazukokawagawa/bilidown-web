import { Badge } from "@/components/ui/badge";
import { TASK_STATUS_LABELS } from "@/lib/constants";
import type { TaskStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const STATUS_CLASS: Record<TaskStatus, string> = {
  queued: "bg-muted text-muted-foreground",
  downloading: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  merging: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  completed: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  error: "bg-red-500/15 text-red-600 dark:text-red-400",
  paused: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
  cancelled: "bg-muted text-muted-foreground",
};

/** 进行中的状态显示呼吸小圆点，让「正在下载/合并」一眼可见。 */
const ACTIVE_STATUSES: TaskStatus[] = ["downloading", "merging"];

export function StatusBadge({ status }: { status: TaskStatus }) {
  return (
    <Badge variant="secondary" className={cn("font-normal", STATUS_CLASS[status])}>
      {ACTIVE_STATUSES.includes(status) ? <span className="live-dot" aria-hidden="true" /> : null}
      {TASK_STATUS_LABELS[status]}
    </Badge>
  );
}
