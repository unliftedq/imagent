import * as PopoverPrimitive from "@radix-ui/react-popover";
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from "react";
import { cn } from "../lib/cn.js";

/**
 * Radix Popover primitive — wrapped to inherit the Clay surface tokens and
 * the documented `shadow-popover` token (no extra elevation).
 */
export const PopoverRoot = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;
export const PopoverClose = PopoverPrimitive.Close;

export const PopoverContent = forwardRef<
  ElementRef<typeof PopoverPrimitive.Content>,
  ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(function PopoverContent(
  { className, align = "start", sideOffset = 8, collisionPadding = 8, ...rest },
  ref,
) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        ref={ref}
        align={align}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        className={cn(
          "z-50 rounded-(--radius-md) border border-(--border) " +
            "bg-(--bg) text-(--text) " +
            // Clay system: no shadow on content surfaces beyond the documented
            // hairline border.
            "p-3 outline-none " +
            // Never exceed the space Radix measured between the trigger and
            // the viewport edge — otherwise long popovers overflow off-screen
            // and the bottom rows become unreachable.
            "max-h-[var(--radix-popover-content-available-height)] overflow-hidden " +
            "data-[state=open]:animate-in data-[state=closed]:animate-out " +
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          className,
        )}
        {...rest}
      />
    </PopoverPrimitive.Portal>
  );
});

export const Popover = {
  Root: PopoverRoot,
  Trigger: PopoverTrigger,
  Content: PopoverContent,
  Anchor: PopoverAnchor,
  Close: PopoverClose,
};
