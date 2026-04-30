import * as SelectPrimitive from "@radix-ui/react-select";
import { CaretDown, CaretUp, Check } from "@phosphor-icons/react";
import { cn } from "../lib/cn.js";

/**
 * Compact representation of a model the parent has already resolved against
 * the catalog (`@imagine/core` `resolveImageModel`). Each entry carries
 * its capabilities so the dropdown can render them inline as a 3-5 line
 * mono-spaced summary table.
 */
export interface ResolvedModelOption {
  id: string;
  displayName?: string | null;
  capabilities?: {
    sizes?: readonly string[];
    aspectRatios?: readonly string[];
    qualities?: readonly string[];
    maxReferences?: number;
    maxOutputs?: number;
    supportsSeed?: boolean;
    supportsNegativePrompt?: boolean;
    supportsStyleRef?: boolean;
  };
}

export interface ModelSelectProps {
  models: ReadonlyArray<ResolvedModelOption>;
  /** Currently-selected model id; uncontrolled when undefined. */
  value: string | undefined;
  onChange: (modelId: string) => void;
  /** Optional disabled state when no provider is configured. */
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}

/**
 * Studio-page model picker. Both the trigger and each item show only the
 * model's displayName (or its id when displayName is absent). For
 * Azure-style deployment-based providers the registry sets `displayName` to
 * the deployment name, so what the user typed in the Providers form is
 * what they see here.
 */
export function ModelSelect({
  models,
  value,
  onChange,
  disabled,
  className,
  ariaLabel = "Model",
}: ModelSelectProps) {
  const current = models.find((m) => m.id === value) ?? models[0];
  return (
    <SelectPrimitive.Root
      value={value ?? current?.id}
      onValueChange={(id) => onChange(id)}
      disabled={disabled || models.length === 0}
    >
      <SelectPrimitive.Trigger
        aria-label={ariaLabel}
        className={cn(
          "flex h-11 w-full items-center justify-between gap-3 rounded-(--radius-md) " +
            "border border-(--border) bg-(--bg) px-4 " +
            "text-(length:--text-body-sm) text-(--text) " +
            "transition-colors duration-(--duration-fast) " +
            "focus-visible:outline-none focus:border-(--text) " +
            "data-[placeholder]:text-(--text-faint) " +
            "disabled:cursor-not-allowed disabled:opacity-60",
          className,
        )}
      >
        <span className="truncate font-semibold">
          {current?.displayName ?? current?.id ?? "—"}
        </span>
        <SelectPrimitive.Icon asChild>
          <CaretDown weight="bold" className="size-4 text-(--text-muted)" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={4}
          className={cn(
            "z-50 min-w-[var(--radix-select-trigger-width)] max-w-[480px] overflow-hidden " +
              "rounded-(--radius-md) border border-(--border) bg-(--bg) " +
              "shadow-[0_4px_24px_-8px_rgba(0,0,0,0.08)]",
          )}
        >
          <SelectPrimitive.ScrollUpButton className="flex h-6 items-center justify-center">
            <CaretUp className="size-4" />
          </SelectPrimitive.ScrollUpButton>
          <SelectPrimitive.Viewport className="p-1">
            {models.map((m) => (
              <SelectPrimitive.Item
                key={m.id}
                value={m.id}
                className={cn(
                  "relative flex cursor-pointer select-none rounded-(--radius-sm) " +
                    "px-3 py-2 pr-8 text-(--text) outline-none " +
                    "data-[highlighted]:bg-(--surface) " +
                    "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
                )}
              >
                <SelectPrimitive.ItemText>
                  <span className="text-(length:--text-body-sm) font-semibold">
                    {m.displayName ?? m.id}
                  </span>
                </SelectPrimitive.ItemText>
                <span className="absolute right-2 top-2 flex size-4 items-center justify-center">
                  <SelectPrimitive.ItemIndicator>
                    <Check weight="bold" className="size-3.5" />
                  </SelectPrimitive.ItemIndicator>
                </span>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
          <SelectPrimitive.ScrollDownButton className="flex h-6 items-center justify-center">
            <CaretDown className="size-4" />
          </SelectPrimitive.ScrollDownButton>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
