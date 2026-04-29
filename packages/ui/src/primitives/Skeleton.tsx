import type { HTMLAttributes } from "react";
import { cn } from "../lib/cn.js";

export function Skeleton({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-(--radius-sm) bg-(--color-surface-soft)",
        className,
      )}
      {...rest}
    />
  );
}
