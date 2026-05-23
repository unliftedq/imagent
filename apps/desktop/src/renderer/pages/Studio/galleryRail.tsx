import type { Asset, AssetKind, GalleryItem } from "@imagent/core";
import { Icons } from "@imagent/ui";
import type { DragEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useT } from "../../i18n/index.js";
import { api } from "../../lib/api.js";
import { useAssetsStore } from "../../state/useAssetsStore.js";
import { type StudioMode, useUIStore } from "../../state/useUIStore.js";
import { resolveAssetThumbnailUrl } from "../Assets";
import { CreateAssetDialog } from "../Assets/CreateAssetDialog.js";
import { ASSET_REFERENCE_KINDS } from "./types.js";
import { resolveGalleryUrl } from "./utils.js";

export const STUDIO_REFERENCE_MIME = "application/x-imagent-studio-reference";

export type StudioReferenceDragData =
  | { source: "asset"; id: string; kind: AssetKind }
  | { source: "gallery"; id: string; kind: StudioMode; relPath: string };

type RailTab = "gallery" | "assets";
type GalleryFilter = "all" | "newest";
type AssetFilter = "all" | AssetKind;

const ASSET_FILTERS: AssetFilter[] = ["all", ...ASSET_REFERENCE_KINDS];
const STUDIO_GALLERY_QUERY = {
  limit: 60,
  offset: 0,
} as const;

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
  const assetsByKind = useAssetsStore((state) => state.byKind);
  const refreshAssets = useAssetsStore((state) => state.refresh);
  const pushToast = useUIStore((state) => state.pushToast);
  const [galleryItems, setGalleryItems] = useState<GalleryItem[]>([]);
  const [tab, setTab] = useState<RailTab>("gallery");
  const [galleryFilter, setGalleryFilter] = useState<GalleryFilter>("all");
  const [assetFilter, setAssetFilter] = useState<AssetFilter>("all");
  const [assetDialogItem, setAssetDialogItem] = useState<GalleryItem | null>(null);
  const [assetDialogKind, setAssetDialogKind] = useState<AssetKind>("character");
  const t = useT();

  useEffect(() => {
    let cancelled = false;

    const refreshGalleryItems = async (): Promise<void> => {
      const result = await api["gallery.query"](STUDIO_GALLERY_QUERY);
      if (!cancelled) {
        setGalleryItems(result.items);
      }
    };

    void refreshGalleryItems();
    void refreshAssets();

    const offGalleryChanged = api.on("gallery.changed", () => {
      void refreshGalleryItems();
    });

    return () => {
      cancelled = true;
      offGalleryChanged();
    };
  }, [refreshAssets]);

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

  const openSaveAsAssetDialog = (item: GalleryItem): void => {
    if (item.kind === "video" && !item.thumbPath) {
      pushToast({
        title: t("gallery.toast.thumbnailUnavailable"),
        description: t("gallery.toast.thumbnailUnavailableDesc"),
        variant: "warning",
      });
      return;
    }
    setAssetDialogItem(item);
  };

  const assetDialogSource = useMemo(() => {
    if (!assetDialogItem) return null;
    const relPath =
      assetDialogItem.kind === "video"
        ? (assetDialogItem.thumbPath ?? assetDialogItem.relPath)
        : assetDialogItem.relPath;
    return {
      itemId: assetDialogItem.id,
      itemKind: assetDialogItem.kind,
      prompt: assetDialogItem.prompt,
      previewUrl: resolveGalleryUrl(relPath),
      relPath,
    };
  }, [assetDialogItem]);

  if (collapsed) {
    return (
      <aside
        aria-label={t("studio.libraryCollapsed")}
        className="flex h-full w-[44px] shrink-0 flex-col items-center border-l border-(--border) bg-(--bg) py-3"
      >
        <button
          type="button"
          aria-label={t("studio.expandLibrary")}
          title={t("studio.expandLibrary")}
          onClick={() => onCollapsedChange(false)}
          className="inline-flex size-8 items-center justify-center rounded-(--radius-sm) text-(--text-muted) hover:bg-(--surface) hover:text-(--text) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--focus-ring)"
        >
          <Icons.CaretRight weight="bold" className="size-4 rotate-180" />
        </button>
        <div className="mt-4 flex rotate-180 items-center gap-2 whitespace-nowrap text-[12px] font-semibold text-(--text-muted) [writing-mode:vertical-rl]">
          <Icons.SquaresFour weight="duotone" className="size-4" />
          {t("studio.library")}
        </div>
      </aside>
    );
  }

  return (
    <aside
      aria-label={t("studio.library")}
      className="flex h-full w-[var(--rail-gallery,300px)] shrink-0 flex-col min-h-0 overflow-hidden border-l border-(--border) bg-(--bg)"
    >
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <span className="text-[15px] font-semibold tracking-[-0.01em] text-(--text)">
          {t("studio.library")}
        </span>
        <button
          type="button"
          aria-label={t("studio.collapseLibrary")}
          title={t("studio.collapseLibrary")}
          onClick={() => onCollapsedChange(true)}
          className="inline-flex size-7 items-center justify-center rounded-(--radius-sm) text-(--text-muted) hover:bg-(--surface) hover:text-(--text) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--focus-ring)"
        >
          <Icons.CaretRight weight="bold" className="size-4" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-1 px-4 pb-3">
        <TabButton active={tab === "gallery"} onClick={() => setTab("gallery")}>
          {t("nav.gallery")}
        </TabButton>
        <TabButton active={tab === "assets"} onClick={() => setTab("assets")}>
          {t("nav.assets")}
        </TabButton>
      </div>

      {tab === "gallery" ? (
        <>
          <div className="flex items-center gap-1 px-4 pb-3">
            <FilterChip active={galleryFilter === "all"} onClick={() => setGalleryFilter("all")}>
              {t("gallery.all")}
            </FilterChip>
            <FilterChip
              active={galleryFilter === "newest"}
              onClick={() => setGalleryFilter("newest")}
            >
              {t("studio.filterNewest")}
            </FilterChip>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
            {filteredGallery.length === 0 ? (
              <EmptyRailState>{t("studio.emptyGalleryRail")}</EmptyRailState>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {filteredGallery.map((item) => (
                  <GalleryThumb key={item.id} item={item} onSaveAsAsset={openSaveAsAssetDialog} />
                ))}
              </div>
            )}
          </div>
          <RailFooterButton onClick={onViewAll}>{t("studio.viewAllGallery")}</RailFooterButton>
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
                {assetFilterLabel(filter, t)}
              </FilterChip>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
            {filteredAssets.length === 0 ? (
              <EmptyRailState>{t("studio.emptyAssetsRail")}</EmptyRailState>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {filteredAssets.map((asset) => (
                  <AssetThumb key={asset.id} asset={asset} />
                ))}
              </div>
            )}
          </div>
          <RailFooterButton onClick={onViewAssets}>{t("studio.openAssets")}</RailFooterButton>
        </>
      )}
      <CreateAssetDialog
        open={Boolean(assetDialogItem)}
        kind={assetDialogKind}
        onKindChange={setAssetDialogKind}
        onClose={() => setAssetDialogItem(null)}
        onCreated={(asset) => {
          setAssetDialogItem(null);
          setTab("assets");
          setAssetFilter(asset.kind);
          pushToast({
            title: t("gallery.toast.assetSaved"),
            description: t("gallery.toast.assetSavedDesc", { name: asset.name }),
            variant: "success",
          });
        }}
        gallerySource={assetDialogSource}
      />
    </aside>
  );
}

