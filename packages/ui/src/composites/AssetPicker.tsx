import type { Asset, AssetKind } from "@imagine/core";
import { Plus } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { cn } from "../lib/cn.js";
import { Button } from "../primitives/Button.js";
import { Input } from "../primitives/Input.js";
import { Popover } from "../primitives/Popover.js";
import { AssetCard } from "./AssetCard.js";

const KIND_LABEL: Record<AssetKind, string> = {
  character: "Character",
  object: "Object",
  background: "Background",
  style: "Style",
};

export interface AssetPickerProps {
  kind: AssetKind;
  assets: Asset[];
  selected: string[];
  onChange: (next: string[]) => void;
  /** Resolves a thumbnail URL for an asset (renderer-side lookup). */
  thumbnailUrl?: (asset: Asset) => string | null | undefined;
  /** When set, surface a soft hint when selection > hint. */
  maxReferencesHint?: number;
  /**
   * Triggered when the user clicks "Create new" inside the popover. The
   * parent decides whether to navigate to the Assets page or open a dialog.
   */
  onRequestCreate?: () => void;
  className?: string;
}

/**
 * AssetPicker — chip trigger that opens a popover with a search input + grid
 * of `AssetCard`s. Multi-select; click a card to toggle. Footer carries
 * Apply / Clear / Create new.
 *
 * Per DESIGN.md: pill chip trigger, no shadow, accent ring on selected
 * cards, hairline border around the popover.
 */
export function AssetPicker({
  kind,
  assets,
  selected,
  onChange,
  thumbnailUrl,
  maxReferencesHint,
  onRequestCreate,
  className,
}: AssetPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selectedAssets = useMemo(
    () => assets.filter((a) => selected.includes(a.id)),
    [assets, selected],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return assets;
    return assets.filter((a) => {
      if (a.name.toLowerCase().includes(q)) return true;
      if (a.description?.toLowerCase().includes(q)) return true;
      if (a.promptSnippet?.toLowerCase().includes(q)) return true;
      return false;
    });
  }, [assets, search]);

  const overHint =
    typeof maxReferencesHint === "number" && selected.length > maxReferencesHint;

  const toggle = (id: string): void => {
    if (selected.includes(id)) {
      onChange(selected.filter((x) => x !== id));
    } else {
      onChange([...selected, id]);
    }
  };

  const clear = (): void => {
    onChange([]);
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-2 rounded-(--radius-pill) " +
              "border border-(--border) bg-(--bg) " +
              "px-3 py-1.5 text-(length:--text-caption) text-(--text) " +
              "transition-colors duration-(--duration-fast) " +
              "hover:border-(--text) " +
              "data-[state=open]:border-(--text)",
            selected.length > 0 ? "border-(--text)" : "",
            className,
          )}
        >
          {selected.length > 0 ? (
            <span className="flex -space-x-2">
              {selectedAssets.slice(0, 3).map((a) => {
                const url = thumbnailUrl?.(a);
                return (
                  <span
                    key={a.id}
                    className={
                      "inline-flex size-5 items-center justify-center overflow-hidden " +
                      "rounded-full border border-(--bg) bg-(--surface) " +
                      "text-[10px] font-semibold text-(--text)"
                    }
                    aria-hidden
                  >
                    {url ? (
                      // biome-ignore lint/a11y/useAltText: avatar fallback
                      <img src={url} alt="" className="block h-full w-full object-cover" />
                    ) : (
                      a.name.charAt(0).toUpperCase()
                    )}
                  </span>
                );
              })}
            </span>
          ) : (
            <Plus weight="bold" className="size-3.5" />
          )}
          <span>
            {selected.length > 0
              ? `${KIND_LABEL[kind]}${selected.length > 1 ? ` ×${selected.length}` : ""}`
              : KIND_LABEL[kind]}
          </span>
        </button>
      </Popover.Trigger>

      <Popover.Content className="w-[360px]">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-(length:--text-caption-uppercase) font-semibold uppercase tracking-[1.5px] text-(--text-muted)">
              Pick {KIND_LABEL[kind]}
            </span>
            {onRequestCreate ? (
              <button
                type="button"
                className="text-(length:--text-caption) text-(--text) underline underline-offset-2"
                onClick={() => {
                  setOpen(false);
                  onRequestCreate();
                }}
              >
                Create new
              </button>
            ) : null}
          </div>

          <Input
            placeholder={`Search ${KIND_LABEL[kind].toLowerCase()}…`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />

          {filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-(--radius-md) border border-dashed border-(--border) bg-(--surface) px-4 py-6 text-center">
              <span className="text-(length:--text-caption) text-(--text-muted)">
                {assets.length === 0
                  ? `No ${KIND_LABEL[kind].toLowerCase()} assets yet.`
                  : "No matches."}
              </span>
              {onRequestCreate && assets.length === 0 ? (
                <button
                  type="button"
                  className="text-(length:--text-caption) text-(--text) underline underline-offset-2"
                  onClick={() => {
                    setOpen(false);
                    onRequestCreate();
                  }}
                >
                  Create your first {KIND_LABEL[kind].toLowerCase()}
                </button>
              ) : null}
            </div>
          ) : (
            <div className="grid max-h-[280px] grid-cols-3 gap-2 overflow-y-auto">
              {filtered.map((a) => (
                <AssetCard
                  key={a.id}
                  asset={a}
                  thumbnailUrl={thumbnailUrl?.(a) ?? null}
                  selected={selected.includes(a.id)}
                  size="sm"
                  onClick={() => toggle(a.id)}
                />
              ))}
            </div>
          )}

          {overHint ? (
            <p className="text-(length:--text-caption) text-(--warning)">
              Model accepts up to {maxReferencesHint} reference
              {maxReferencesHint === 1 ? "" : "s"} — extras will be ignored.
            </p>
          ) : null}

          <div className="flex items-center justify-between gap-2 border-t border-(--border-faint) pt-2">
            <Button variant="ghost" size="sm" onClick={clear} disabled={selected.length === 0}>
              Clear
            </Button>
            <Button size="sm" onClick={() => setOpen(false)}>
              Done
            </Button>
          </div>
        </div>
      </Popover.Content>
    </Popover.Root>
  );
}
