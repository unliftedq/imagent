import type { Asset, AssetKind, GalleryItem } from "@imagent/core";
import { Button, Icons, Popover } from "@imagent/ui";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useT } from "../../i18n/index.js";
import { api } from "../../lib/api.js";
import { ASSET_REFERENCE_KINDS, IMAGE_FILE_FILTERS } from "./types.js";
import { fileName, resolveGalleryAbsolutePath, resolveGalleryUrl, uniqueStrings } from "./utils.js";

type ActiveView = { type: "kind"; kind: AssetKind } | { type: "gallery" };

export function ReferencePicker({
  assetIds,
  assetsByKind,
  references,
  onAssetIdsChange,
  onReferencesChange,
  thumbnailUrl,
  maxReferencesHint,
  onRequestCreateAsset,
  onError,
}: {
  assetIds: Record<AssetKind, string[]>;
  assetsByKind: Record<AssetKind, Asset[]>;
  references: string[];
  onAssetIdsChange: (next: Record<AssetKind, string[]>) => void;
  onReferencesChange: (next: string[]) => void;
  thumbnailUrl: (asset: Asset) => string | null | undefined;
  maxReferencesHint?: number;
  onRequestCreateAsset: () => void;
  onError: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [activeView, setActiveView] = useState<ActiveView | null>(null);
  const t = useT();
  const totalAssets = ASSET_REFERENCE_KINDS.reduce((sum, kind) => sum + assetIds[kind].length, 0);
  const totalReferences = totalAssets + references.length;
  const overHint = typeof maxReferencesHint === "number" && totalReferences > maxReferencesHint;
  const triggerLabel =
    totalReferences > 0
      ? `${t("studio.references")} (${totalReferences})`
      : t("studio.addReference");

  const chooseLocalImages = async (): Promise<void> => {
    try {
      const result = await api["system.chooseFiles"]({
        multiple: true,
        filters: IMAGE_FILE_FILTERS,
      });
      if (result.paths.length === 0) return;
      onReferencesChange(uniqueStrings([...references, ...result.paths]));
    } catch (err) {
      onError((err as Error)?.message ?? String(err));
    }
  };

  const removeReference = (path: string): void => {
    onReferencesChange(references.filter((ref) => ref !== path));
  };

  const toggleAsset = (kind: AssetKind, assetId: string): void => {
    const current = assetIds[kind] ?? [];
    const next = current.includes(assetId)
      ? current.filter((id) => id !== assetId)
      : [...current, assetId];
    onAssetIdsChange({ ...assetIds, [kind]: next });
  };

  const addGallerySelection = async (items: GalleryItem[]): Promise<void> => {
    if (items.length === 0) return;
    try {
      const paths = await Promise.all(
        items.map((item) => resolveGalleryAbsolutePath(item.relPath)),
      );
      onReferencesChange(uniqueStrings([...references, ...paths]));
    } catch (err) {
      onError((err as Error)?.message ?? String(err));
    }
  };

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setActiveView(null);
      }}
    >
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={triggerLabel}
          title={triggerLabel}
          className={
            "inline-flex size-8 items-center justify-center rounded-(--radius-pill) border " +
            "bg-(--bg) text-(--text-muted) transition-colors duration-(--motion-fast) " +
            "hover:border-(--text-muted) hover:text-(--text) focus-visible:outline-none " +
            "focus-visible:ring-2 focus-visible:ring-(--focus-ring) " +
            "data-[state=open]:border-(--text) data-[state=open]:text-(--text) " +
            (totalReferences > 0 ? "border-(--accent) text-(--accent)" : "border-(--border)")
          }
        >
          <Icons.Paperclip weight="duotone" className="size-3.5" />
        </button>
      </Popover.Trigger>
      <Popover.Content className="w-[420px] p-3">
        {activeView?.type === "kind" ? (
          <ReferenceKindPanel
            kind={activeView.kind}
            assets={assetsByKind[activeView.kind] ?? []}
            selected={assetIds[activeView.kind] ?? []}
            thumbnailUrl={thumbnailUrl}
            onBack={() => setActiveView(null)}
            onToggleAsset={(assetId) => toggleAsset(activeView.kind, assetId)}
            onCreateAsset={onRequestCreateAsset}
          />
        ) : activeView?.type === "gallery" ? (
          <GalleryPickerPanel
            onBack={() => setActiveView(null)}
            onConfirm={async (items) => {
              await addGallerySelection(items);
              setActiveView(null);
            }}
            onError={onError}
          />
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[12px] font-semibold text-(--text)">
                {t("studio.references")}
              </span>
              {overHint ? (
                <span className="text-[11px] text-(--warning)">
                  {t("studio.maxReferences", { max: String(maxReferencesHint) })}
                </span>
              ) : null}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {ASSET_REFERENCE_KINDS.map((kind) => (
                <ReferenceMenuButton
                  key={kind}
                  icon={assetKindIcon(kind)}
                  label={assetKindLabel(kind, t)}
                  count={assetIds[kind]?.length ?? 0}
                  onClick={() => setActiveView({ type: "kind", kind })}
                />
              ))}
              <ReferenceMenuButton
                icon={
                  <Icons.ImageSquare weight="duotone" className="size-4 shrink-0 text-(--text-muted)" />
                }
                label={t("studio.pickFromGallery")}
                count={0}
                onClick={() => setActiveView({ type: "gallery" })}
              />
              <ReferenceMenuButton
                icon={<Icons.UploadSimple weight="duotone" className="size-4 shrink-0 text-(--text-muted)" />}
                label={t("studio.uploadLocalImage")}
                count={references.length}
                onClick={() => void chooseLocalImages()}
              />
            </div>
            {totalReferences > 0 ? (
              <SelectedReferences
                assetIds={assetIds}
                assetsByKind={assetsByKind}
                references={references}
                onRemoveAsset={(kind, id) => toggleAsset(kind, id)}
                onRemoveReference={removeReference}
              />
            ) : null}
          </div>
        )}
      </Popover.Content>
    </Popover.Root>
  );
}

