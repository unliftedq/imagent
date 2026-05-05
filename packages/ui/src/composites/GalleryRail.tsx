import { type ReactNode, useState } from "react";
import { cn } from "../lib/cn.js";

export type GalleryRailFilter = "all" | "newest";

export interface GalleryRailItem {
  id: string;
  /** file:// URL or relative path the renderer can load. */
  src: string;
  /** Hover tooltip — usually the prompt or its excerpt. */
  caption?: string;
  /** Marks an item as a video (renders a play overlay). */
  kind?: "image" | "video";
  favorited?: boolean;
}

export interface GalleryRailProps {
  items: ReadonlyArray<GalleryRailItem>;
  selectedId?: string | null;
  onItemClick?: (id: string) => void;
  /** Footer "View all" handler — typically `setRoute('gallery')`. */
  onViewAll?: () => void;
  /** Optional filter chip control. Uncontrolled by default. */
  filter?: GalleryRailFilter;
  onFilterChange?: (filter: GalleryRailFilter) => void;
  /** Slot for a custom empty state or above-list content. */
  emptyState?: ReactNode;
  className?: string;
}

/**
 * GalleryRail right-rail variant for the Studio page.
 * 240px right column showing a vertical 2-up grid of recent gallery
 * thumbnails with two filter pill chips and a "View all" footer button.
 *
 * Items are 104×104px square crops (objectFit cover). Hover surfaces a
 * `--border-strong` outline; selected gets a 2px `--accent` ring.
 *
 * Filtering by image-vs-video kind is the parent's responsibility — this
 * component doesn't know about gallery filters beyond the All/Newest chips.
 */
export function GalleryRail({
  items,
  selectedId,
  onItemClick,
  onViewAll,
  filter,
  onFilterChange,
  emptyState,
  className,
}: GalleryRailProps) {
  const [internalFilter, setInternalFilter] = useState<GalleryRailFilter>(
    "all",
  );
  const activeFilter = filter ?? internalFilter;
  const setFilter = (f: GalleryRailFilter): void => {
    if (onFilterChange) onFilterChange(f);
    else setInternalFilter(f);
  };

  return (
    <aside
      aria-label="Recent generations"
      className={cn(
        "flex h-full w-[var(--rail-gallery,240px)] shrink-0 flex-col " +
          "min-h-0 overflow-hidden border-l border-(--border) bg-(--bg)",
        className,
      )}
    >
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <span className="text-[15px] font-semibold tracking-[-0.01em] text-(--text)">
          Gallery
        </span>
      </div>

      <div className="flex items-center gap-1 px-4 pb-3">
        <FilterChip
          active={activeFilter === "all"}
          onClick={() => setFilter("all")}
        >
          All
        </FilterChip>
        <FilterChip
          active={activeFilter === "newest"}
          onClick={() => setFilter("newest")}
        >
          Newest
        </FilterChip>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {items.length === 0 ? (
          emptyState ?? (
            <div className="px-2 py-6 text-center text-[12px] text-(--text-muted)">
              No items yet — generate something to see it here.
            </div>
          )
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {items.map((it) => (
              <RailThumb
                key={it.id}
                item={it}
                selected={it.id === selectedId}
                onClick={() => onItemClick?.(it.id)}
              />
            ))}
          </div>
        )}
      </div>

      {onViewAll ? (
        <button
          type="button"
          onClick={onViewAll}
          className={
            "mx-3 mb-3 inline-flex h-8 items-center justify-center rounded-(--radius-sm) " +
            "border border-(--border) bg-transparent text-[13px] font-normal " +
            "text-(--text-muted) transition-colors duration-(--motion-fast) " +
            "ease-(--ease-out) hover:border-(--border-strong) hover:bg-(--surface-sunken) hover:text-(--text) " +
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--focus-ring)"
          }
        >
          View all
        </button>
      ) : null}
    </aside>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-state={active ? "active" : "inactive"}
      className={cn(
        "inline-flex h-6 items-center rounded-(--radius-xs) px-2 text-[12px] " +
          "transition-colors duration-(--motion-fast) ease-(--ease-out) " +
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--focus-ring)",
        active
          ? "bg-(--accent-soft) text-(--accent) font-semibold"
          : "bg-transparent text-(--text-muted) hover:text-(--text)",
      )}
    >
      {children}
    </button>
  );
}

function RailThumb({
  item,
  selected,
  onClick,
}: {
  item: GalleryRailItem;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={item.caption ?? ""}
      aria-label={item.caption ?? `Gallery item ${item.id}`}
      className={cn(
        "group relative aspect-square w-full overflow-hidden rounded-(--radius-sm) " +
          "border bg-(--surface-sunken) transition-colors duration-(--motion-fast) " +
          "ease-(--ease-out) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--focus-ring)",
        selected
          ? "border-(--border-strong) outline outline-2 outline-(--accent) outline-offset-0"
          : "border-(--border) hover:border-(--border-strong)",
      )}
    >
      {item.src ? (
        <img
          src={item.src}
          alt=""
          loading="lazy"
          draggable={false}
          className="block h-full w-full object-cover"
        />
      ) : (
        <span aria-hidden="true" className="block h-full w-full" />
      )}
      {item.kind === "video" ? (
        <span
          aria-hidden="true"
          className={
            "pointer-events-none absolute bottom-1 left-1 inline-flex size-4 " +
            "items-center justify-center rounded-(--radius-pill) bg-black/55 text-white"
          }
        >
          <PlayGlyph />
        </span>
      ) : null}
      {item.favorited ? (
        <span
          aria-hidden="true"
          className={
            "pointer-events-none absolute top-1 right-1 inline-flex size-4 " +
            "items-center justify-center rounded-(--radius-pill) bg-black/45 text-white"
          }
        >
          <HeartGlyph />
        </span>
      ) : null}
    </button>
  );
}

function PlayGlyph() {
  return (
    <svg
      viewBox="0 0 8 8"
      width="8"
      height="8"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M2 1.2v5.6c0 .25.27.4.48.27l4.4-2.8a.32.32 0 0 0 0-.54l-4.4-2.8A.32.32 0 0 0 2 1.2z" />
    </svg>
  );
}

function HeartGlyph() {
  return (
    <svg
      viewBox="0 0 8 8"
      width="8"
      height="8"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M4 7s-3-1.6-3-3.6A1.6 1.6 0 0 1 4 2.6a1.6 1.6 0 0 1 3 .8C7 5.4 4 7 4 7z" />
    </svg>
  );
}
