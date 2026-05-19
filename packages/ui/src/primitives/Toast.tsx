import * as ToastPrimitive from "@radix-ui/react-toast";
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from "react";
import { cn } from "../lib/cn.js";

export const ToastProvider = ToastPrimitive.Provider;

export const ToastViewport = forwardRef<
  ElementRef<typeof ToastPrimitive.Viewport>,
  ComponentPropsWithoutRef<typeof ToastPrimitive.Viewport>
>(function ToastViewport({ className, ...rest }, ref) {
  return (
    <ToastPrimitive.Viewport
      ref={ref}
      className={cn(
        // `max-w-sm` is broken in Tailwind v4 default theme (no --container-sm),
        // so we use a literal cap. Bottom-right anchored stack. The z-index
        // resolves above the dialog tier (`--z-dialog: 100`) via the
        // `--z-toast` design token so success/failure messages stay visible
        // when surfaced from inside an open dialog.
        "fixed bottom-4 right-4 z-(--z-toast) flex max-h-screen w-[24rem] max-w-[calc(100vw-2rem)] flex-col gap-2 outline-none",
        className,
      )}
      {...rest}
    />
  );
});

export const ToastRoot = forwardRef<
  ElementRef<typeof ToastPrimitive.Root>,
  ComponentPropsWithoutRef<typeof ToastPrimitive.Root>
>(function ToastRoot({ className, ...rest }, ref) {
  return (
    <ToastPrimitive.Root
      ref={ref}
      className={cn(
        "flex items-start gap-3 rounded-(--radius-lg) border border-(--border)",
        "bg-(--surface-raised) p-4 text-(length:--text-body-sm) text-(--text) shadow-lg",
        // Plain opacity transition driven by Radix's data-state — replaces the
        // broken animate-in/out classes that depended on the missing
        // tailwindcss-animate plugin.
        "transition-opacity duration-(--duration-base)",
        "data-[state=open]:opacity-100 data-[state=closed]:opacity-0",
        "data-[swipe=move]:translate-x-(--radix-toast-swipe-move-x)",
        "data-[swipe=cancel]:translate-x-0",
        "data-[swipe=end]:translate-x-(--radix-toast-swipe-end-x)",
        className,
      )}
      {...rest}
    />
  );
});

export const ToastTitle = forwardRef<
  ElementRef<typeof ToastPrimitive.Title>,
  ComponentPropsWithoutRef<typeof ToastPrimitive.Title>
>(function ToastTitle({ className, ...rest }, ref) {
  return (
    <ToastPrimitive.Title
      ref={ref}
      className={cn("text-(length:--text-title-sm) font-semibold", className)}
      {...rest}
    />
  );
});

export const ToastDescription = forwardRef<
  ElementRef<typeof ToastPrimitive.Description>,
  ComponentPropsWithoutRef<typeof ToastPrimitive.Description>
>(function ToastDescription({ className, ...rest }, ref) {
  return (
    <ToastPrimitive.Description
      ref={ref}
      className={cn("text-(--text)", className)}
      {...rest}
    />
  );
});

export const ToastClose = ToastPrimitive.Close;

export const Toast = {
  Provider: ToastProvider,
  Viewport: ToastViewport,
  Root: ToastRoot,
  Title: ToastTitle,
  Description: ToastDescription,
  Close: ToastClose,
};
