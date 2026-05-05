import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "@phosphor-icons/react";
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from "react";
import { cn } from "../lib/cn.js";

/**
 * Radix Dialog primitives wrapped with Clay tokens. Two flavours:
 *   - `<Dialog.Content>` — centered modal; default for create / confirm flows.
 *   - `<Dialog.Sheet>` — right-side sheet; used for asset detail drawer in
 *     the Assets page (design spec §11).
 */
export const DialogRoot = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogTitle = DialogPrimitive.Title;
export const DialogDescription = DialogPrimitive.Description;
export const DialogClose = DialogPrimitive.Close;

export const DialogOverlay = forwardRef<
  ElementRef<typeof DialogPrimitive.Overlay>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(function DialogOverlay({ className, ...rest }, ref) {
  return (
    <DialogPrimitive.Overlay
      ref={ref}
      className={cn(
        "fixed inset-0 z-40 bg-(--text)/40 backdrop-blur-[1px] " +
          "data-[state=open]:animate-in data-[state=closed]:animate-out " +
          "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        className,
      )}
      {...rest}
    />
  );
});

export const DialogContent = forwardRef<
  ElementRef<typeof DialogPrimitive.Content>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { showClose?: boolean }
>(function DialogContent({ className, children, showClose = true, ...rest }, ref) {
  return (
    <DialogPrimitive.Portal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          "fixed left-1/2 top-1/2 z-50 w-full max-w-xl -translate-x-1/2 -translate-y-1/2 " +
            "rounded-(--radius-lg) border border-(--border) " +
            "bg-(--bg) p-6 outline-none " +
            "data-[state=open]:animate-in data-[state=closed]:animate-out " +
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          className,
        )}
        {...rest}
      >
        {children}
        {showClose ? (
          <DialogPrimitive.Close
            className={
              "absolute right-4 top-4 inline-flex size-8 items-center justify-center " +
              "rounded-(--radius-sm) text-(--text-muted) " +
              "transition-colors duration-(--duration-fast) " +
              "hover:bg-(--surface) hover:text-(--text)"
            }
            aria-label="Close"
          >
            <X weight="bold" className="size-4" />
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
});

/**
 * Sheet variant — anchored to the right edge, full height. Used for the
 * Assets detail drawer.
 */
export const DialogSheet = forwardRef<
  ElementRef<typeof DialogPrimitive.Content>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { showClose?: boolean }
>(function DialogSheet({ className, children, showClose = true, ...rest }, ref) {
  return (
    <DialogPrimitive.Portal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          "fixed right-0 top-0 z-50 h-full w-screen max-w-[32rem] " +
            "border-l border-(--border) bg-(--bg) p-6 outline-none " +
            "overflow-y-auto " +
            "data-[state=open]:animate-in data-[state=closed]:animate-out " +
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          className,
        )}
        {...rest}
      >
        {children}
        {showClose ? (
          <DialogPrimitive.Close
            className={
              "absolute right-4 top-4 inline-flex size-8 items-center justify-center " +
              "rounded-(--radius-sm) text-(--text-muted) " +
              "transition-colors duration-(--duration-fast) " +
              "hover:bg-(--surface) hover:text-(--text)"
            }
            aria-label="Close"
          >
            <X weight="bold" className="size-4" />
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
});

export const Dialog = {
  Root: DialogRoot,
  Trigger: DialogTrigger,
  Content: DialogContent,
  Sheet: DialogSheet,
  Title: DialogTitle,
  Description: DialogDescription,
  Close: DialogClose,
  Overlay: DialogOverlay,
};
