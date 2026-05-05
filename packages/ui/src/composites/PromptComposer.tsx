import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import type { Asset, AssetKind } from "@imagent/core";
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
  /** Optional negative-prompt text + setter. When omitted, the negative
   * textarea is hidden. */
  negativePrompt?: string;
  onNegativePromptChange?: (next: string) => void;
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
  negativePlaceholder?: string;
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
 * PromptComposer — DESIGN.md §10.2 (rail-fitted).
 *
 * Lives inside the 280px params rail; vertically stacked, no internal
 * max-width. Sections are separated by hairline dividers and labelled with
 * sentence-case `body --text-muted`. Two textareas (Prompt, Negative
 * Prompt) auto-grow between 5 and 10 visible lines, mono.
 */
export function PromptComposer({
  prompt,
  onPromptChange,
  onSubmit,
  negativePrompt,
  onNegativePromptChange,
  assetSlots = [],
  selectedAssetIds,
  onAssetIdsChange,
  assets,
  maxReferencesHint,
  thumbnailUrl,
  onRequestCreateAsset,
  placeholder = "Describe what you want to see…",
  negativePlaceholder = "What to avoid…",
  enableAssetPicker = false,
  autoFocusKey,
  className,
  showCharCount = false,
  pickerTrailing,
}: PromptComposerProps) {
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const negRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow up to ~10 lines (DESIGN.md §10.2: default 5, max 10).
  useEffect(() => {
    autosize(promptRef.current, 5, 10);
  }, [prompt]);
  useEffect(() => {
    autosize(negRef.current, 2, 4);
  }, [negativePrompt]);

  useEffect(() => {
    if (autoFocusKey === undefined) return;
    promptRef.current?.focus();
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
    <div className={cn("flex w-full flex-col gap-3", className)}>
      {/* Prompt section */}
      <div className="flex flex-col gap-1.5">
        <label className="text-[12px] text-(--text-muted)" htmlFor="composer-prompt">
          Prompt
        </label>
        <div className="relative">
          <textarea
            id="composer-prompt"
            ref={promptRef}
            value={prompt}
            onChange={(e) => onPromptChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            rows={5}
            className={cn(
              "block w-full resize-none rounded-(--radius-sm) border border-(--border) " +
                "bg-(--surface-raised) px-3 py-2 text-[12px] leading-[18px] " +
                "font-(family-name:--font-mono) text-(--text) " +
                "placeholder:text-(--text-faint) " +
                "transition-colors duration-(--motion-fast) ease-(--ease-out) " +
                "focus-visible:outline-none focus:border-(--accent)",
            )}
          />
          {showCharCount ? (
            <span
              className={
                "pointer-events-none absolute bottom-1.5 right-2 select-none " +
                "text-[11px] text-(--text-faint) [font-variant-numeric:tabular-nums]"
              }
            >
              {charCount.toLocaleString()}
            </span>
          ) : null}
        </div>
      </div>

      {/* Asset chip row — sits between Prompt and Negative Prompt per DESIGN §10.2 */}
      {(enableAssetPicker && selectedAssetIds && onAssetIdsChange && assets) ||
      assetSlots.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {assetSlots.map((slot, idx) => (
            <span
              key={`${slot.label}-${idx}`}
              className={
                "inline-flex items-center gap-1 rounded-(--radius-xs) " +
                "border border-(--border) bg-(--surface-raised) text-(--text) " +
                "px-2 py-0.5 text-[11px]"
              }
            >
              <span className="font-semibold">{slot.label}</span>
              <span className="truncate max-w-[140px]">{slot.value}</span>
              {slot.onRemove ? (
                <button
                  type="button"
                  onClick={slot.onRemove}
                  className="text-(--text-muted) hover:text-(--text)"
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
          ) : null}
        </div>
      ) : (
        <Tooltip content="Asset slots arrive in M6.">
          <span
            aria-disabled="true"
            className={
              "inline-flex items-center gap-1.5 rounded-(--radius-xs) " +
              "border border-dashed border-(--border) " +
              "px-2 py-0.5 text-[11px] text-(--text-faint) " +
              "select-none cursor-not-allowed"
            }
          >
            <Plus weight="bold" className="size-3" />
            asset
          </span>
        </Tooltip>
      )}

      {/* Negative prompt — only when the parent provides a setter. */}
      {onNegativePromptChange ? (
        <div className="flex flex-col gap-1.5">
          <label className="text-[12px] text-(--text-muted)" htmlFor="composer-neg">
            Negative
          </label>
          <textarea
            id="composer-neg"
            ref={negRef}
            value={negativePrompt ?? ""}
            onChange={(e) => onNegativePromptChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={negativePlaceholder}
            rows={2}
            className={cn(
              "block w-full resize-none rounded-(--radius-sm) border border-(--border) " +
                "bg-(--surface-raised) px-3 py-2 text-[12px] leading-[18px] " +
                "font-(family-name:--font-mono) text-(--text) " +
                "placeholder:text-(--text-faint) " +
                "transition-colors duration-(--motion-fast) ease-(--ease-out) " +
                "focus-visible:outline-none focus:border-(--accent)",
            )}
          />
        </div>
      ) : null}
    </div>
  );
}

function autosize(el: HTMLTextAreaElement | null, min: number, max: number): void {
  if (!el) return;
  el.style.height = "auto";
  // 18px line height matches the body-sm leading we set on the textarea.
  const lineHeight = 18;
  const padY = 8 * 2; // py-2 on top + bottom
  const desired = Math.max(
    min * lineHeight + padY,
    Math.min(el.scrollHeight, max * lineHeight + padY),
  );
  el.style.height = `${desired}px`;
}
