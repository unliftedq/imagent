import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "../lib/cn.js";

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

/**
 * Clay text input — cream background, hairline border, 44px tall, 12px
 * radius, 12×16 padding. Border thickens to ink on focus.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, type = "text", ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      type={type}
      className={cn(
        "block w-full bg-(--bg) text-(--text) " +
          "border border-(--border) rounded-(--radius-md) " +
          "h-11 px-4 py-3 text-(length:--text-body-md) " +
          "placeholder:text-(--text-faint) " +
          "transition-colors duration-(--duration-fast) " +
          "focus-visible:outline-none focus:border-(--text) " +
          "disabled:bg-(--surface) disabled:text-(--text-muted) disabled:cursor-not-allowed",
        className,
      )}
      {...rest}
    />
  );
});

Input.displayName = "Input";
