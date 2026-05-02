import type { Asset, AssetKind, GalleryItem } from "@imagine/core";
import { Icons } from "@imagine/ui";
import type { DragEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useAssetsStore } from "../../state/useAssetsStore.js";
import { useGalleryStore } from "../../state/useGalleryStore.js";
import type { StudioMode } from "../../state/useUIStore.js";
import { resolveAssetThumbnailUrl } from "../Assets";
import { ASSET_REFERENCE_KINDS } from "./types.js";
import { resolveGalleryUrl } from "./utils.js";

export const STUDIO_REFERENCE_MIME = "application/x-imagine-studio-reference";

export type StudioReferenceDragData =
  | { source: "asset"; id: string; kind: AssetKind }
  | { source: "gallery"; id: string; kind: StudioMode; relPath: string };

type RailTab = "gallery" | "assets";
type GalleryFilter = "all" | "newest";
type AssetFilter = "all" | AssetKind;

const ASSET_FILTERS: AssetFilter[] = ["all", ...ASSET_REFERENCE_KINDS];

export function readStudioReferenceDragData(
  dataTransfer: DataTransfer,
): StudioReferenceDragData | null {
  const raw = dataTransfer.getData(STUDIO_REFERENCE_MIME);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed.source === "asset" && parsed.id && isAssetKind(parsed.kind)) {
      return { source: "asset", id: String(parsed.id), kind: parsed.kind };
    }
    if (
      parsed.source === "gallery" &&
      parsed.id &&
      (parsed.kind === "image" || parsed.kind === "video") &&
      typeof parsed.relPath === "string" &&
      parsed.relPath.length > 0
    ) {
      return {
        source: "gallery",
        id: String(parsed.id),
        kind: parsed.kind,
        relPath: parsed.relPath,
      };
    }
  } catch {
    return null;
  }
  return null;
}

