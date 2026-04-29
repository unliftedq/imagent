import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "../lib/cn.js";

/**
 * Clay primary button is near-black (`--accent`) with white text,
 * 12px radius, 44px height, no shadow. Variants follow design.md component
 * specs (button-primary / button-secondary / button-text-link).
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 select-none whitespace-nowrap font-semibold " +
    "transition-colors duration-(--duration-fast) ease-(--ease-standard) " +
    "disabled:cursor-not-allowed disabled:opacity-60 " +
    "focus-visible:outline-2 focus-visible:outline-(--accent) focus-visible:outline-offset-2",
  {
    variants: {
      variant: {
        primary:
          "bg-(--accent) text-(--accent-fg) " +
          "hover:bg-(--accent-active) " +
          "disabled:bg-(--surface-sunken) disabled:text-(--text-muted)",
        secondary:
          "bg-(--bg) text-(--text) border border-(--border) " +
          "hover:border-(--text) hover:bg-(--surface)",
        ghost:
          "bg-transparent text-(--text) " +
          "hover:bg-(--surface)",
        danger:
          "bg-(--danger) text-white hover:opacity-90",
      },
      size: {
        sm: "h-8 rounded-(--radius-sm) px-3 text-sm",
        md: "h-11 rounded-(--radius-md) px-5 text-sm",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, asChild, leadingIcon, trailingIcon, children, ...rest },
  ref,
) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...rest}>
      {leadingIcon ? <span className="-ml-0.5">{leadingIcon}</span> : null}
      <span>{children}</span>
      {trailingIcon ? <span className="-mr-0.5">{trailingIcon}</span> : null}
    </Comp>
  );
});

Button.displayName = "Button";
