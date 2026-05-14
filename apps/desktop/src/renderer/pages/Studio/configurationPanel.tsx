import { Icons, Select } from "@imagent/ui";
import type { ReactNode } from "react";

export function ConfigurationPopoverButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      className={
        "flex h-8 items-center justify-between gap-2 rounded-(--radius-pill) " +
        "border border-(--border) bg-(--bg) px-3 py-0 text-[12px] text-(--text) " +
        "transition-colors duration-(--motion-fast) hover:border-(--text-muted) " +
        "focus-visible:outline-none focus:border-(--text) data-[state=open]:border-(--text)"
      }
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <Icons.SlidersHorizontal
          weight="duotone"
          className="size-3.5 shrink-0 text-(--text-muted)"
        />
        <span className="truncate">Configuration</span>
      </span>
      <Icons.CaretDown weight="bold" className="size-3 shrink-0 text-(--text-muted)" />
    </button>
  );
}

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
            (ratio === value ? "bg-(--bg) text-(--text) shadow-[inset_0_0_0_1px_var(--border)]" : "")
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
