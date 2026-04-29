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
        "fixed bottom-4 right-4 z-50 flex max-h-screen w-full max-w-sm flex-col gap-2 outline-none",
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
        "flex items-center gap-3 rounded-(--radius-lg) border border-(--border) " +
          "bg-(--bg) p-4 text-(length:--text-body-sm) text-(--text) shadow-lg " +
          "data-[state=open]:animate-in data-[state=closed]:animate-out " +
          "data-[swipe=move]:translate-x-(--radix-toast-swipe-move-x) " +
          "data-[swipe=cancel]:translate-x-0 data-[swipe=end]:translate-x-(--radix-toast-swipe-end-x)",
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