function ReferenceKindPanel({
  kind,
  assets,
  selected,
  thumbnailUrl,
  onBack,
  onToggleAsset,
  onCreateAsset,
}: {
  kind: AssetKind;
  assets: Asset[];
  selected: string[];
  thumbnailUrl: (asset: Asset) => string | null | undefined;
  onBack: () => void;
  onToggleAsset: (assetId: string) => void;
  onCreateAsset: () => void;
}) {
  const t = useT();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex h-7 items-center gap-1 rounded-(--radius-sm) px-2 text-[12px] text-(--text-muted) hover:bg-(--surface) hover:text-(--text)"
        >
          <Icons.CaretRight weight="bold" className="size-3 rotate-180" />
          {t("studio.references")}
        </button>
        <span className="text-[12px] font-semibold text-(--text)">{assetKindLabel(kind, t)}</span>
      </div>

      {assets.length === 0 ? (
        <div className="rounded-(--radius-md) border border-(--border-faint) px-3 py-5 text-center text-[12px] text-(--text-muted)">
          <p>{t("studio.noKindAssets", { kind: assetKindLabel(kind, t).toLowerCase() })}</p>
          <button
            type="button"
            onClick={onCreateAsset}
            className="mt-2 text-(--text) underline underline-offset-2"
          >
            {t("assets.createAsset")}
          </button>
        </div>
      ) : (
        <div className="grid max-h-[260px] grid-cols-3 gap-2 overflow-y-auto">
          {assets.map((asset) => {
            const url = thumbnailUrl(asset);
            const active = selected.includes(asset.id);
            return (
              <button
                key={asset.id}
                type="button"
                onClick={() => onToggleAsset(asset.id)}
                className={
                  "group flex min-w-0 flex-col overflow-hidden rounded-(--radius-sm) border " +
                  "bg-(--surface-sunken) text-left transition-colors duration-(--motion-fast) " +
                  "hover:border-(--border-strong) focus-visible:outline-none focus-visible:ring-2 " +
                  "focus-visible:ring-(--focus-ring) " +
                  (active ? "border-(--accent)" : "border-(--border)")
                }
              >
                <span className="aspect-square w-full bg-(--surface)">
                  {url ? (
                    <img src={url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-[16px] font-semibold text-(--text-muted)">
                      {asset.name.charAt(0).toUpperCase()}
                    </span>
                  )}
                </span>
                <span className="truncate px-2 py-1.5 text-[11px] text-(--text)">{asset.name}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function GalleryPickerPanel({
  onBack,
  onConfirm,
  onError,
}: {
  onBack: () => void;
  onConfirm: (items: GalleryItem[]) => void | Promise<void>;
  onError: (message: string) => void;
}) {
  const t = useT();
  const PAGE_SIZE = 120;
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const result = await api["gallery.query"]({
          kind: "image",
          limit: PAGE_SIZE,
          offset: 0,
        });
        if (cancelled) return;
        setItems(result.items);
        setTotal(result.total);
      } catch (err) {
        if (cancelled) return;
        onError((err as Error)?.message ?? String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [onError]);

  const loadMore = async (): Promise<void> => {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      const result = await api["gallery.query"]({
        kind: "image",
        limit: PAGE_SIZE,
        offset: items.length,
      });
      setItems((prev) => {
        const seen = new Set(prev.map((it) => it.id));
        const merged = [...prev];
        for (const item of result.items) {
          if (!seen.has(item.id)) merged.push(item);
        }
        return merged;
      });
      setTotal(result.total);
    } catch (err) {
      onError((err as Error)?.message ?? String(err));
    } finally {
      setLoadingMore(false);
    }
  };

  const toggle = (id: string): void => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((it) => it !== id) : [...prev, id]));
  };

  const confirm = async (): Promise<void> => {
    if (selected.length === 0 || adding) return;
    setAdding(true);
    try {
      const picked = items.filter((item) => selected.includes(item.id));
      await onConfirm(picked);
    } finally {
      setAdding(false);
    }
  };

  const hasMore = total !== null && items.length < total;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex h-7 items-center gap-1 rounded-(--radius-sm) px-2 text-[12px] text-(--text-muted) hover:bg-(--surface) hover:text-(--text)"
        >
          <Icons.CaretRight weight="bold" className="size-3 rotate-180" />
          {t("studio.references")}
        </button>
        <span className="text-[12px] font-semibold text-(--text)">
          {t("studio.pickFromGallery")}
        </span>
      </div>

      {loading && items.length === 0 ? (
        <div className="rounded-(--radius-md) border border-(--border-faint) px-3 py-5 text-center text-[12px] text-(--text-muted)">
          {t("common.loading")}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-(--radius-md) border border-(--border-faint) px-3 py-5 text-center text-[12px] text-(--text-muted)">
          {t("studio.noRecentImages")}
        </div>
      ) : (
        <div className="flex max-h-[280px] flex-col gap-2 overflow-y-auto pr-1">
          <div className="grid grid-cols-4 gap-1.5">
            {items.map((item) => {
              const active = selected.includes(item.id);
              const order = active ? selected.indexOf(item.id) + 1 : 0;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => toggle(item.id)}
                  title={item.prompt}
                  className={
                    "relative block aspect-square overflow-hidden rounded-(--radius-xs) border " +
                    "bg-(--surface-sunken) transition-colors duration-(--motion-fast) " +
                    "hover:border-(--border-strong) focus-visible:outline-none focus-visible:ring-2 " +
                    "focus-visible:ring-(--focus-ring) " +
                    (active ? "border-(--accent)" : "border-(--border)")
                  }
                >
                  <img
                    src={resolveGalleryUrl(item.relPath)}
                    alt={item.prompt}
                    className="block h-full w-full object-cover"
                  />
                  {active ? (
                    <span
                      className={
                        "absolute right-1 top-1 inline-flex size-4 items-center justify-center " +
                        "rounded-full bg-(--accent) text-[10px] font-semibold text-(--accent-fg)"
                      }
                    >
                      {order}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
          {hasMore ? (
            <button
              type="button"
              onClick={() => void loadMore()}
              disabled={loadingMore}
              className={
                "mt-1 inline-flex h-8 items-center justify-center rounded-(--radius-sm) border " +
                "border-(--border) bg-(--surface) text-[11px] text-(--text-muted) " +
                "hover:border-(--border-strong) hover:text-(--text) disabled:opacity-60"
              }
            >
              {loadingMore
                ? t("common.loading")
                : t("gallery.loadMore", { remaining: String((total ?? items.length) - items.length) })}
            </button>
          ) : null}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 border-t border-(--border-faint) pt-3">
        <span className="text-[11px] text-(--text-muted)">
          {selected.length > 0
            ? t("studio.gallerySelectedCount", { count: String(selected.length) })
            : t("studio.gallerySelectHint")}
        </span>
        <Button
          size="sm"
          onClick={() => void confirm()}
          disabled={selected.length === 0 || adding}
        >
          {t("studio.addToReferences")}
        </Button>
      </div>
    </div>
  );
}

function ReferenceMenuButton({
  icon,
  label,
  count,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "flex items-center justify-between gap-3 rounded-(--radius-md) border border-(--border) " +
        "bg-(--surface) px-3 py-2 text-left transition-colors duration-(--motion-fast) " +
        "hover:border-(--border-strong) hover:bg-(--surface-raised) focus-visible:outline-none " +
        "focus-visible:ring-2 focus-visible:ring-(--focus-ring)"
      }
    >
      <span className="flex min-w-0 items-center gap-2">
        {icon}
        <span className="truncate text-[12px] font-semibold text-(--text)">{label}</span>
      </span>
      {count > 0 ? (
        <span className="rounded-(--radius-pill) bg-(--accent-soft) px-1.5 text-[10px] font-semibold text-(--accent)">
          {count}
        </span>
      ) : null}
    </button>
  );
}

function SelectedReferences({
  assetIds,
  assetsByKind,
  references,
  onRemoveAsset,
  onRemoveReference,
}: {
  assetIds: Record<AssetKind, string[]>;
  assetsByKind: Record<AssetKind, Asset[]>;
  references: string[];
  onRemoveAsset: (kind: AssetKind, id: string) => void;
  onRemoveReference: (path: string) => void;
}) {
  const selectedAssets = ASSET_REFERENCE_KINDS.flatMap((kind) =>
    (assetIds[kind] ?? []).map((id) => ({
      kind,
      id,
      asset: assetsByKind[kind]?.find((asset) => asset.id === id) ?? null,
    })),
  );

  return (
    <div className="flex flex-wrap gap-1.5 border-t border-(--border-faint) pt-3">
      {selectedAssets.map(({ kind, id, asset }) => (
        <ReferenceChip
          key={`${kind}:${id}`}
          label={asset?.name ?? id}
          onRemove={() => onRemoveAsset(kind, id)}
        />
      ))}
      {references.map((path) => (
        <ReferenceChip key={path} label={fileName(path)} onRemove={() => onRemoveReference(path)} />
      ))}
    </div>
  );
}

function ReferenceChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  const t = useT();
  return (
    <span className="inline-flex max-w-[180px] items-center gap-1 rounded-(--radius-pill) border border-(--border) bg-(--bg) px-2 py-1 text-[11px] text-(--text)">
      <span className="truncate">{label}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={t("studio.removeReference", { label })}
        className="text-(--text-muted) hover:text-(--danger)"
      >
        <Icons.X weight="bold" className="size-3" />
      </button>
    </span>
  );
}

type TFn = ReturnType<typeof useT>;

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

function assetKindIcon(kind: AssetKind): ReactNode {
  const className = "size-4 shrink-0 text-(--text-muted)";
  switch (kind) {
    case "character":
      return <Icons.UserCircle weight="duotone" className={className} />;
    case "object":
      return <Icons.Cube weight="duotone" className={className} />;
    case "background":
      return <Icons.Mountains weight="duotone" className={className} />;
    case "style":
      return <Icons.Palette weight="duotone" className={className} />;
  }
}
