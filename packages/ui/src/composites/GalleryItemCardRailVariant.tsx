import { Heart, Play, Waveform } from "@phosphor-icons/react";

import { cn } from "../lib/cn.js";
import { formatVideoDuration } from "./GalleryItemCard.shared.js";
import type { GalleryItemCardProps } from "./GalleryItemCard.types.js";

/**
 * Compact rail variant — square thumb, no kebab, no boards menu, no
 * right-click. Click loads the item into the parent's canvas; double-click
 * still routes through `onOpen`.
 */
export function RailVariant({
  id,
  kind,
  src,
  caption,
  durationMs,
  favorited,
  selected,
  onSelect,
  onOpen,
  className,
}: GalleryItemCardProps) {
  const hasSrc = typeof src === "string" && src.length > 0;
  return (
    <button
      type="button"
      onClick={onSelect}
      onDoubleClick={onOpen}
      title={caption ?? ""}
      aria-label={caption ?? `Gallery item ${id}`}
      className={cn(
        "group relative block aspect-square w-full overflow-hidden rounded-(--radius-sm) " +
          "border bg-(--surface-sunken) transition-colors duration-(--motion-fast) " +
          "ease-(--ease-out) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--focus-ring)",
        selected
          ? "border-(--border-strong) outline outline-2 outline-(--accent) outline-offset-0"
          : "border-(--border) hover:border-(--border-strong)",
        className,
      )}
    >
      {kind === "speech" ? (
        <span className="flex h-full w-full flex-col items-center justify-center gap-2 bg-(--surface) p-2 text-(--text-muted)">
          <Waveform weight="duotone" className="size-7" />
          {typeof durationMs === "number" && durationMs > 0 ? (
            <span className="rounded-(--radius-pill) bg-black/55 px-1.5 py-0.5 text-(length:--text-caption) text-white [font-variant-numeric:tabular-nums]">
              {formatVideoDuration(durationMs)}
            </span>
          ) : null}
        </span>
      ) : hasSrc ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          draggable={false}
          className="block h-full w-full object-cover"
        />
      ) : (
        <span aria-hidden="true" className="block h-full w-full" />
      )}
      {kind === "video" || kind === "speech" ? (
        <span
          aria-hidden="true"
          className={
            "pointer-events-none absolute bottom-1 left-1 inline-flex size-4 " +
            "items-center justify-center rounded-(--radius-pill) bg-black/55 text-white"
          }
        >
          <Play weight="fill" className="size-2.5" />
        </span>
      ) : null}
      {favorited ? (
        <span
          aria-hidden="true"
          className={
            "pointer-events-none absolute right-1 top-1 inline-flex size-4 " +
            "items-center justify-center rounded-(--radius-pill) bg-black/45 text-white"
          }
        >
          <Heart weight="fill" className="size-2.5" />
        </span>
      ) : null}
    </button>
  );
}
