import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import type { Asset, AssetKind } from "@imagine-studio/core";
import { Plus } from "@phosphor-icons/react";
import { cn } from "../lib/cn.js";
import { Tooltip } from "../primitives/Tooltip.js";
import { AssetPicker } from "./AssetPicker.js";

export interface PromptComposerAssetSlot {
  /** "Style:" / "Character:" — populated in M6. */
  label: string;
  value: string;
  onRemove?: () => void;
}

export interface PromptComposerSelectedAssetIds {
  character: string[];
  object: string[];
  background: string[];
  style: string[];
}

export interface PromptComposerAssetsBundle {
  byKind: Record<AssetKind, Asset[]>;
}

export interface PromptComposerProps {
  prompt: string;
  onPromptChange: (next: string) => void;
  /** Cmd/Ctrl+Enter shortcut handler (parent owns the actual generate call). */
  onSubmit?: () => void;
  /** Asset chips appearing on a row above the textarea (legacy; populated in M6 via the AssetPicker). */
  assetSlots?: ReadonlyArray<PromptComposerAssetSlot>;
  /** Per-kind asset selection state — wired via `AssetPicker`. */
  selectedAssetIds?: PromptComposerSelectedAssetIds;
  /** Called when the user toggles an asset selection across any kind. */
  onAssetIdsChange?: (next: PromptComposerSelectedAssetIds) => void;
  /** Available assets per kind; consumed by AssetPicker. */
  assets?: PromptComposerAssetsBundle;
  /** Pulled from the resolved model — drives the AssetPicker's hint text. */
  maxReferencesHint?: number;
  /** Resolves a thumbnail URL for an asset. */
  thumbnailUrl?: (asset: Asset) => string | null | undefined;
  /** When the user clicks "Create new" inside an AssetPicker. */
  onRequestCreateAsset?: (kind: AssetKind) => void;
  placeholder?: string;
  /** When false, renders the legacy disabled "+ asset" stub. Defaults to true in M6. */
  enableAssetPicker?: boolean;
  /** When the parent wants to re-render with a fresh focus, bump this. */
  autoFocusKey?: number;
  className?: string;
  /** Tabular-figures character counter. Off by default — Studio doesn't need it. */
  showCharCount?: boolean;
  /** Optional trailing content rendered alongside the asset pickers. */
  pickerTrailing?: ReactNode;
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
  selectedAssetIds,
  onAssetIdsChange,
  assets,
  maxReferencesHint,
  thumbnailUrl,
  onRequestCreateAsset,
  placeholder = "Describe the image you want…",
  enableAssetPicker = false,
  autoFocusKey,
  className,
  showCharCount = false,
  pickerTrailing,
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

      {/* Asset slot row — M6: four AssetPickers wired via parent state. */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Legacy chip slots (still supported but no longer the default). */}
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
        {enableAssetPicker && selectedAssetIds && onAssetIdsChange && assets ? (
          <>
            {(["character", "object", "background", "style"] as AssetKind[]).map(
              (k) => (
                <AssetPicker
                  key={k}
                  kind={k}
                  assets={assets.byKind[k] ?? []}
                  selected={selectedAssetIds[k] ?? []}
                  onChange={(next) =>
                    onAssetIdsChange({ ...selectedAssetIds, [k]: next })
                  }
                  {...(thumbnailUrl ? { thumbnailUrl } : {})}
                  {...(maxReferencesHint !== undefined
                    ? { maxReferencesHint }
                    : {})}
                  {...(onRequestCreateAsset
                    ? { onRequestCreate: () => onRequestCreateAsset(k) }
                    : {})}
                />
              ),
            )}
            {pickerTrailing}
          </>
        ) : (
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
