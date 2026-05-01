import type {
  Asset,
  AssetKind,
  GalleryItem,
  ImageModelDef,
  ImageRequest,
  Job,
  VideoModelDef,
  VideoRequest,
} from "@imagine/core";
import type { ProviderId, ProviderSummary } from "@imagine/ipc";
import { IpcClientError } from "@imagine/ipc";
import {
  Button,
  GalleryRail,
  type GalleryRailItem,
  Icons,
  JobProgress,
  Popover,
  Select,
} from "@imagine/ui";
import {
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { api } from "../lib/api.js";
import { useAssetsStore } from "../state/useAssetsStore.js";
import { useConfigStore } from "../state/useConfigStore.js";
import { useGalleryStore } from "../state/useGalleryStore.js";
import { useJobsStore } from "../state/useJobsStore.js";
import { type StudioMode, useUIStore } from "../state/useUIStore.js";
import { resolveAssetThumbnailUrl } from "./Assets.js";

const ASSET_REFERENCE_KINDS = ["character", "object", "background", "style"] as const;
const MODEL_FAVORITES_LS_KEY = "imagine.favoriteModels.v1";
const IMAGE_FILE_FILTERS = [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif"] }];

type ModelFavoriteKey = `${StudioMode}:${string}:${string}`;
type ReferenceKind = AssetKind | "other";

interface UnifiedModelOption {
  providerId: ProviderId;
  providerName: string;
  modelId: string;
  displayName: string;
  capabilities?: ImageModelDef["capabilities"] | VideoModelDef["capabilities"];
}

/**
 * Unified Studio page (DESIGN.md §11.1), refreshed into a chat-first surface:
 * a fixed mode switch, a generous preview canvas, and a bottom composer whose
 * toolbar owns provider/model/settings for the active mode.
 */
export function StudioPage() {
  const studioMode = useUIStore((s) => s.studioMode);
  const setStudioMode = useUIStore((s) => s.setStudioMode);
  const navigate = useUIStore((s) => s.navigate);

  return (
    <div
      className="grid h-full w-full"
      style={{
        gridTemplateColumns: "minmax(0, 1fr) var(--rail-gallery, 240px)",
      }}
    >
      <section className="flex h-full min-w-0 flex-col bg-(--bg)">
        <StudioModeSwitch mode={studioMode} onModeChange={setStudioMode} />
        <div className="min-h-0 flex-1">
          <CanvasArea key={studioMode} mode={studioMode} />
        </div>
        <StudioComposerDock mode={studioMode} />
      </section>
      <StudioGalleryRail mode={studioMode} onViewAll={() => navigate("gallery")} />
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Top mode switch + bottom composer dock.
 * ----------------------------------------------------------------------- */

function StudioModeSwitch({
  mode,
  onModeChange,
}: {
  mode: StudioMode;
  onModeChange: (m: StudioMode) => void;
}) {
  return (
    <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center justify-center border-b border-(--border) bg-(--bg)/95 backdrop-blur">
      <div className="grid grid-cols-2 gap-1 rounded-(--radius-lg) border border-(--border) bg-(--surface) p-1">
        <ModeSwitchButton
          active={mode === "image"}
          icon={<Icons.Image weight="duotone" className="size-4" />}
          onClick={() => onModeChange("image")}
        >
          Image
        </ModeSwitchButton>
        <ModeSwitchButton
          active={mode === "video"}
          icon={<Icons.FilmReel weight="duotone" className="size-4" />}
          onClick={() => onModeChange("video")}
        >
          Video
        </ModeSwitchButton>
      </div>
    </header>
  );
}

function ModeSwitchButton({
  active,
  icon,
  onClick,
  children,
}: {
  active: boolean;
  icon: ReactNode;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={
        "inline-flex h-9 min-w-28 items-center justify-center gap-2 rounded-(--radius-md) " +
        "px-4 text-[13px] font-semibold transition-colors duration-(--motion-fast) " +
        "ease-(--ease-out) focus-visible:outline-none focus-visible:ring-2 " +
        "focus-visible:ring-(--focus-ring) " +
        (active
          ? "bg-(--bg) text-(--text) shadow-[0_0_0_1px_var(--border)]"
          : "text-(--text-muted) hover:bg-(--surface-sunken) hover:text-(--text)")
      }
    >
      {icon}
      {children}
    </button>
  );
}

function StudioComposerDock({ mode }: { mode: StudioMode }) {
  return (
    <div className="shrink-0 border-t border-(--border) bg-(--bg)">
      {mode === "image" ? <ImageRail /> : <VideoRail />}
    </div>
  );
}

function ChatComposerShell({
  mode,
  prompt,
  onPromptChange,
  onSubmit,
  placeholder,
  submitting,
  disabled,
  validationError,
  remixId,
  onClearRemix,
  children,
}: {
  mode: StudioMode;
  prompt: string;
  onPromptChange: (next: string) => void;
  onSubmit: () => void;
  placeholder: string;
  submitting: boolean;
  disabled: boolean;
  validationError: string | null;
  remixId?: string;
  onClearRemix?: () => void;
  children: ReactNode;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    autosizeComposer(textareaRef.current);
  });

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      onSubmit();
    }
  };

  const actionLabel = mode === "video" ? "Submit video" : "Generate image";

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-5">
      <div
        className={
          "overflow-hidden rounded-(--radius-lg) border border-(--border) " +
          "bg-(--surface-raised) shadow-[0_16px_48px_-30px_rgba(0,0,0,0.45)] " +
          "transition-colors duration-(--motion-fast) focus-within:border-(--border-strong)"
        }
      >
        {remixId ? (
          <div className="flex items-center justify-between gap-3 px-4 pt-3">
            <span
              className={
                "inline-flex items-center gap-1 rounded-(--radius-pill) " +
                "bg-(--accent-soft) px-2.5 py-1 text-[11px] font-semibold text-(--accent)"
              }
            >
              Remix {remixId.slice(0, 8)}...
            </span>
            {onClearRemix ? (
              <button
                type="button"
                onClick={onClearRemix}
                className="text-[12px] text-(--text-muted) underline-offset-2 hover:text-(--text) hover:underline"
              >
                Clear
              </button>
            ) : null}
          </div>
        ) : null}

        <textarea
          ref={textareaRef}
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={3}
          className={
            "block max-h-[220px] min-h-[104px] w-full resize-none bg-transparent " +
            "px-4 py-4 text-[14px] leading-6 text-(--text) placeholder:text-(--text-faint) " +
            "focus-visible:outline-none"
          }
        />

        {validationError ? (
          <div className="mx-3 mb-2 rounded-(--radius-sm) border border-(--danger) bg-(--danger-soft) px-3 py-2 text-[12px] text-(--danger)">
            {validationError}
          </div>
        ) : null}

        <div className="flex min-h-12 flex-wrap items-center gap-2 border-t border-(--border-faint) px-3 py-2">
          {children}
          <button
            type="button"
            aria-label={actionLabel}
            title={actionLabel}
            onClick={onSubmit}
            disabled={disabled || submitting}
            className={
              "ml-auto inline-flex size-9 items-center justify-center rounded-(--radius-md) " +
              "bg-(--accent) text-(--accent-fg) transition-colors duration-(--motion-fast) " +
              "hover:bg-(--accent-hover) focus-visible:outline-none focus-visible:ring-2 " +
              "focus-visible:ring-(--focus-ring) disabled:cursor-not-allowed " +
              "disabled:bg-(--surface-sunken) disabled:text-(--text-muted)"
            }
          >
            {submitting ? (
              <Icons.CircleNotch weight="bold" className="size-4 animate-spin" />
            ) : (
              <Icons.Play weight="fill" className="ml-0.5 size-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function ToolbarSelectTrigger({
  ariaLabel,
  icon,
  className,
}: {
  ariaLabel: string;
  icon: ReactNode;
  className: string;
}) {
  return (
    <Select.Trigger aria-label={ariaLabel} className={className}>
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="shrink-0 text-(--text-muted)">{icon}</span>
        <Select.Value />
      </span>
    </Select.Trigger>
  );
}

function ProviderModelPicker({
  mode,
  options,
  providerId,
  modelId,
  favoriteKeys,
  onToggleFavorite,
  onChange,
}: {
  mode: StudioMode;
  options: UnifiedModelOption[];
  providerId: string;
  modelId: string;
  favoriteKeys: Set<string>;
  onToggleFavorite: (key: ModelFavoriteKey) => void;
  onChange: (next: { providerId: ProviderId; modelId: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.providerId === providerId && o.modelId === modelId);
  const favorites = options.filter((o) => favoriteKeys.has(modelFavoriteKey(mode, o)));
  const providers = uniqueProviders(options);

  const choose = (option: UnifiedModelOption): void => {
    onChange({ providerId: option.providerId, modelId: option.modelId });
    setOpen(false);
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={
            "inline-flex h-8 max-w-[280px] items-center gap-2 rounded-(--radius-pill) " +
            "border border-(--border) bg-(--bg) px-3 text-[12px] text-(--text) " +
            "transition-colors duration-(--motion-fast) hover:border-(--text) " +
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--focus-ring)"
          }
        >
          <Icons.Brain weight="duotone" className="size-3.5 shrink-0 text-(--text-muted)" />
          <span className="min-w-0 truncate font-semibold">
            {current?.displayName ?? "Choose model"}
          </span>
          {current ? (
            <span className="hidden max-w-[92px] truncate text-[11px] text-(--text-faint) sm:inline">
              {current.providerName}
            </span>
          ) : null}
        </button>
      </Popover.Trigger>
      <Popover.Content className="w-[420px] p-2">
        <div className="flex max-h-[460px] flex-col gap-2 overflow-y-auto">
          {favorites.length > 0 ? (
            <ModelPickerSection title="Favorites">
              {favorites.map((option) => (
                <ModelPickerRow
                  key={`fav:${option.providerId}:${option.modelId}`}
                  mode={mode}
                  option={option}
                  active={option.providerId === providerId && option.modelId === modelId}
                  favorite={favoriteKeys.has(modelFavoriteKey(mode, option))}
                  onChoose={() => choose(option)}
                  onToggleFavorite={onToggleFavorite}
                  showProvider
                />
              ))}
            </ModelPickerSection>
          ) : null}

          {providers.map((provider) => {
            const providerOptions = options.filter((o) => o.providerId === provider.id);
            return (
              <ModelPickerSection key={provider.id} title={provider.name}>
                {providerOptions.map((option) => (
                  <ModelPickerRow
                    key={`${option.providerId}:${option.modelId}`}
                    mode={mode}
                    option={option}
                    active={option.providerId === providerId && option.modelId === modelId}
                    favorite={favoriteKeys.has(modelFavoriteKey(mode, option))}
                    onChoose={() => choose(option)}
                    onToggleFavorite={onToggleFavorite}
                  />
                ))}
              </ModelPickerSection>
            );
          })}
        </div>
      </Popover.Content>
    </Popover.Root>
  );
}

function ModelPickerSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1">
      <h3 className="px-2 pt-1 text-[11px] font-semibold text-(--text-muted)">{title}</h3>
      <div className="flex flex-col gap-0.5">{children}</div>
    </section>
  );
}

function ModelPickerRow({
  mode,
  option,
  active,
  favorite,
  showProvider,
  onChoose,
  onToggleFavorite,
}: {
  mode: StudioMode;
  option: UnifiedModelOption;
  active: boolean;
  favorite: boolean;
  showProvider?: boolean;
  onChoose: () => void;
  onToggleFavorite: (key: ModelFavoriteKey) => void;
}) {
  const favoriteKey = modelFavoriteKey(mode, option);
  return (
    <div
      className={
        "group flex w-full items-center gap-3 rounded-(--radius-sm) px-2 py-2 text-left " +
        "transition-colors duration-(--motion-fast) hover:bg-(--surface) " +
        (active ? "bg-(--accent-soft)" : "")
      }
    >
      <button
        type="button"
        onClick={onChoose}
        className="flex min-w-0 flex-1 flex-col text-left focus-visible:outline-none"
      >
        <span className="truncate text-[12px] font-semibold text-(--text)">
          {option.displayName}
        </span>
        <span className="truncate text-[11px] text-(--text-faint)">
          {showProvider ? `${option.providerName} · ${option.modelId}` : option.modelId}
        </span>
      </button>
      <button
        type="button"
        aria-label={favorite ? "Unfavorite model" : "Favorite model"}
        onClick={(e) => {
          e.stopPropagation();
          onToggleFavorite(favoriteKey);
        }}
        className={
          "inline-flex size-7 shrink-0 items-center justify-center rounded-(--radius-sm) " +
          "text-(--text-faint) transition-colors duration-(--motion-fast) " +
          "hover:bg-(--bg) hover:text-(--text) focus-visible:outline-none focus-visible:ring-2 " +
          "focus-visible:ring-(--focus-ring) " +
          (favorite ? "text-(--accent)" : "")
        }
      >
        <Icons.Star weight={favorite ? "fill" : "regular"} className="size-4" />
      </button>
    </div>
  );
}

function ReferencePicker({
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
  const totalAssets = ASSET_REFERENCE_KINDS.reduce((sum, kind) => sum + assetIds[kind].length, 0);
  const totalReferences = totalAssets + references.length;
  const overHint = typeof maxReferencesHint === "number" && totalReferences > maxReferencesHint;

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
          className={
            "inline-flex h-8 items-center gap-2 rounded-(--radius-pill) border border-(--border) " +
            "bg-(--bg) px-3 text-[12px] text-(--text) transition-colors duration-(--motion-fast) " +
            "hover:border-(--text) focus-visible:outline-none focus-visible:ring-2 " +
            "focus-visible:ring-(--focus-ring)"
          }
        >
          <Icons.Plus weight="bold" className="size-3.5 text-(--text-muted)" />
          <span>{totalReferences > 0 ? `References ${totalReferences}` : "Add reference"}</span>
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
              <span className="text-[12px] font-semibold text-(--text)">References</span>
              {overHint ? (
                <span className="text-[11px] text-(--warning)">Max {maxReferencesHint}</span>
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
          References
        </button>
        <span className="text-[12px] font-semibold text-(--text)">{referenceKindLabel(kind)}</span>
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
        Upload local image
      </button>

      {isOther ? (
        references.length === 0 ? (
          <div className="rounded-(--radius-md) border border-(--border-faint) px-3 py-5 text-center text-[12px] text-(--text-muted)">
            No local references yet.
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
          <p>No {referenceKindLabel(kind).toLowerCase()} assets yet.</p>
          <button
            type="button"
            onClick={onCreateAsset}
            className="mt-2 text-(--text) underline underline-offset-2"
          >
            Create asset
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
          {referenceKindLabel(kind)}
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
      asset: assetsByKind[kind]?.find((a) => a.id === id) ?? null,
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
  return (
    <span className="inline-flex max-w-[180px] items-center gap-1 rounded-(--radius-pill) border border-(--border) bg-(--bg) px-2 py-1 text-[11px] text-(--text)">
      <span className="truncate">{label}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${label}`}
        className="text-(--text-muted) hover:text-(--danger)"
      >
        <Icons.X weight="bold" className="size-3" />
      </button>
    </span>
  );
}

function useModelFavorites(): {
  favoriteKeys: Set<string>;
  toggleFavorite: (key: ModelFavoriteKey) => void;
} {
  const [favoriteList, setFavoriteList] = useState<ModelFavoriteKey[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const parsed = JSON.parse(window.localStorage.getItem(MODEL_FAVORITES_LS_KEY) ?? "[]");
      return Array.isArray(parsed) ? parsed.filter(isModelFavoriteKey) : [];
    } catch {
      return [];
    }
  });

  const favoriteKeys = useMemo(() => new Set<string>(favoriteList), [favoriteList]);
  const toggleFavorite = (key: ModelFavoriteKey): void => {
    setFavoriteList((prev) => {
      const next = prev.includes(key) ? prev.filter((v) => v !== key) : [key, ...prev];
      if (typeof window !== "undefined") {
        window.localStorage.setItem(MODEL_FAVORITES_LS_KEY, JSON.stringify(next));
      }
      return next;
    });
  };
  return { favoriteKeys, toggleFavorite };
}

function createUnifiedModelOptions(
  providers: ProviderSummary[],
  modelsByProvider: Record<string, Array<ImageModelDef | VideoModelDef>>,
): UnifiedModelOption[] {
  return providers.flatMap((provider) =>
    (modelsByProvider[provider.id] ?? []).map((model) => ({
      providerId: provider.id,
      providerName: provider.displayName,
      modelId: model.id,
      displayName: model.displayName ?? model.id,
      capabilities: model.capabilities,
    })),
  );
}

function modelFavoriteKey(mode: StudioMode, option: UnifiedModelOption): ModelFavoriteKey {
  return `${mode}:${option.providerId}:${option.modelId}`;
}

function isModelFavoriteKey(value: unknown): value is ModelFavoriteKey {
  return typeof value === "string" && /^(image|video):[^:]+:.+$/.test(value);
}

function uniqueProviders(options: UnifiedModelOption[]): Array<{ id: ProviderId; name: string }> {
  const seen = new Set<string>();
  const providers: Array<{ id: ProviderId; name: string }> = [];
  for (const option of options) {
    if (seen.has(option.providerId)) continue;
    seen.add(option.providerId);
    providers.push({ id: option.providerId, name: option.providerName });
  }
  return providers;
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

function referenceKindLabel(kind: ReferenceKind): string {
  switch (kind) {
    case "character":
      return "Character";
    case "object":
      return "Object";
    case "background":
      return "Background";
    case "style":
      return "Style";
    case "other":
      return "Other";
  }
}

function referenceKindIcon(kind: ReferenceKind): ReactNode {
  const className = "size-4 shrink-0 text-(--text-muted)";
  switch (kind) {
    case "character":
      return <Icons.Plug weight="duotone" className={className} />;
    case "object":
      return <Icons.Cube weight="duotone" className={className} />;
    case "background":
      return <Icons.Image weight="duotone" className={className} />;
    case "style":
      return <Icons.Gear weight="duotone" className={className} />;
    case "other":
      return <Icons.FolderOpen weight="duotone" className={className} />;
  }
}

/* ----- Image rail ------------------------------------------------------ */

function ImageRail() {
  const draft = useUIStore((s) => s.studioDraft.image);
  const setDraft = useUIStore((s) => s.setImageDraft);
  const resetDraft = useUIStore((s) => s.resetStudioDraft);
  const navigate = useUIStore((s) => s.navigate);
  const pushToast = useUIStore((s) => s.pushToast);

  const summaries = useConfigStore((s) => s.summaries);
  const appPrefs = useConfigStore((s) => s.appPrefs);
  const refreshConfig = useConfigStore((s) => s.refresh);

  const refreshGallery = useGalleryStore((s) => s.refresh);
  const upsertOne = useGalleryStore((s) => s.upsertOne);

  const assetsByKind = useAssetsStore((s) => s.byKind);
  const refreshAssets = useAssetsStore((s) => s.refresh);

  const setActiveJobId = useJobsStore((s) => s.setActiveJobId);

  const [modelsByProvider, setModelsByProvider] = useState<Record<string, ImageModelDef[]>>({});
  const [submitting, setSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const { favoriteKeys, toggleFavorite } = useModelFavorites();

  const configuredProviders = useMemo(() => summaries.filter((s) => s.configured), [summaries]);

  useEffect(() => {
    void refreshConfig();
    void refreshGallery();
    void refreshAssets();
  }, [refreshConfig, refreshGallery, refreshAssets]);

  useEffect(() => {
    if (configuredProviders.length === 0) return;
    if (draft.providerId && configuredProviders.some((p) => p.id === draft.providerId)) {
      return;
    }
    const first =
      appPrefs?.defaultProvider &&
      configuredProviders.find((p) => p.id === appPrefs.defaultProvider)
        ? configuredProviders.find((p) => p.id === appPrefs.defaultProvider)
        : configuredProviders[0];
    if (!first) return;
    setDraft({
      providerId: first.id,
      modelId: first.defaultModel ?? first.modelIds[0] ?? "",
    });
  }, [configuredProviders, appPrefs?.defaultProvider, draft.providerId, setDraft]);

  useEffect(() => {
    if (configuredProviders.length === 0) {
      setModelsByProvider({});
      return;
    }
    let cancelled = false;
    void (async () => {
      const nextModels: Record<string, ImageModelDef[]> = {};
      const nextDefaults: Record<string, string | null> = {};
      const failures: string[] = [];
      await Promise.all(
        configuredProviders.map(async (provider) => {
          try {
            const r = await api["image.models"]({ providerId: provider.id as ProviderId });
            nextModels[provider.id] = r.models;
            nextDefaults[provider.id] = r.defaultModel;
          } catch (err) {
            failures.push(`${provider.displayName}: ${(err as Error)?.message ?? String(err)}`);
          }
        }),
      );
      if (cancelled) return;
      setModelsByProvider(nextModels);
      if (failures.length > 0) {
        pushToast({
          title: "Could not load some image models",
          description: failures.slice(0, 2).join("\n"),
          variant: "error",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [configuredProviders, pushToast]);

  useEffect(() => {
    const activeProvider = draft.providerId || configuredProviders[0]?.id;
    if (!activeProvider) return;
    const activeModels = modelsByProvider[activeProvider] ?? [];
    if (activeModels.length === 0 || activeModels.some((m) => m.id === draft.modelId)) return;
    const fallback = activeModels[0]?.id ?? "";
    if (fallback) {
      setDraft({ providerId: activeProvider, modelId: fallback });
    }
  }, [configuredProviders, draft.modelId, draft.providerId, modelsByProvider, setDraft]);

  const selectedModel = useMemo(
    () => modelsByProvider[draft.providerId]?.find((m) => m.id === draft.modelId) ?? null,
    [modelsByProvider, draft.providerId, draft.modelId],
  );
  const caps = selectedModel?.capabilities;

  useEffect(() => {
    if (!caps?.sizes || caps.sizes.length === 0) return;
    if (draft.size && caps.sizes.includes(draft.size)) return;
    setDraft({ size: caps.sizes[0] });
  }, [caps?.sizes, draft.size, setDraft]);

  // Quality is conditional on `model.capabilities.qualities`. When the user
  // switches to a model that doesn't surface qualities, drop the prior value
  // so it doesn't leak into the request payload.
  useEffect(() => {
    const supported = caps?.qualities;
    if (!supported || supported.length === 0) {
      if (draft.quality !== undefined) setDraft({ quality: undefined });
      return;
    }
    if (!draft.quality || !supported.includes(draft.quality)) {
      const fallback =
        (selectedModel?.defaults as { quality?: string } | undefined)?.quality ?? supported[0];
      setDraft({ quality: fallback });
    }
  }, [caps?.qualities, draft.quality, selectedModel?.defaults, setDraft]);

  // OutputFormat (png/jpeg/webp) — same conditional shape as Quality.
  useEffect(() => {
    const supported = caps?.outputFormats;
    if (!supported || supported.length === 0) {
      if (draft.outputFormat !== undefined) setDraft({ outputFormat: undefined });
      return;
    }
    if (!draft.outputFormat || !supported.includes(draft.outputFormat)) {
      const fallback =
        (selectedModel?.defaults as { outputFormat?: string } | undefined)?.outputFormat ??
        supported[0];
      setDraft({ outputFormat: fallback });
    }
  }, [caps?.outputFormats, draft.outputFormat, selectedModel?.defaults, setDraft]);

  const generate = async (): Promise<void> => {
    setValidationError(null);
    if (!draft.prompt.trim()) {
      setValidationError("Prompt is required.");
      return;
    }
    if (!draft.providerId || !draft.modelId) {
      setValidationError("Choose a provider and model first.");
      return;
    }
    if (caps?.maxOutputs && typeof draft.count === "number" && draft.count > caps.maxOutputs) {
      setValidationError(`Model accepts at most ${caps.maxOutputs} outputs (got ${draft.count}).`);
      return;
    }

    const slotsHaveAny =
      (draft.assetIds.character.length ?? 0) +
        (draft.assetIds.object.length ?? 0) +
        (draft.assetIds.background.length ?? 0) +
        (draft.assetIds.style.length ?? 0) >
      0;

    const req: ImageRequest & {
      assetSlots?: {
        character?: string[];
        object?: string[];
        background?: string[];
        style?: string[];
      };
    } = {
      prompt: draft.prompt.trim(),
      providerId: draft.providerId,
      model: draft.modelId,
      count: draft.count,
      ...(draft.size ? { size: draft.size } : {}),
      ...(draft.aspectRatio ? { aspectRatio: draft.aspectRatio } : {}),
      ...(draft.quality ? { quality: draft.quality } : {}),
      ...(draft.outputFormat ? { outputFormat: draft.outputFormat } : {}),
      references: draft.references.map((path) => ({ path, role: "freeform" as const })),
      assetIds: [],
      ...(draft.parentId ? { parentId: draft.parentId } : {}),
      ...(slotsHaveAny ? { assetSlots: draft.assetIds } : {}),
    };

    setSubmitting(true);
    setActiveJobId("__pending__");
    try {
      const item = await api["image.generate"](req);
      upsertOne(item);
      if (draft.parentId) setDraft({ parentId: undefined });
    } catch (err) {
      const msg = (err as Error)?.message ?? String(err);
      // Tag the toast title with the provider so a user with several
      // configured can spot which one failed at a glance.
      const providerLabel =
        configuredProviders.find((p) => p.id === draft.providerId)?.displayName ?? draft.providerId;
      pushToast({
        title: `${providerLabel} generation failed`,
        description: msg || "Provider returned no error message.",
        variant: "error",
      });
    } finally {
      setSubmitting(false);
      setActiveJobId(null);
    }
  };

  if (configuredProviders.length === 0) {
    return (
      <div className="rounded-(--radius-md) border border-(--border) bg-(--surface-raised) p-4 text-center">
        <Icons.Plug weight="duotone" className="mx-auto size-8 text-(--text-muted)" />
        <h2 className="mt-2 text-[15px] font-semibold tracking-[-0.01em] text-(--text)">
          No providers
        </h2>
        <p className="mt-1 text-[12px] text-(--text-muted)">Add an API key to start generating.</p>
        <div className="mt-3 inline-flex">
          <Button size="sm" onClick={() => navigate("providers")}>
            Open Providers
          </Button>
        </div>
      </div>
    );
  }

  const modelOptions = createUnifiedModelOptions(configuredProviders, modelsByProvider);

  const outputMax = Math.max(1, caps?.maxOutputs ?? 1);

  return (
    <ChatComposerShell
      mode="image"
      prompt={draft.prompt}
      onPromptChange={(p) => setDraft({ prompt: p })}
      onSubmit={() => void generate()}
      placeholder="Describe the image you want to generate"
      submitting={submitting}
      disabled={!draft.prompt.trim()}
      validationError={validationError}
      {...(draft.parentId ? { remixId: draft.parentId, onClearRemix: resetDraft } : {})}
    >
      <ProviderModelPicker
        mode="image"
        options={modelOptions}
        providerId={draft.providerId}
        modelId={draft.modelId}
        favoriteKeys={favoriteKeys}
        onToggleFavorite={toggleFavorite}
        onChange={(next) => setDraft({ providerId: next.providerId, modelId: next.modelId })}
      />

      {caps?.sizes && caps.sizes.length > 0 ? (
        <Select.Root
          value={draft.size ?? caps.sizes[0]}
          onValueChange={(v) => setDraft({ size: v })}
        >
          <ToolbarSelectTrigger
            ariaLabel="Size"
            icon={<Icons.SquaresFour weight="duotone" className="size-3.5" />}
            className="h-8 w-[132px] rounded-(--radius-pill) bg-(--bg) px-3 py-0 text-[12px]"
          />
          <Select.Content>
            {caps.sizes.map((s) => (
              <Select.Item key={s} value={s}>
                {s}
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
      ) : null}

      {caps?.aspectRatios && caps.aspectRatios.length > 0 ? (
        <Select.Root
          value={draft.aspectRatio ?? caps.aspectRatios[0]}
          onValueChange={(v) => setDraft({ aspectRatio: v })}
        >
          <ToolbarSelectTrigger
            ariaLabel="Aspect ratio"
            icon={<Icons.Image weight="duotone" className="size-3.5" />}
            className="h-8 w-[102px] rounded-(--radius-pill) bg-(--bg) px-3 py-0 text-[12px]"
          />
          <Select.Content>
            {caps.aspectRatios.map((s) => (
              <Select.Item key={s} value={s}>
                {s}
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
      ) : null}

      {caps?.qualities && caps.qualities.length > 0 ? (
        <Select.Root
          value={draft.quality ?? caps.qualities[0]}
          onValueChange={(v) => setDraft({ quality: v })}
        >
          <ToolbarSelectTrigger
            ariaLabel="Quality"
            icon={<Icons.Gear weight="duotone" className="size-3.5" />}
            className="h-8 w-[104px] rounded-(--radius-pill) bg-(--bg) px-3 py-0 text-[12px]"
          />
          <Select.Content>
            {caps.qualities.map((q) => (
              <Select.Item key={q} value={q}>
                {q}
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
      ) : null}

      {caps?.outputFormats && caps.outputFormats.length > 0 ? (
        <Select.Root
          value={draft.outputFormat ?? caps.outputFormats[0]}
          onValueChange={(v) => setDraft({ outputFormat: v })}
        >
          <ToolbarSelectTrigger
            ariaLabel="Format"
            icon={<Icons.Folder weight="duotone" className="size-3.5" />}
            className="h-8 w-[104px] rounded-(--radius-pill) bg-(--bg) px-3 py-0 text-[12px]"
          />
          <Select.Content>
            {caps.outputFormats.map((f) => (
              <Select.Item key={f} value={f}>
                {f}
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
      ) : null}

      {outputMax > 1 ? (
        <Select.Root
          value={String(draft.count)}
          onValueChange={(v) => setDraft({ count: Number.parseInt(v, 10) || 1 })}
        >
          <ToolbarSelectTrigger
            ariaLabel="Output count"
            icon={<Icons.SquaresFour weight="duotone" className="size-3.5" />}
            className="h-8 w-[86px] rounded-(--radius-pill) bg-(--bg) px-3 py-0 text-[12px]"
          />
          <Select.Content>
            {Array.from({ length: outputMax }, (_, i) => i + 1).map((count) => (
              <Select.Item key={count} value={String(count)}>
                {count}x
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
      ) : null}

      <ReferencePicker
        assetIds={draft.assetIds}
        assetsByKind={assetsByKind}
        references={draft.references}
        onAssetIdsChange={(assetIds) => setDraft({ assetIds })}
        onReferencesChange={(references) => setDraft({ references })}
        thumbnailUrl={(a) => resolveAssetThumbnailUrl(a)}
        maxReferencesHint={caps?.maxReferences}
        onRequestCreateAsset={() => navigate("assets")}
        onError={(message) =>
          pushToast({ title: "Reference failed", description: message, variant: "error" })
        }
      />
    </ChatComposerShell>
  );
}

/* ----- Video rail ------------------------------------------------------ */

function VideoRail() {
  const draft = useUIStore((s) => s.studioDraft.video);
  const setDraft = useUIStore((s) => s.setVideoDraft);
  const resetDraft = useUIStore((s) => s.resetVideoDraft);
  const navigate = useUIStore((s) => s.navigate);
  const pushToast = useUIStore((s) => s.pushToast);

  const summaries = useConfigStore((s) => s.summaries);
  const refreshConfig = useConfigStore((s) => s.refresh);

  const refreshGallery = useGalleryStore((s) => s.refresh);
  const items = useGalleryStore((s) => s.items);

  const assetsByKind = useAssetsStore((s) => s.byKind);
  const refreshAssets = useAssetsStore((s) => s.refresh);

  const [modelsByProvider, setModelsByProvider] = useState<Record<string, VideoModelDef[]>>({});
  const [submitting, setSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const { favoriteKeys, toggleFavorite } = useModelFavorites();

  const configuredVideoProviders = useMemo(
    () => summaries.filter((s) => s.configured && s.kinds.includes("video")),
    [summaries],
  );

  useEffect(() => {
    void refreshConfig();
    void refreshGallery();
    void refreshAssets();
  }, [refreshConfig, refreshGallery, refreshAssets]);

  useEffect(() => {
    if (configuredVideoProviders.length === 0) return;
    const first = configuredVideoProviders[0];
    if (!first) return;
    const defaultId =
      draft.providerId && configuredVideoProviders.some((p) => p.id === draft.providerId)
        ? (draft.providerId as ProviderId)
        : (first.id as ProviderId);
    if (draft.providerId !== defaultId) {
      setDraft({ providerId: defaultId });
    }
  }, [configuredVideoProviders, draft.providerId, setDraft]);

  useEffect(() => {
    if (configuredVideoProviders.length === 0) {
      setModelsByProvider({});
      return;
    }
    let cancelled = false;
    void (async () => {
      const nextModels: Record<string, VideoModelDef[]> = {};
      const nextDefaults: Record<string, string | null> = {};
      const failures: string[] = [];
      await Promise.all(
        configuredVideoProviders.map(async (provider) => {
          try {
            const r = await api["video.models"]({ providerId: provider.id as ProviderId });
            nextModels[provider.id] = r.models;
            nextDefaults[provider.id] = r.defaultModel;
          } catch (err) {
            failures.push(`${provider.displayName}: ${(err as Error)?.message ?? String(err)}`);
          }
        }),
      );
      if (cancelled) return;
      setModelsByProvider(nextModels);
      if (failures.length > 0) {
        pushToast({
          title: "Could not load some video models",
          description: failures.slice(0, 2).join("\n"),
          variant: "error",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [configuredVideoProviders, pushToast]);

  useEffect(() => {
    const activeProvider = draft.providerId || configuredVideoProviders[0]?.id;
    if (!activeProvider) return;
    const activeModels = modelsByProvider[activeProvider] ?? [];
    if (activeModels.length === 0 || activeModels.some((m) => m.id === draft.modelId)) return;
    const fallback = activeModels[0]?.id ?? "";
    if (fallback) {
      setDraft({ providerId: activeProvider, modelId: fallback });
    }
  }, [configuredVideoProviders, draft.modelId, draft.providerId, modelsByProvider, setDraft]);

  const selectedModel = useMemo(
    () => modelsByProvider[draft.providerId]?.find((m) => m.id === draft.modelId) ?? null,
    [modelsByProvider, draft.providerId, draft.modelId],
  );
  const caps = selectedModel?.capabilities;

  useEffect(() => {
    if (!caps) return;
    const patch: Partial<typeof draft> = {};
    if (caps.durationsSec && caps.durationsSec.length > 0) {
      if (!draft.durationSec || !caps.durationsSec.includes(draft.durationSec)) {
        const nearest = nearestNumber(caps.durationsSec, draft.durationSec ?? 5);
        patch.durationSec = nearest;
      }
    }
    if (caps.fpsOptions && caps.fpsOptions.length > 0) {
      if (!draft.fps || !caps.fpsOptions.includes(draft.fps)) {
        const nearest = nearestNumber(caps.fpsOptions, draft.fps ?? 24);
        patch.fps = nearest;
      }
    }
    if (caps.resolutions && caps.resolutions.length > 0) {
      if (!draft.resolution || !caps.resolutions.includes(draft.resolution)) {
        const firstResolution = caps.resolutions[0];
        if (firstResolution) patch.resolution = firstResolution;
      }
    }
    if (Object.keys(patch).length > 0) setDraft(patch);
  }, [caps, draft.durationSec, draft.fps, draft.resolution, setDraft]);

  const submit = async (): Promise<void> => {
    setValidationError(null);
    if (!draft.prompt.trim()) {
      setValidationError("Prompt is required.");
      return;
    }
    if (!draft.providerId || !draft.modelId) {
      setValidationError("Choose a provider and model first.");
      return;
    }

    const slotsHaveAny =
      (draft.assetIds.character.length ?? 0) +
        (draft.assetIds.object.length ?? 0) +
        (draft.assetIds.background.length ?? 0) +
        (draft.assetIds.style.length ?? 0) >
      0;

    const req: VideoRequest & {
      assetSlots?: {
        character?: string[];
        object?: string[];
        background?: string[];
        style?: string[];
      };
      parentId?: string;
    } = {
      prompt: draft.prompt.trim(),
      providerId: draft.providerId,
      model: draft.modelId,
      ...(typeof draft.durationSec === "number" ? { durationSec: draft.durationSec } : {}),
      ...(typeof draft.fps === "number" ? { fps: draft.fps } : {}),
      ...(typeof draft.resolution === "string" ? { resolution: draft.resolution } : {}),
      ...(typeof draft.aspectRatio === "string" ? { aspectRatio: draft.aspectRatio } : {}),
      ...(typeof draft.firstFrame === "string" ? { firstFrame: draft.firstFrame } : {}),
      references: draft.references.map((p) => ({ path: p, role: "freeform" as const })),
      assetIds: [],
      ...(draft.parentId ? { parentId: draft.parentId } : {}),
      ...(slotsHaveAny ? { assetSlots: draft.assetIds } : {}),
    };

    setSubmitting(true);
    try {
      await api["video.submit"](req);
      if (draft.parentId) setDraft({ parentId: undefined });
    } catch (err) {
      const msg =
        err instanceof IpcClientError ? `${err.message}` : ((err as Error)?.message ?? String(err));
      pushToast({
        title: "Video submit failed",
        description: msg,
        variant: "error",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (configuredVideoProviders.length === 0) {
    return (
      <div className="rounded-(--radius-md) border border-(--border) bg-(--surface-raised) p-4 text-center">
        <Icons.FilmReel weight="duotone" className="mx-auto size-8 text-(--text-muted)" />
        <h2 className="mt-2 text-[15px] font-semibold tracking-[-0.01em] text-(--text)">
          No video provider
        </h2>
        <p className="mt-1 text-[12px] text-(--text-muted)">
          Configure ByteDance to start generating videos.
        </p>
        <div className="mt-3 inline-flex">
          <Button size="sm" onClick={() => navigate("providers")}>
            Open Providers
          </Button>
        </div>
      </div>
    );
  }

  const modelOptions = createUnifiedModelOptions(configuredVideoProviders, modelsByProvider);

  return (
    <ChatComposerShell
      mode="video"
      prompt={draft.prompt}
      onPromptChange={(p) => setDraft({ prompt: p })}
      onSubmit={() => void submit()}
      placeholder="Describe the video you want to generate"
      submitting={submitting}
      disabled={!draft.prompt.trim()}
      validationError={validationError}
      {...(draft.parentId ? { remixId: draft.parentId, onClearRemix: resetDraft } : {})}
    >
      <ProviderModelPicker
        mode="video"
        options={modelOptions}
        providerId={draft.providerId}
        modelId={draft.modelId}
        favoriteKeys={favoriteKeys}
        onToggleFavorite={toggleFavorite}
        onChange={(next) => setDraft({ providerId: next.providerId, modelId: next.modelId })}
      />

      {caps?.durationsSec && caps.durationsSec.length > 0 ? (
        <Select.Root
          value={String(draft.durationSec ?? caps.durationsSec[0])}
          onValueChange={(v) => setDraft({ durationSec: Number.parseInt(v, 10) })}
        >
          <ToolbarSelectTrigger
            ariaLabel="Duration"
            icon={<Icons.FilmReel weight="duotone" className="size-3.5" />}
            className="h-8 w-[88px] rounded-(--radius-pill) bg-(--bg) px-3 py-0 text-[12px]"
          />
          <Select.Content>
            {caps.durationsSec.map((d) => (
              <Select.Item key={d} value={String(d)}>
                {d}s
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
      ) : null}

      {caps?.fpsOptions && caps.fpsOptions.length > 0 ? (
        <Select.Root
          value={String(draft.fps ?? caps.fpsOptions[0])}
          onValueChange={(v) => setDraft({ fps: Number.parseInt(v, 10) })}
        >
          <ToolbarSelectTrigger
            ariaLabel="FPS"
            icon={<Icons.FilmStrip weight="duotone" className="size-3.5" />}
            className="h-8 w-[86px] rounded-(--radius-pill) bg-(--bg) px-3 py-0 text-[12px]"
          />
          <Select.Content>
            {caps.fpsOptions.map((f) => (
              <Select.Item key={f} value={String(f)}>
                {f}
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
      ) : null}

      {caps?.resolutions && caps.resolutions.length > 0 ? (
        <Select.Root
          value={draft.resolution ?? caps.resolutions[0]}
          onValueChange={(v) => setDraft({ resolution: v })}
        >
          <ToolbarSelectTrigger
            ariaLabel="Resolution"
            icon={<Icons.VideoCamera weight="duotone" className="size-3.5" />}
            className="h-8 w-[116px] rounded-(--radius-pill) bg-(--bg) px-3 py-0 text-[12px]"
          />
          <Select.Content>
            {caps.resolutions.map((r) => (
              <Select.Item key={r} value={r}>
                {r}
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
      ) : null}

      {caps?.supportsFirstFrame ? (
        <FirstFrameToolbarPicker
          value={draft.firstFrame ?? null}
          onChange={(v) => setDraft({ firstFrame: v ?? undefined })}
          recentFrames={items.filter((it) => it.kind === "image").slice(0, 12)}
        />
      ) : null}

      <ReferencePicker
        assetIds={draft.assetIds}
        assetsByKind={assetsByKind}
        references={draft.references}
        onAssetIdsChange={(assetIds) => setDraft({ assetIds })}
        onReferencesChange={(references) => setDraft({ references })}
        thumbnailUrl={(a) => resolveAssetThumbnailUrl(a)}
        onRequestCreateAsset={() => navigate("assets")}
        onError={(message) =>
          pushToast({ title: "Reference failed", description: message, variant: "error" })
        }
      />
    </ChatComposerShell>
  );
}

/* -------------------------------------------------------------------------
 * Canvas — center column. Shows the most recent completed image/video for
 * the active mode + JobProgress at the footer when a job is running.
 * Clicking a thumbnail in the right rail loads it here.
 * ----------------------------------------------------------------------- */

function CanvasArea({ mode }: { mode: StudioMode }) {
  const items = useGalleryStore((s) => s.items);
  const activeJobId = useJobsStore((s) => s.activeJobId);
  const jobs = useJobsStore((s) => s.jobs);
  const cancelJob = useJobsStore((s) => s.cancel);
  const imageDraft = useUIStore((s) => s.studioDraft.image);
  const videoDraft = useUIStore((s) => s.studioDraft.video);

  const [pinnedId, setPinnedId] = useState<string | null>(null);

  // Surface a "pinned" item set by the right rail's onItemClick (we expose
  // it via window for cross-component nav without prop-drilling). Each rail
  // click writes a CustomEvent on the container and the canvas listens.
  useEffect(() => {
    const onPin = (e: Event): void => {
      const ce = e as CustomEvent<{ id: string }>;
      if (ce.detail?.id) setPinnedId(ce.detail.id);
    };
    window.addEventListener("imagine:canvas-pin", onPin as EventListener);
    return () => {
      window.removeEventListener("imagine:canvas-pin", onPin as EventListener);
    };
  }, []);

  const recent = useMemo(() => {
    return items.find((it) => it.kind === mode) ?? null;
  }, [items, mode]);

  const pinned = useMemo(() => {
    if (!pinnedId) return null;
    return items.find((it) => it.id === pinnedId) ?? null;
  }, [items, pinnedId]);

  const display = pinned ?? recent;

  const activeJob: Job | null =
    activeJobId && activeJobId !== "__pending__" ? (jobs[activeJobId] ?? null) : null;
  const submitting = activeJobId === "__pending__";

  const draftPrompt = mode === "image" ? imageDraft.prompt : videoDraft.prompt;
  const draftProvider = mode === "image" ? imageDraft.providerId : videoDraft.providerId;

  return (
    <section className="flex h-full flex-col bg-(--bg)">
      <div className="flex flex-1 items-center justify-center overflow-auto p-6">
        {submitting || activeJob ? (
          <div className="w-full max-w-3xl">
            <div
              className={
                "aspect-video w-full overflow-hidden rounded-(--radius-lg) " +
                "border border-(--border) bg-(--surface-sunken)"
              }
              role="status"
              aria-label="Generating..."
            >
              <div
                className={
                  "h-full w-full animate-pulse bg-gradient-to-br " +
                  "from-(--surface-sunken) via-(--surface) to-(--surface-sunken)"
                }
              />
            </div>
          </div>
        ) : display ? (
          <CanvasMedia item={display} />
        ) : (
          <EmptyCanvas mode={mode} />
        )}
      </div>

      {(submitting || activeJob) && draftProvider ? (
        <div className="border-t border-(--border) bg-(--surface) px-4 py-2">
          <JobProgress
            kind={mode}
            state={activeJob?.state ?? "running"}
            {...(typeof activeJob?.progress === "number" ? { progress: activeJob.progress } : {})}
            label={draftPrompt.slice(0, 60)}
            {...(activeJob?.errorMessage ? { errorMessage: activeJob.errorMessage } : {})}
            {...(activeJob && activeJob.id !== "__pending__"
              ? { onCancel: () => void cancelJob(activeJob.id) }
              : {})}
          />
        </div>
      ) : null}
    </section>
  );
}

function CanvasMedia({ item }: { item: GalleryItem }) {
  const url = resolveGalleryUrl(item.relPath);
  if (item.kind === "video") {
    return (
      // biome-ignore lint/a11y/useMediaCaption: Generated gallery videos do not have caption tracks.
      <video
        key={item.id}
        src={url}
        controls
        preload="metadata"
        className={
          "max-h-full max-w-full rounded-(--radius-lg) border border-(--border) " +
          "bg-black object-contain"
        }
      />
    );
  }
  return (
    <img
      key={item.id}
      src={url}
      alt={item.prompt}
      className={
        "max-h-full max-w-full rounded-(--radius-lg) border border-(--border) " + "object-contain"
      }
    />
  );
}

function EmptyCanvas({ mode }: { mode: StudioMode }) {
  const Icon = mode === "video" ? Icons.FilmReel : Icons.Image;
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <Icon weight="duotone" className="size-10 text-(--text-faint)" aria-hidden="true" />
      <p className="text-[12px] text-(--text-muted)">
        Your {mode === "video" ? "video" : "image"} will appear here.
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Right gallery rail — wraps GalleryRail with mode-specific filtering.
 * ----------------------------------------------------------------------- */

function StudioGalleryRail({ mode, onViewAll }: { mode: StudioMode; onViewAll: () => void }) {
  const items = useGalleryStore((s) => s.items);
  const refresh = useGalleryStore((s) => s.refresh);
  const [filter, setFilter] = useState<"all" | "newest">("all");

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filtered = useMemo(() => {
    const ofMode = items.filter((it) => it.kind === mode);
    if (filter === "newest") return ofMode.slice(0, 12);
    return ofMode.slice(0, 30);
  }, [items, mode, filter]);

  const railItems = useMemo<GalleryRailItem[]>(
    () =>
      filtered.map((it) => {
        const src =
          it.kind === "video"
            ? it.thumbPath
              ? resolveGalleryUrl(it.thumbPath)
              : ""
            : resolveGalleryUrl(it.relPath);
        return {
          id: it.id,
          src,
          ...(it.prompt ? { caption: it.prompt } : {}),
          kind: it.kind,
          favorited: it.favorited,
        };
      }),
    [filtered],
  );

  return (
    <GalleryRail
      items={railItems}
      filter={filter}
      onFilterChange={setFilter}
      onItemClick={(id) => {
        // Bubble a custom event the canvas listens for (parallel to props).
        window.dispatchEvent(
          new CustomEvent<{ id: string }>("imagine:canvas-pin", {
            detail: { id },
          }),
        );
      }}
      onViewAll={onViewAll}
    />
  );
}

/* -------------------------------------------------------------------------
 * Helpers (First-frame picker, autosize, gallery URL resolver)
 * ----------------------------------------------------------------------- */

function FirstFrameToolbarPicker({
  value,
  onChange,
  recentFrames,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  recentFrames: GalleryItem[];
}) {
  const onDrop = (e: DragEvent<HTMLElement>): void => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (!f) return;
    const p = (f as File & { path?: string }).path;
    if (typeof p === "string" && p.length > 0) onChange(p);
  };
  const label = value ? (value.split(/[\\/]/).pop() ?? value) : "First frame";

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={
            "inline-flex h-8 max-w-[152px] items-center gap-2 rounded-(--radius-pill) " +
            "border border-(--border) bg-(--bg) px-3 text-[11px] text-(--text) " +
            "transition-colors duration-(--motion-fast) hover:border-(--text) " +
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--focus-ring)"
          }
        >
          <Icons.Image weight="duotone" className="size-3.5 shrink-0" />
          <span className="truncate">{label}</span>
        </button>
      </Popover.Trigger>
      <Popover.Content className="w-[340px]">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[12px] font-semibold text-(--text)">First frame</span>
            {value ? (
              <Button size="sm" variant="ghost" onClick={() => onChange(null)}>
                Clear
              </Button>
            ) : null}
          </div>
          <button
            type="button"
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
            className={
              "flex min-h-16 w-full items-center justify-center rounded-(--radius-md) " +
              "border border-dashed border-(--border) bg-(--surface-sunken) " +
              "px-3 py-3 text-center text-[12px] text-(--text-muted)"
            }
          >
            {value ? <span className="truncate">{label}</span> : <span>Drop image here</span>}
          </button>
          {recentFrames.length === 0 ? (
            <div className="rounded-(--radius-md) border border-(--border-faint) px-3 py-4 text-center text-[12px] text-(--text-muted)">
              No recent images.
            </div>
          ) : (
            <div className="grid max-h-[220px] grid-cols-4 gap-1.5 overflow-y-auto">
              {recentFrames.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => onChange(it.relPath)}
                  title={it.prompt}
                  className={
                    "block aspect-square overflow-hidden rounded-(--radius-xs) " +
                    "border border-(--border) bg-(--surface-sunken) hover:border-(--border-strong) " +
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--focus-ring)"
                  }
                >
                  <img
                    src={resolveGalleryUrl(it.relPath)}
                    alt={it.prompt}
                    className="block h-full w-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      </Popover.Content>
    </Popover.Root>
  );
}

function autosizeComposer(el: HTMLTextAreaElement | null): void {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${Math.min(220, Math.max(104, el.scrollHeight))}px`;
}

function nearestNumber(allowed: readonly number[], target: number): number {
  if (allowed.length === 0) return target;
  const first = allowed[0];
  if (first === undefined) return target;
  let best = first;
  let bestDiff = Math.abs(first - target);
  for (const v of allowed) {
    const d = Math.abs(v - target);
    if (d < bestDiff) {
      best = v;
      bestDiff = d;
    }
  }
  return best;
}

/**
 * Build a renderer-loadable URL for a gallery rel-path. We can't use plain
 * `file://` URLs — Electron's web security blocks them when the renderer is
 * served over `http://localhost` (dev) or `file://app/...` (prod). The main
 * process registers an `imagine://local/...` scheme that maps back to the
 * data dir; this function just produces those URLs.
 */
function resolveGalleryUrl(relPath: string): string {
  const norm = relPath.replace(/\\/g, "/").replace(/^\/+/, "");
  const segments = norm.split("/").map(encodeURIComponent).join("/");
  return `imagine://local/${segments}`;
}

export { resolveGalleryUrl };
