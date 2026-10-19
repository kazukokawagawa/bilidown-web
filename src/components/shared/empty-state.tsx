import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 py-14 text-center",
        className,
      )}
    >
      {Icon ? (
        <div className="anim-pop-in">
          <Icon className="float-soft h-10 w-10 text-muted-foreground/60" />
        </div>
      ) : null}
      <div className="anim-fade-up space-y-1" style={{ animationDelay: "70ms" }}>
        <p className="font-medium">{title}</p>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {action ? (
        <div className="anim-fade-up pt-1" style={{ animationDelay: "130ms" }}>
          {action}
        </div>
      ) : null}
    </div>
  );
}
