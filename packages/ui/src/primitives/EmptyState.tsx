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
          "border border-dashed border-(--border) bg-(--surface) " +
          "px-8 py-16 text-center",
        className,
      )}
    >
      {icon ? <div className="text-(--text-muted)">{icon}</div> : null}
      <div className="text-(length:--text-title-md) font-semibold text-(--text)">{title}</div>
      {description ? (
        <div className="max-w-md text-(length:--text-body-sm) text-(--text)">
          {description}
        </div>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
