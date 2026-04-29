import * as SwitchPrimitive from "@radix-ui/react-switch";
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from "react";
import { cn } from "../lib/cn.js";

/**
 * Radix Switch wrapped to match Clay's hairline aesthetic. The track is
 * cream when off and ink when on; the thumb is a solid puck.
 */
export const Toggle = forwardRef<
  ElementRef<typeof SwitchPrimitive.Root>,
  ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(function Toggle({ className, ...rest }, ref) {
  return (
    <SwitchPrimitive.Root
      ref={ref}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-(--radius-pill) " +
          "border border-(--color-hairline) bg-(--color-surface-soft) " +
          "transition-colors duration-(--duration-fast) " +
          "data-[state=checked]:bg-(--color-primary) data-[state=checked]:border-(--color-primary) " +
          "disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
      {...rest}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          "pointer-events-none block h-5 w-5 rounded-(--radius-full) bg-(--color-canvas) shadow-sm " +
            "transition-transform duration-(--duration-fast) translate-x-0.5 " +
            "data-[state=checked]:translate-x-5 data-[state=checked]:bg-(--color-canvas)",
        )}
      />
    </SwitchPrimitive.Root>
  );
});

Toggle.displayName = "Toggle";
