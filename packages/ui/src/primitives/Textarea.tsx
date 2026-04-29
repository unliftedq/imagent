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
        "block w-full bg-(--bg) text-(--text) " +
          "border border-(--border) rounded-(--radius-md) " +
          "px-4 py-3 text-(length:--text-body-md) min-h-[88px] resize-y " +
          "placeholder:text-(--text-faint) " +
          "transition-colors duration-(--duration-fast) " +
          "focus-visible:outline-none focus:border-(--text)",
        className,
      )}
      {...rest}
    />
  );
});

Textarea.displayName = "Textarea";
