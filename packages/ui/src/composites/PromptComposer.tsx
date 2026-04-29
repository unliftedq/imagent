import { useEffect, useRef, type KeyboardEvent } from "react";
import { Plus } from "@phosphor-icons/react";
import { cn } from "../lib/cn.js";
import { Tooltip } from "../primitives/Tooltip.js";

export interface PromptComposerAssetSlot {
  /** "Style:" / "Character:" — populated in M6. */
  label: string;
  value: string;
  onRemove?: () => void;
}

export interface PromptComposerProps {
  prompt: string;
  onPromptChange: (next: string) => void;
  /** Cmd/Ctrl+Enter shortcut handler (parent owns the actual generate call). */
  onSubmit?: () => void;
  /** Asset chips appearing on a row above the textarea. M5 receives an empty
   *  array; M6 will populate it via the AssetPicker composite. */
  assetSlots?: ReadonlyArray<PromptComposerAssetSlot>;
  placeholder?: string;
  /** When false, M5 renders the disabled "+ asset" stub with a Coming Soon tooltip. */
  enableAssetPicker?: boolean;
  /** When the parent wants to re-render with a fresh focus, bump this. */
  autoFocusKey?: number;
  className?: string;
  /** Tabular-figures character counter. Off by default — Studio doesn't need it. */
  showCharCount?: boolean;
}

/**
 * PromptComposer per design.md §10. Large textarea (6 visible lines, autosizes
 * up to 14), style/character chip row above, no shadow, 1px hairline border.
 * Cmd/Ctrl+Enter → onSubmit. The actual *Generate* button is the parent
 * page's responsibility — this component is presentational + keyboard-aware.
 */
export function PromptComposer({
  prompt,
  onPromptChange,
  onSubmit,
  assetSlots = [],
  placeholder = "Describe the image you want…",
  enableAssetPicker = false,
  autoFocusKey,
  className,
  showCharCount = false,
}: PromptComposerProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Auto-grow up to ~14 lines. We measure with scrollHeight — set height to
  // auto first so shrinking works on backspace.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    const lineHeight = 22; // matches text-body-md leading; conservative
    const maxRows = 14;
    const minRows = 6;
    const desired = Math.max(
      lineHeight * minRows,
      Math.min(el.scrollHeight, lineHeight * maxRows),
    );
    el.style.height = `${desired}px`;
  }, [prompt]);

  useEffect(() => {
    if (autoFocusKey === undefined) return;
    ref.current?.focus();
  }, [autoFocusKey]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    // Cmd/Ctrl+Enter triggers submit. Plain Enter inserts a newline.
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      onSubmit?.();
    }
  };

  const charCount = prompt.length;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="relative">
        <textarea
          ref={ref}
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={6}
          className={cn(
            "block w-full bg-(--color-canvas) text-(--color-ink) " +
              "border border-(--color-hairline) rounded-(--radius-md) " +
              "px-4 py-3 text-(length:--text-body-md) resize-none " +
              "placeholder:text-(--color-muted-soft) " +
              "transition-colors duration-(--duration-fast) " +
              "focus-visible:outline-none focus:border-(--color-ink)",
          )}
        />
        {showCharCount ? (
          <span
            className={
              "pointer-events-none absolute bottom-2 right-3 select-none " +
              "font-[Inter] text-(length:--text-caption) text-(--color-muted-soft) " +
              "[font-variant-numeric:tabular-nums]"
            }
          >
            {charCount.toLocaleString()}
          </span>
        ) : null}
      </div>

      {/* Asset slot row — populated in M6. M5 shows the disabled stub. */}
      <div className="flex flex-wrap items-center gap-2">
        {assetSlots.map((slot, idx) => (
          <span
            key={`${slot.label}-${idx}`}
            className={
              "inline-flex items-center gap-1 rounded-(--radius-pill) " +
              "bg-(--color-surface-card) text-(--color-ink) " +
              "px-3 py-1 text-(length:--text-caption)"
            }
          >
            <span className="font-semibold">{slot.label}</span>
            <span className="truncate max-w-[180px]">{slot.value}</span>
            {slot.onRemove ? (
              <button
                type="button"
                onClick={slot.onRemove}
                className="text-(--color-muted) hover:text-(--color-ink)"
                aria-label="Remove asset"
              >
                ×
              </button>
            ) : null}
          </span>
        ))}
        {enableAssetPicker ? null : (
          <Tooltip content="Asset slots arrive in M6.">
            <span
              aria-disabled="true"
              className={
                "inline-flex items-center gap-1.5 rounded-(--radius-pill) " +
                "border border-dashed border-(--color-hairline) " +
                "px-3 py-1 text-(length:--text-caption) text-(--color-muted-soft) " +
                "select-none cursor-not-allowed"
              }
            >
              <Plus weight="bold" className="size-3.5" />
              asset
            </span>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
