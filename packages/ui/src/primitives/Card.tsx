import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "../lib/cn.js";

/**
 * Generic content card — cream surface with hairline border, no shadow.
 * Matches design.md `product-mockup-card` / `expert-card` shape.
 */
export const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function Card(
  { className, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        "rounded-(--radius-lg) border border-(--border) bg-(--bg) p-6",
        className,
      )}
      {...rest}
    />
  );
});

Card.displayName = "Card";

/** Same surface as Card but optionally without padding — used as a section frame. */
export const Panel = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function Panel(
  { className, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        "rounded-(--radius-lg) border border-(--border) bg-(--bg)",
        className,
      )}
      {...rest}
    />
  );
});

Panel.displayName = "Panel";

export const PanelHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function PanelHeader({ className, ...rest }, ref) {
    return (
      <div
        ref={ref}
        className={cn(
          "flex items-center justify-between gap-3 border-b border-(--border-faint) px-6 py-4",
          className,
        )}
        {...rest}
      />
    );
  },
);

PanelHeader.displayName = "PanelHeader";

export const PanelBody = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function PanelBody({ className, ...rest }, ref) {
    return <div ref={ref} className={cn("p-6", className)} {...rest} />;
  },
);

PanelBody.displayName = "PanelBody";
