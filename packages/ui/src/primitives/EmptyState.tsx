import type { ReactNode } from "react";
import { cn } from "../lib/cn.js";

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-(--radius-lg) " +
          "border border-dashed border-(--color-hairline) bg-(--color-surface-soft) " +
          "px-8 py-16 text-center",
        className,
      )}
    >
      {icon ? <div className="text-(--color-muted)">{icon}</div> : null}
      <div className="text-(length:--text-title-md) font-semibold text-(--color-ink)">{title}</div>
      {description ? (
        <div className="max-w-md text-(length:--text-body-sm) text-(--color-body)">
          {description}
        </div>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
