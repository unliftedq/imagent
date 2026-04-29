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
        "block w-full bg-(--color-canvas) text-(--color-ink) " +
          "border border-(--color-hairline) rounded-(--radius-md) " +
          "h-11 px-4 py-3 text-(length:--text-body-md) " +
          "placeholder:text-(--color-muted-soft) " +
          "transition-colors duration-(--duration-fast) " +
          "focus-visible:outline-none focus:border-(--color-ink) " +
          "disabled:bg-(--color-surface-soft) disabled:text-(--color-muted) disabled:cursor-not-allowed",
        className,
      )}
      {...rest}
    />
  );
});

Input.displayName = "Input";
