import type { Asset, AssetKind } from "@imagine/core";
import { cn } from "../lib/cn.js";

export interface AssetCardProps {
  asset: Asset;
  /** Absolute file URL for the thumbnail (renderer resolves dataDir). */
  thumbnailUrl?: string | null;
  /** "X used in N items" — supplied by the page so the card stays presentational. */
  usageCount?: number;
  selected?: boolean;
  /** Compact variant used inside the AssetPicker grid. */
  size?: "sm" | "md";
  onClick?: () => void;
  className?: string;
}

const kindColor: Record<AssetKind, string> = {
  character: "bg-(--accent-soft) text-(--text)",
  object: "bg-(--accent-soft) text-(--text)",
  background: "bg-(--accent-soft) text-(--text)",
  style: "bg-(--accent-soft) text-(--text)",
};

/**
 * Asset card per design.md §10 — square thumbnail (or letter fallback), name,
 * reference status, optional "used in" counter. Selection ring uses the accent
 * outline + 1px border for the picked state.
 */
export function AssetCard({
  asset,
  thumbnailUrl,
  usageCount,
  selected = false,
  size = "md",
  onClick,
  className,
}: AssetCardProps) {
  const hasReference = (asset.files ?? []).some((f) => f.role === "reference");
  const tile = size === "sm" ? "size-20" : "aspect-square w-full";
  return (
    <button
      type="button"
      onClick={onClick}
      title={asset.name}
      className={cn(
        "group flex flex-col items-stretch gap-2 text-left",
        "rounded-(--radius-md) border bg-(--bg) p-2 " +
          "transition-colors duration-(--duration-fast) " +
          "hover:border-(--text)",
        selected
          ? "border-(--text) outline outline-2 outline-(--accent) outline-offset-2"
          : "border-(--border)",
        className,
      )}
    >
      <div className={cn("overflow-hidden rounded-(--radius-sm) bg-(--surface)", tile)}>
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={asset.name}
            loading="lazy"
            className="block h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-(--text-faint)">
            <span className="text-(length:--text-title-md) font-semibold">
              {asset.name.charAt(0).toUpperCase()}
            </span>
          </div>
        )}
      </div>
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-(length:--text-body-sm) font-semibold text-(--text)">
            {asset.name}
          </span>
          <span
            className={cn(
              "shrink-0 rounded-(--radius-pill) px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[1px]",
              kindColor[asset.kind],
            )}
          >
            {asset.kind}
          </span>
        </div>
        <div className="flex items-center gap-2 text-(length:--text-caption) text-(--text-muted)">
          <span>{hasReference ? "Reference image" : "Prompt only"}</span>
          {typeof usageCount === "number" && usageCount > 0 ? (
            <>
              <span aria-hidden>·</span>
              <span>used in {usageCount}</span>
            </>
          ) : null}
        </div>
      </div>
    </button>
  );
}
