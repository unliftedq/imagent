import { forwardRef, type TextareaHTMLAttributes } from "react";
import { cn } from "../lib/cn.js";

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, ...rest },
  ref,
) {
  return (
    <textarea
      ref={ref}
      className={cn(
        "block w-full bg-(--color-canvas) text-(--color-ink) " +
          "border border-(--color-hairline) rounded-(--radius-md) " +
          "px-4 py-3 text-(length:--text-body-md) min-h-[88px] resize-y " +
          "placeholder:text-(--color-muted-soft) " +
          "transition-colors duration-(--duration-fast) " +
          "focus-visible:outline-none focus:border-(--color-ink)",
        className,
      )}
      {...rest}
    />
  );
});

Textarea.displayName = "Textarea";
