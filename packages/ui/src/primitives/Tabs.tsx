import * as TabsPrimitive from "@radix-ui/react-tabs";
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from "react";
import { cn } from "../lib/cn.js";

export const TabsRoot = TabsPrimitive.Root;

export const TabsList = forwardRef<
  ElementRef<typeof TabsPrimitive.List>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(function TabsList({ className, ...rest }, ref) {
  return (
    <TabsPrimitive.List
      ref={ref}
      className={cn(
        "inline-flex items-center gap-1 rounded-(--radius-sm) bg-(--surface) p-1",
        className,
      )}
      {...rest}
    />
  );
});

export const TabsTrigger = forwardRef<
  ElementRef<typeof TabsPrimitive.Trigger>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(function TabsTrigger({ className, ...rest }, ref) {
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center rounded-(--radius-xs) px-3 py-1.5 " +
          "text-[13px] text-(--text-muted) " +
          "transition-colors duration-(--motion-fast) ease-(--ease-out) " +
          "data-[state=active]:bg-(--surface-raised) data-[state=active]:text-(--text) " +
          "data-[state=active]:shadow-[inset_0_0_0_1px_var(--border)] " +
          "disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      {...rest}
    />
  );
});

export const TabsContent = TabsPrimitive.Content;

/**
 * Underline tab strip — design spec §9.6. 40px tall row, hairline-bottom
 * border on the *list*, accent rule under the active trigger. Used at the
 * top of the Studio params rail (`Image | Video`).
 */
export const TabsListUnderline = forwardRef<
  ElementRef<typeof TabsPrimitive.List>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(function TabsListUnderline({ className, ...rest }, ref) {
  return (
    <TabsPrimitive.List
      ref={ref}
      className={cn(
        "flex h-10 items-end gap-1 border-b border-(--border) px-2",
        className,
      )}
      {...rest}
    />
  );
});

export const TabsTriggerUnderline = forwardRef<
  ElementRef<typeof TabsPrimitive.Trigger>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(function TabsTriggerUnderline({ className, ...rest }, ref) {
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(
        "relative inline-flex h-10 items-center px-3 text-[13px] font-semibold " +
          "text-(--text-muted) transition-colors duration-(--motion-fast) " +
          "ease-(--ease-out) data-[state=active]:text-(--text) " +
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--focus-ring) " +
          "after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-t-(--radius-xs) " +
          "after:bg-transparent data-[state=active]:after:bg-(--accent)",
        className,
      )}
      {...rest}
    />
  );
});

export const Tabs = {
  Root: TabsRoot,
  List: TabsList,
  Trigger: TabsTrigger,
  Content: TabsContent,
  ListUnderline: TabsListUnderline,
  TriggerUnderline: TabsTriggerUnderline,
};
