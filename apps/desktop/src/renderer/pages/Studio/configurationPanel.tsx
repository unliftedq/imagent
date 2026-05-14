import { cn, Icons, Select } from "@imagent/ui";
import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from "react";

export interface ConfigurationPopoverButtonProps extends ComponentPropsWithoutRef<"button"> {
  label: string;
}

export const ConfigurationPopoverButton = forwardRef<
  HTMLButtonElement,
  ConfigurationPopoverButtonProps
>(function ConfigurationPopoverButton(
  { label, className, title, type = "button", "aria-label": ariaLabel, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={ariaLabel ?? label}
      title={title ?? label}
      className={cn(
        "inline-flex size-8 items-center justify-center rounded-(--radius-pill) " +
          "border border-(--border) bg-(--bg) text-(--text) " +
          "transition-colors duration-(--motion-fast) hover:border-(--text-muted) " +
          "focus-visible:outline-none focus:border-(--text) data-[state=open]:border-(--text)",
        className,
      )}
      {...props}
    >
      <Icons.SlidersHorizontal weight="duotone" className="size-3.5 text-(--text-muted)" />
    </button>
  );
});

ConfigurationPopoverButton.displayName = "ConfigurationPopoverButton";

export function ConfigSection({
  title,
  description,
  trailing,
  children,
}: {
  title: string;
  description?: string;
  trailing?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[13px] font-semibold text-(--text)">{title}</h3>
          {description ? (
            <p className="mt-0.5 text-[11px] leading-4 text-(--text-faint)">{description}</p>
          ) : null}
        </div>
        {trailing ? <span className="text-(--text-muted)">{trailing}</span> : null}
      </div>
      {children}
    </section>
  );
}

export function AspectRatioGrid({
  ratios,
  value,
  onChange,
}: {
  ratios: readonly string[];
  value: string | undefined;
  onChange: (ratio: string) => void;
}) {
  return (
    <div className="grid grid-cols-5 gap-2 rounded-(--radius-md) bg-(--surface) p-3">
      {ratios.map((ratio) => (
        <button
          key={ratio}
          type="button"
          aria-pressed={ratio === value}
          onClick={() => onChange(ratio)}
          className={
            "flex h-14 flex-col items-center justify-center gap-1 rounded-(--radius-sm) " +
            "text-[12px] text-(--text-muted) transition-colors duration-(--motion-fast) " +
            "hover:bg-(--bg) hover:text-(--text) focus-visible:outline-none " +
            "focus-visible:ring-2 focus-visible:ring-(--focus-ring) " +
            (ratio === value
              ? "bg-(--bg) text-(--text) shadow-[inset_0_0_0_1px_var(--border)]"
              : "")
          }
        >
          <span
            className="rounded-[4px] border-2 border-current"
            style={aspectRatioIconStyle(ratio)}
            aria-hidden="true"
          />
          <span>{ratio}</span>
        </button>
      ))}
    </div>
  );
}

export function SizePresetGrid({
  presets,
  value,
  allowCustom,
  customActive,
  onChange,
  onSelectCustom,
}: {
  presets: readonly string[];
  value: string | undefined;
  allowCustom?: boolean;
  customActive?: boolean;
  onChange: (size: string) => void;
  onSelectCustom?: () => void;
}) {
  const showCustom = allowCustom === true;
  return (
    <div className="grid grid-cols-3 gap-1 rounded-(--radius-md) bg-(--surface) p-1.5">
      {presets.map((preset) => (
        <SizePresetButton
          key={preset}
          label={preset}
          value={preset}
          active={!customActive && preset === value}
          onClick={() => onChange(preset)}
        />
      ))}
      {showCustom ? (
        <SizePresetButton
          label="Custom"
          active={
            customActive === true ||
            presets.length === 0 ||
            (!!value && !presets.includes(value))
          }
          custom
          onClick={onSelectCustom}
        />
      ) : null}
    </div>
  );
}

function SizePresetButton({
  label,
  value,
  active,
  custom,
  onClick,
}: {
  label: string;
  value?: string;
  active: boolean;
  custom?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={
        "flex h-11 flex-col items-center justify-center gap-1.5 rounded-(--radius-sm) py-1 " +
        "text-[10px] text-(--text-muted) transition-colors duration-(--motion-fast) " +
        "hover:bg-(--bg) hover:text-(--text) focus-visible:outline-none " +
        "focus-visible:ring-2 focus-visible:ring-(--focus-ring) " +
        (active ? "bg-(--bg) text-(--text) shadow-[inset_0_0_0_1px_var(--border)]" : "")
      }
    >
      <span
        className={cn(
          "rounded-[3px] border-[1.5px] border-current",
          custom ? "border-dashed" : "",
        )}
        style={custom ? CUSTOM_PRESET_ICON_STYLE : sizePresetIconStyle(value)}
        aria-hidden="true"
      />
      <span className="max-w-full truncate px-1 leading-none">{label}</span>
    </button>
  );
}

const CUSTOM_PRESET_ICON_STYLE = { width: 20, height: 16 } as const;

export function PanelSelectTrigger({ ariaLabel }: { ariaLabel: string }) {
  return (
    <Select.Trigger
      aria-label={ariaLabel}
      className="h-9 w-full rounded-(--radius-md) bg-(--bg) px-3 py-0 text-[12px]"
    >
      <Select.Value />
    </Select.Trigger>
  );
}

export function SegmentedControl<T extends string | number>({
  options,
  value,
  ariaLabel,
  formatLabel,
  onChange,
}: {
  options: readonly T[];
  value: T | undefined;
  ariaLabel: string;
  formatLabel?: (option: T) => string;
  onChange: (next: T) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="grid auto-cols-fr grid-flow-col gap-1 rounded-(--radius-md) bg-(--surface) p-1"
    >
      {options.map((option) => {
        const active = option === value;
        return (
          <button
            key={String(option)}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option)}
            className={
              "inline-flex h-8 items-center justify-center rounded-(--radius-sm) " +
              "px-3 text-[12px] font-medium transition-colors duration-(--motion-fast) " +
              "ease-(--ease-out) focus-visible:outline-none focus-visible:ring-2 " +
              "focus-visible:ring-(--focus-ring) " +
              (active
                ? "bg-(--bg) text-(--text) shadow-[inset_0_0_0_1px_var(--border)]"
                : "text-(--text-muted) hover:bg-(--bg)/60 hover:text-(--text)")
            }
          >
            {formatLabel ? formatLabel(option) : String(option)}
          </button>
        );
      })}
    </div>
  );
}

function sizePresetIconStyle(value: string | undefined): { width: number; height: number } {
  if (!value) return { width: 18, height: 18 };
  const [wRaw, hRaw] = value.split("x");
  const w = Number(wRaw);
  const h = Number(hRaw);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    return { width: 18, height: 18 };
  }
  const max = 20;
  const min = 8;
  if (w >= h) {
    return { width: max, height: Math.max(min, Math.round((max * h) / w)) };
  }
  return { width: Math.max(min, Math.round((max * w) / h)), height: max };
}

function aspectRatioIconStyle(ratio: string): { width: number; height: number } {
  const [wRaw, hRaw] = ratio.split(":");
  const w = Number(wRaw);
  const h = Number(hRaw);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    return { width: 22, height: 22 };
  }
  const max = 24;
  const min = 10;
  if (w >= h) {
    return { width: max, height: Math.max(min, Math.round((max * h) / w)) };
  }
  return { width: Math.max(min, Math.round((max * w) / h)), height: max };
}
