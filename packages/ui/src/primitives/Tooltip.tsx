import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef, type ReactNode } from "react";
import { cn } from "../lib/cn.js";

export const TooltipProvider = TooltipPrimitive.Provider;
export const TooltipRoot = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export const TooltipContent = forwardRef<
  ElementRef<typeof TooltipPrimitive.Content>,
  ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(function TooltipContent({ className, sideOffset = 6, ...rest }, ref) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        className={cn(
          // `w-max` makes the tooltip hug its content; `max-w-[20rem]` caps it
          // for long error reasons (Tailwind v4 dropped the named `max-w-sm`
          // token, so we use a literal). `whitespace-normal` keeps wrapping
          // available within the cap.
          "z-50 w-max max-w-[20rem] whitespace-normal",
          "rounded-(--radius-sm) bg-(--accent) px-3 py-1.5",
          "text-(length:--text-caption) text-(--accent-fg) shadow-md",
          // Plain opacity transition driven by Radix's data-state — avoids
          // depending on the `tailwindcss-animate` plugin (which isn't in the
          // workspace) for animate-in/out + fade-in/out-0 utilities.
          "transition-opacity duration-(--duration-fast)",
          "data-[state=delayed-open]:opacity-100 data-[state=instant-open]:opacity-100",
          "data-[state=closed]:opacity-0",
          className,
        )}
        {...rest}
      />
    </TooltipPrimitive.Portal>
  );
});

/**
 * Convenience composite — the common case is "tooltip wrapping a child".
 */
export interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
}

export function Tooltip({ content, children, side = "top" }: TooltipProps) {
  return (
    <TooltipPrimitive.Provider delayDuration={150}>
      <TooltipRoot>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent side={side}>{content}</TooltipContent>
      </TooltipRoot>
    </TooltipPrimitive.Provider>
  );
}
