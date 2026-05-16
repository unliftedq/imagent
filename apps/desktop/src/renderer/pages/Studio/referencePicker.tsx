import type { Asset, AssetKind } from "@imagent/core";
import { Icons, Popover } from "@imagent/ui";
import type { ReactNode } from "react";
import { useState } from "react";
import { useT } from "../../i18n/index.js";
import { api } from "../../lib/api.js";
import {
  ASSET_REFERENCE_KINDS,
  IMAGE_FILE_FILTERS,
  type ReferenceKind,
} from "./types.js";
import { fileName, uniqueStrings } from "./utils.js";

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
  const [activeKind, setActiveKind] = useState<ReferenceKind | null>(null);
  const t = useT();
  const totalAssets = ASSET_REFERENCE_KINDS.reduce((sum, kind) => sum + assetIds[kind].length, 0);
  const totalReferences = totalAssets + references.length;
  const overHint = typeof maxReferencesHint === "number" && totalReferences > maxReferencesHint;
  const triggerLabel = totalReferences > 0 ? `${t("studio.references")} (${totalReferences})` : t("studio.addReference");

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

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setActiveKind(null);
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
        {activeKind ? (
          <ReferenceKindPanel
            kind={activeKind}
            assets={activeKind === "other" ? [] : (assetsByKind[activeKind] ?? [])}
            selected={activeKind === "other" ? [] : (assetIds[activeKind] ?? [])}
            references={references}
            thumbnailUrl={thumbnailUrl}
            onBack={() => setActiveKind(null)}
            onToggleAsset={(assetId) => {
              if (activeKind !== "other") toggleAsset(activeKind, assetId);
            }}
            onChooseLocal={() => void chooseLocalImages()}
            onCreateAsset={onRequestCreateAsset}
          />
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[12px] font-semibold text-(--text)">{t("studio.references")}</span>
              {overHint ? (
                <span className="text-[11px] text-(--warning)">{t("studio.maxReferences", { max: String(maxReferencesHint) })}</span>
              ) : null}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {ASSET_REFERENCE_KINDS.map((kind) => (
                <ReferenceMenuButton
                  key={kind}
                  kind={kind}
                  count={assetIds[kind]?.length ?? 0}
                  onClick={() => setActiveKind(kind)}
                />
              ))}
              <ReferenceMenuButton
                kind="other"
                count={references.length}
                onClick={() => setActiveKind("other")}
              />            </div>
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
  references,
  thumbnailUrl,
  onBack,
  onToggleAsset,
  onChooseLocal,
  onCreateAsset,
}: {
  kind: ReferenceKind;
  assets: Asset[];
  selected: string[];
  references: string[];
  thumbnailUrl: (asset: Asset) => string | null | undefined;
  onBack: () => void;
  onToggleAsset: (assetId: string) => void;
  onChooseLocal: () => void;
  onCreateAsset: () => void;
}) {
  const t = useT();
  const isOther = kind === "other";

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
        <span className="text-[12px] font-semibold text-(--text)">{referenceKindLabel(kind, t)}</span>
      </div>

      <button
        type="button"
        onClick={onChooseLocal}
        className={
          "flex h-10 items-center justify-center gap-2 rounded-(--radius-md) border border-dashed " +
          "border-(--border) bg-(--surface) text-[12px] text-(--text) transition-colors " +
          "duration-(--motion-fast) hover:border-(--text)"
        }
      >
        <Icons.FolderOpen weight="duotone" className="size-4 text-(--text-muted)" />
        {t("studio.uploadLocalImage")}
      </button>

      {isOther ? (
        references.length === 0 ? (
          <div className="rounded-(--radius-md) border border-(--border-faint) px-3 py-5 text-center text-[12px] text-(--text-muted)">
            {t("studio.noLocalReferences")}
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {references.map((path) => (
              <div
                key={path}
                className="flex min-w-0 items-center gap-2 rounded-(--radius-sm) bg-(--surface) px-2 py-1.5 text-[12px] text-(--text)"
              >
                <Icons.Image weight="duotone" className="size-4 shrink-0 text-(--text-muted)" />
                <span className="truncate">{fileName(path)}</span>
              </div>
            ))}
          </div>
        )
      ) : assets.length === 0 ? (
        <div className="rounded-(--radius-md) border border-(--border-faint) px-3 py-5 text-center text-[12px] text-(--text-muted)">
          <p>{t("studio.noKindAssets", { kind: referenceKindLabel(kind, t).toLowerCase() })}</p>
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

function ReferenceMenuButton({
  kind,
  count,
  onClick,
}: {
  kind: ReferenceKind;
  count: number;
  onClick: () => void;
}) {
  const t = useT();
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
        {referenceKindIcon(kind)}
        <span className="truncate text-[12px] font-semibold text-(--text)">
          {referenceKindLabel(kind, t)}
        </span>
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

function referenceKindLabel(kind: ReferenceKind, t: TFn): string {
  switch (kind) {
    case "character":
      return t("assets.kind.character");
    case "object":
      return t("assets.kind.object");
    case "background":
      return t("assets.kind.background");
    case "style":
      return t("assets.kind.style");
    case "other":
      return t("studio.role.other");
  }
}

function referenceKindIcon(kind: ReferenceKind): ReactNode {
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
    case "other":
      return <Icons.UploadSimple weight="duotone" className={className} />;
  }
}
