import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "../lib/cn.js";

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Phosphor (or any) icon node. */
  icon: ReactNode;
  /** Accessible label — required because the visible content is just the icon. */
  "aria-label": string;
  size?: "sm" | "md";
}

/**
 * Square icon button styled as ghost — same hover/focus treatment as Button
 * ghost variant but constrained to icon-only content.
 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, className, size = "md", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        "inline-flex items-center justify-center rounded-(--radius-md) " +
          "text-(--color-ink) transition-colors duration-(--duration-fast) " +
          "hover:bg-(--color-surface-soft) " +
          "focus-visible:outline-2 focus-visible:outline-(--color-accent) focus-visible:outline-offset-2 " +
          "disabled:cursor-not-allowed disabled:opacity-60",
        size === "sm" ? "size-8" : "size-11",
        className,
      )}
      {...rest}
    >
      {icon}
    </button>
  );
});

IconButton.displayName = "IconButton";