export function StudioGalleryRail({
  mode,
  collapsed,
  onCollapsedChange,
  onViewAll,
  onViewAssets,
}: {
  mode: StudioMode;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  onViewAll: () => void;
  onViewAssets: () => void;
}) {
  const galleryItems = useGalleryStore((state) => state.items);
  const refreshGallery = useGalleryStore((state) => state.refresh);
  const assetsByKind = useAssetsStore((state) => state.byKind);
  const refreshAssets = useAssetsStore((state) => state.refresh);
  const [tab, setTab] = useState<RailTab>("gallery");
  const [galleryFilter, setGalleryFilter] = useState<GalleryFilter>("all");
  const [assetFilter, setAssetFilter] = useState<AssetFilter>("all");

  useEffect(() => {
    void refreshGallery();
    void refreshAssets();
  }, [refreshGallery, refreshAssets]);

  const filteredGallery = useMemo(() => {
    const ofMode = galleryItems.filter((item) => item.kind === mode);
    if (galleryFilter === "newest") return ofMode.slice(0, 12);
    return ofMode.slice(0, 30);
  }, [galleryItems, mode, galleryFilter]);

  const filteredAssets = useMemo(() => {
    if (assetFilter === "all") {
      return ASSET_REFERENCE_KINDS.flatMap((kind) => assetsByKind[kind] ?? []);
    }
    return assetsByKind[assetFilter] ?? [];
  }, [assetsByKind, assetFilter]);

  if (collapsed) {
    return (
      <aside
        aria-label="Studio library collapsed"
        className="flex h-full w-[44px] shrink-0 flex-col items-center border-l border-(--border) bg-(--bg) py-3"
      >
        <button
          type="button"
          aria-label="Expand library"
          title="Expand library"
          onClick={() => onCollapsedChange(false)}
          className="inline-flex size-8 items-center justify-center rounded-(--radius-sm) text-(--text-muted) hover:bg-(--surface) hover:text-(--text) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--focus-ring)"
        >
          <Icons.CaretRight weight="bold" className="size-4 rotate-180" />
        </button>
        <div className="mt-4 flex -rotate-90 items-center gap-2 whitespace-nowrap text-[12px] font-semibold text-(--text-muted)">
          <Icons.SquaresFour weight="duotone" className="size-4" />
          Library
        </div>
      </aside>
    );
  }

  return (
    <aside
      aria-label="Studio library"
      className="flex h-full w-[var(--rail-gallery,300px)] shrink-0 flex-col min-h-0 overflow-hidden border-l border-(--border) bg-(--bg)"
    >
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <span className="text-[15px] font-semibold tracking-[-0.01em] text-(--text)">Library</span>
        <button
          type="button"
          aria-label="Collapse library"
          title="Collapse library"
          onClick={() => onCollapsedChange(true)}
          className="inline-flex size-7 items-center justify-center rounded-(--radius-sm) text-(--text-muted) hover:bg-(--surface) hover:text-(--text) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--focus-ring)"
        >
          <Icons.CaretRight weight="bold" className="size-4" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-1 px-4 pb-3">
        <TabButton active={tab === "gallery"} onClick={() => setTab("gallery")}>
          Gallery
        </TabButton>
        <TabButton active={tab === "assets"} onClick={() => setTab("assets")}>
          Assets
        </TabButton>
      </div>

      {tab === "gallery" ? (
        <>
          <div className="flex items-center gap-1 px-4 pb-3">
            <FilterChip active={galleryFilter === "all"} onClick={() => setGalleryFilter("all")}>
              All
            </FilterChip>
            <FilterChip
              active={galleryFilter === "newest"}
              onClick={() => setGalleryFilter("newest")}
            >
              Newest
            </FilterChip>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
            {filteredGallery.length === 0 ? (
              <EmptyRailState>No items yet — generate something to see it here.</EmptyRailState>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {filteredGallery.map((item) => (
                  <GalleryThumb key={item.id} item={item} />
                ))}
              </div>
            )}
          </div>
          <RailFooterButton onClick={onViewAll}>View all gallery</RailFooterButton>
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-1 px-4 pb-3">
            {ASSET_FILTERS.map((filter) => (
              <FilterChip
                key={filter}
                active={assetFilter === filter}
                onClick={() => setAssetFilter(filter)}
              >
                {assetFilterLabel(filter)}
              </FilterChip>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
            {filteredAssets.length === 0 ? (
              <EmptyRailState>No assets yet — create one to reuse it here.</EmptyRailState>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {filteredAssets.map((asset) => (
                  <AssetThumb key={asset.id} asset={asset} />
                ))}
              </div>
            )}
          </div>
          <RailFooterButton onClick={onViewAssets}>Open assets</RailFooterButton>
        </>
      )}
    </aside>
  );
}

function GalleryThumb({ item }: { item: GalleryItem }) {
  const src =
    item.kind === "video"
      ? item.thumbPath
        ? resolveGalleryUrl(item.thumbPath)
        : ""
      : resolveGalleryUrl(item.relPath);

  return (
    <button
      type="button"
      draggable
      onDragStart={(event) =>
        setDragData(event, {
          source: "gallery",
          id: item.id,
          kind: item.kind,
          relPath: item.relPath,
        })
      }
      onClick={() => {
        window.dispatchEvent(
          new CustomEvent<{ id: string }>("imagine:canvas-pin", {
            detail: { id: item.id },
          }),
        );
      }}
      title={item.prompt}
      aria-label={item.prompt || `Gallery item ${item.id}`}
      className="group relative aspect-square w-full overflow-hidden rounded-(--radius-sm) border border-(--border) bg-(--surface-sunken) transition-colors duration-(--motion-fast) hover:border-(--border-strong) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--focus-ring)"
    >
      {src ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          draggable={false}
          className="block h-full w-full object-cover"
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-(--text-muted)">
          <Icons.FilmReel weight="duotone" className="size-8" />
        </span>
      )}
      {item.kind === "video" ? (
        <Badge className="bottom-1 left-1">
          <Icons.Play weight="fill" className="size-2.5" />
        </Badge>
      ) : null}
      {item.favorited ? (
        <Badge className="top-1 right-1">
          <Icons.Star weight="fill" className="size-2.5" />
        </Badge>
      ) : null}
    </button>
  );
}

function AssetThumb({ asset }: { asset: Asset }) {
  const src = resolveAssetThumbnailUrl(asset);

  return (
    <button
      type="button"
      draggable
      onDragStart={(event) =>
        setDragData(event, { source: "asset", id: asset.id, kind: asset.kind })
      }
      title={asset.name}
      aria-label={`${assetKindLabel(asset.kind)} asset ${asset.name}`}
      className="group flex min-w-0 flex-col overflow-hidden rounded-(--radius-sm) border border-(--border) bg-(--surface-sunken) text-left transition-colors duration-(--motion-fast) hover:border-(--border-strong) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--focus-ring)"
    >
      <span className="relative aspect-square w-full bg-(--surface)">
        {src ? (
          <img
            src={src}
            alt=""
            loading="lazy"
            draggable={false}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-[18px] font-semibold text-(--text-muted)">
            {asset.name.charAt(0).toUpperCase()}
          </span>
        )}
        <span className="absolute bottom-1 left-1 rounded-(--radius-pill) bg-black/55 px-1.5 py-0.5 text-[9px] font-semibold text-white">
          {assetKindLabel(asset.kind)}
        </span>
      </span>
      <span className="truncate px-2 py-1.5 text-[11px] text-(--text)">{asset.name}</span>
    </button>
  );
}

function setDragData(event: DragEvent<HTMLElement>, data: StudioReferenceDragData): void {
  event.dataTransfer.effectAllowed = "copy";
  event.dataTransfer.setData(STUDIO_REFERENCE_MIME, JSON.stringify(data));
  event.dataTransfer.setData("text/plain", data.source === "asset" ? data.id : data.relPath);
}

function TabButton({
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
      className={
        "inline-flex h-8 items-center justify-center rounded-(--radius-sm) px-3 text-[12px] font-semibold transition-colors duration-(--motion-fast) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--focus-ring) " +
        (active
          ? "bg-(--surface-raised) text-(--text) shadow-[0_0_0_1px_var(--border)]"
          : "text-(--text-muted) hover:bg-(--surface) hover:text-(--text)")
      }
    >
      {children}
    </button>
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
      className={
        "inline-flex h-6 items-center rounded-(--radius-xs) px-2 text-[12px] transition-colors duration-(--motion-fast) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--focus-ring) " +
        (active
          ? "bg-(--accent-soft) font-semibold text-(--accent)"
          : "bg-transparent text-(--text-muted) hover:text-(--text)")
      }
    >
      {children}
    </button>
  );
}

function RailFooterButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mx-3 mb-3 inline-flex h-8 items-center justify-center rounded-(--radius-sm) border border-(--border) bg-transparent text-[13px] font-normal text-(--text-muted) transition-colors duration-(--motion-fast) hover:border-(--border-strong) hover:bg-(--surface-sunken) hover:text-(--text) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--focus-ring)"
    >
      {children}
    </button>
  );
}

function EmptyRailState({ children }: { children: ReactNode }) {
  return <div className="px-2 py-6 text-center text-[12px] text-(--text-muted)">{children}</div>;
}

function Badge({ className, children }: { className: string; children: ReactNode }) {
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute inline-flex size-4 items-center justify-center rounded-(--radius-pill) bg-black/55 text-white ${className}`}
    >
      {children}
    </span>
  );
}

function assetFilterLabel(filter: AssetFilter): string {
  return filter === "all" ? "All" : assetKindLabel(filter);
}

function assetKindLabel(kind: AssetKind): string {
  switch (kind) {
    case "character":
      return "Character";
    case "object":
      return "Object";
    case "background":
      return "Background";
    case "style":
      return "Style";
  }
}

function isAssetKind(value: unknown): value is AssetKind {
  return value === "character" || value === "object" || value === "background" || value === "style";
}