function GalleryThumb({
  item,
  onSaveAsAsset,
}: {
  item: GalleryItem;
  onSaveAsAsset: (item: GalleryItem) => void;
}) {
  const t = useT();
  const src =
    item.kind === "video"
      ? item.thumbPath
        ? resolveGalleryUrl(item.thumbPath)
        : ""
      : resolveGalleryUrl(item.relPath);

  return (
    <div
      draggable
      onDragStart={(event) =>
        setDragData(event, {
          source: "gallery",
          id: item.id,
          kind: item.kind,
          relPath: item.relPath,
        })
      }
      title={item.prompt}
      className="group relative aspect-square w-full overflow-hidden rounded-(--radius-sm) border border-(--border) bg-(--surface-sunken) transition-colors duration-(--motion-fast) hover:border-(--border-strong) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--focus-ring)"
    >
      <button
        type="button"
        onClick={() => {
          window.dispatchEvent(
            new CustomEvent<{ id: string; item?: GalleryItem }>("imagent:canvas-pin", {
              detail: { id: item.id, item },
            }),
          );
        }}
        aria-label={item.prompt || `Gallery item ${item.id}`}
        className="block h-full w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--focus-ring)"
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
      </button>
      <button
        type="button"
        aria-label={t("gallery.preview.saveAsAsset")}
        title={t("gallery.preview.saveAsAsset")}
        onClick={() => onSaveAsAsset(item)}
        className={
          "absolute left-1 top-1 inline-flex size-6 items-center justify-center " +
          "rounded-(--radius-sm) border border-white/20 bg-black/55 text-white opacity-0 " +
          "backdrop-blur transition-opacity duration-(--motion-fast) hover:bg-black/70 " +
          "focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--focus-ring) " +
          "group-hover:opacity-100"
        }
      >
        <Icons.StackPlus weight="bold" className="size-3.5" />
      </button>
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
    </div>
  );
}

function AssetThumb({ asset }: { asset: Asset }) {
  const t = useT();
  const src = resolveAssetThumbnailUrl(asset);

  return (
    <button
      type="button"
      draggable
      onDragStart={(event) =>
        setDragData(event, { source: "asset", id: asset.id, kind: asset.kind })
      }
      title={asset.name}
      aria-label={t("studio.assetAriaLabel", {
        kind: assetKindLabel(asset.kind, t),
        name: asset.name,
      })}
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
          {assetKindLabel(asset.kind, t)}
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

type TFn = ReturnType<typeof useT>;

function assetFilterLabel(filter: AssetFilter, t: TFn): string {
  return filter === "all" ? t("gallery.all") : assetKindLabel(filter, t);
}

function assetKindLabel(kind: AssetKind, t: TFn): string {
  switch (kind) {
    case "character":
      return t("assets.kind.character");
    case "object":
      return t("assets.kind.object");
    case "background":
      return t("assets.kind.background");
    case "style":
      return t("assets.kind.style");
  }
}

function isAssetKind(value: unknown): value is AssetKind {
  return value === "character" || value === "object" || value === "background" || value === "style";
}
