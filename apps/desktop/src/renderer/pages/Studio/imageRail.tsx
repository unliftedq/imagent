import type { ImageModelCaps, ImageModelDef, ImageRequest } from "@imagent/core";
import type { ProviderId } from "@imagent/ipc";
import { Button, Icons, Popover, Select } from "@imagent/ui";
import { type KeyboardEvent, useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api.js";
import { useAssetsStore } from "../../state/useAssetsStore.js";
import { useConfigStore } from "../../state/useConfigStore.js";
import { useGalleryStore } from "../../state/useGalleryStore.js";
import { useJobsStore } from "../../state/useJobsStore.js";
import { useUIStore } from "../../state/useUIStore.js";
import { resolveAssetThumbnailUrl } from "../Assets";
import { ChatComposerShell, ToolbarSelectTrigger } from "./composer.js";
import {
  createUnifiedModelOptions,
  ProviderModelPicker,
  useModelFavorites,
} from "./modelPicker.js";
import { ReferencePicker } from "./referencePicker.js";
import { pruneReferenceRoles } from "./utils.js";

export function ImageRail() {
  const draft = useUIStore((state) => state.studioDraft.image);
  const setDraft = useUIStore((state) => state.setImageDraft);
  const resetDraft = useUIStore((state) => state.resetStudioDraft);
  const navigate = useUIStore((state) => state.navigate);
  const pushToast = useUIStore((state) => state.pushToast);

  const summaries = useConfigStore((state) => state.summaries);
  const appPrefs = useConfigStore((state) => state.appPrefs);
  const refreshConfig = useConfigStore((state) => state.refresh);

  const refreshGallery = useGalleryStore((state) => state.refresh);

  const assetsByKind = useAssetsStore((state) => state.byKind);
  const refreshAssets = useAssetsStore((state) => state.refresh);

  const trackStudioJob = useJobsStore((state) => state.trackStudioJob);

  const [modelsByProvider, setModelsByProvider] = useState<Record<string, ImageModelDef[]>>({});
  const [submitting, setSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const { favoriteKeys, toggleFavorite } = useModelFavorites();

  const configuredProviders = useMemo(
    () => summaries.filter((summary) => summary.configured),
    [summaries],
  );

  useEffect(() => {
    void refreshConfig();
    void refreshGallery();
    void refreshAssets();
  }, [refreshConfig, refreshGallery, refreshAssets]);

  useEffect(() => {
    if (configuredProviders.length === 0) return;
    if (
      draft.providerId &&
      configuredProviders.some((provider) => provider.id === draft.providerId)
    ) {
      return;
    }
    const defaultImageModel = appPrefs?.defaultImageModel;
    const first =
      defaultImageModel &&
      configuredProviders.find((provider) => provider.id === defaultImageModel.providerId)
        ? configuredProviders.find((provider) => provider.id === defaultImageModel.providerId)
        : configuredProviders[0];
    if (!first) return;
    setDraft({
      providerId: first.id,
      modelId:
        first.id === defaultImageModel?.providerId
          ? defaultImageModel.modelId
          : (first.defaultModel ?? first.modelIds[0] ?? ""),
    });
  }, [configuredProviders, appPrefs?.defaultImageModel, draft.providerId, setDraft]);

  useEffect(() => {
    if (configuredProviders.length === 0) {
      setModelsByProvider({});
      return;
    }
    let cancelled = false;
    void (async () => {
      const nextModels: Record<string, ImageModelDef[]> = {};
      const failures: string[] = [];
      await Promise.all(
        configuredProviders.map(async (provider) => {
          try {
            const response = await api["image.models"]({ providerId: provider.id as ProviderId });
            nextModels[provider.id] = response.models;
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
    if (activeModels.length === 0 || activeModels.some((model) => model.id === draft.modelId))
      return;
    const fallback = activeModels[0]?.id ?? "";
    if (fallback) {
      setDraft({ providerId: activeProvider, modelId: fallback });
    }
  }, [configuredProviders, draft.modelId, draft.providerId, modelsByProvider, setDraft]);

  const selectedModel = useMemo(
    () => modelsByProvider[draft.providerId]?.find((model) => model.id === draft.modelId) ?? null,
    [modelsByProvider, draft.providerId, draft.modelId],
  );
  const caps = selectedModel?.capabilities;
  const sizeConstraints = useMemo(() => customSizeConstraints(caps), [caps]);

  useEffect(() => {
    const presets = caps?.sizes ?? [];
    const allowArbitrary = caps?.supportsArbitrarySize === true;
    if (presets.length === 0 && !allowArbitrary) return;
    if (draft.size) {
      if (presets.includes(draft.size)) return;
      const dimensions = parseSizeDimensions(draft.size);
      if (allowArbitrary && dimensions && isCustomSizeAllowed(dimensions, sizeConstraints)) return;
    }
    if (presets.length > 0) {
      setDraft({ size: presets[0] });
    } else if (draft.size !== undefined) {
      setDraft({ size: undefined });
    }
  }, [caps?.sizes, caps?.supportsArbitrarySize, draft.size, setDraft, sizeConstraints]);

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

    const request: ImageRequest & {
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
      references: draft.references.map((path) => ({
        path,
        role: draft.referenceRoles[path] ?? ("freeform" as const),
      })),
      assetIds: [],
      ...(draft.parentId ? { parentId: draft.parentId } : {}),
      ...(slotsHaveAny ? { assetSlots: draft.assetIds } : {}),
    };

    setSubmitting(true);
    try {
      const { jobId } = await api["image.submit"](request);
      trackStudioJob({
        id: jobId,
        kind: "image",
        prompt: request.prompt,
        submittedAt: Date.now(),
      });
      setDraft({
        prompt: "",
        ...(draft.parentId ? { parentId: undefined } : {}),
      });
    } catch (err) {
      const message = (err as Error)?.message ?? String(err);
      // The cancel control surfaces its own info toast; don't double-up
      // with a "generation failed" error when the user explicitly stopped.
      if (/state '?cancelled'?/i.test(message) || /^cancelled$/i.test(message)) {
        return;
      }
      const providerLabel =
        configuredProviders.find((provider) => provider.id === draft.providerId)?.displayName ??
        draft.providerId;
      pushToast({
        title: `${providerLabel} generation failed`,
        description: message || "Provider returned no error message.",
        variant: "error",
      });
    } finally {
      setSubmitting(false);
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
      onPromptChange={(prompt) => setDraft({ prompt })}
      onSubmit={() => void generate()}
      placeholder="Describe the image you want to generate"
      submitting={submitting}
      disabled={!draft.prompt.trim()}
      validationError={validationError}
      {...(draft.parentId ? { remixId: draft.parentId, onClearRemix: resetDraft } : {})}
    >
      <ReferencePicker
        assetIds={draft.assetIds}
        assetsByKind={assetsByKind}
        references={draft.references}
        onAssetIdsChange={(assetIds) => setDraft({ assetIds })}
        onReferencesChange={(references) =>
          setDraft({
            references,
            referenceRoles: pruneReferenceRoles(draft.referenceRoles, references),
          })
        }
        thumbnailUrl={(asset) => resolveAssetThumbnailUrl(asset)}
        maxReferencesHint={caps?.maxReferences}
        onRequestCreateAsset={() => navigate("assets")}
        onError={(message) =>
          pushToast({ title: "Reference failed", description: message, variant: "error" })
        }
      />

      <ProviderModelPicker
        mode="image"
        options={modelOptions}
        providerId={draft.providerId}
        modelId={draft.modelId}
        favoriteKeys={favoriteKeys}
        onToggleFavorite={toggleFavorite}
        onChange={(next) => setDraft({ providerId: next.providerId, modelId: next.modelId })}
      />

      {(caps?.sizes && caps.sizes.length > 0) || caps?.supportsArbitrarySize ? (
        <SizePicker
          presets={caps?.sizes ?? []}
          value={draft.size}
          allowCustom={caps?.supportsArbitrarySize === true}
          constraints={sizeConstraints}
          onChange={(value) => setDraft({ size: value })}
        />
      ) : null}

      {caps?.aspectRatios && caps.aspectRatios.length > 0 ? (
        <Select.Root
          value={draft.aspectRatio ?? caps.aspectRatios[0]}
          onValueChange={(value) => setDraft({ aspectRatio: value })}
        >
          <ToolbarSelectTrigger
            ariaLabel="Aspect ratio"
            icon={<Icons.Crop weight="duotone" className="size-3.5" />}
            className="h-8 w-[102px] rounded-(--radius-pill) bg-(--bg) px-3 py-0 text-[12px]"
          />
          <Select.Content>
            {caps.aspectRatios.map((ratio) => (
              <Select.Item key={ratio} value={ratio}>
                {ratio}
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
      ) : null}

      {caps?.qualities && caps.qualities.length > 0 ? (
        <Select.Root
          value={draft.quality ?? caps.qualities[0]}
          onValueChange={(value) => setDraft({ quality: value })}
        >
          <ToolbarSelectTrigger
            ariaLabel="Quality"
            icon={<Icons.SealCheck weight="duotone" className="size-3.5" />}
            className="h-8 w-[104px] rounded-(--radius-pill) bg-(--bg) px-3 py-0 text-[12px]"
          />
          <Select.Content>
            {caps.qualities.map((quality) => (
              <Select.Item key={quality} value={quality}>
                {quality}
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
      ) : null}

      {caps?.outputFormats && caps.outputFormats.length > 0 ? (
        <Select.Root
          value={draft.outputFormat ?? caps.outputFormats[0]}
          onValueChange={(value) => setDraft({ outputFormat: value })}
        >
          <ToolbarSelectTrigger
            ariaLabel="Format"
            icon={<Icons.FileImage weight="duotone" className="size-3.5" />}
            className="h-8 w-[104px] rounded-(--radius-pill) bg-(--bg) px-3 py-0 text-[12px]"
          />
          <Select.Content>
            {caps.outputFormats.map((format) => (
              <Select.Item key={format} value={format}>
                {format}
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
      ) : null}

      {outputMax > 1 ? (
        <Select.Root
          value={String(draft.count)}
          onValueChange={(value) => setDraft({ count: Number.parseInt(value, 10) || 1 })}
        >
          <ToolbarSelectTrigger
            ariaLabel="Output count"
            icon={<Icons.StackPlus weight="duotone" className="size-3.5" />}
            className="h-8 w-[86px] rounded-(--radius-pill) bg-(--bg) px-3 py-0 text-[12px]"
          />
          <Select.Content>
            {Array.from({ length: outputMax }, (_, index) => index + 1).map((count) => (
              <Select.Item key={count} value={String(count)}>
                {count}x
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
      ) : null}
    </ChatComposerShell>
  );
}

function parseCustomSize(value: string | undefined): { w: string; h: string } | null {
  if (!value) return null;
  const match = /^(\d+)x(\d+)$/.exec(value);
  if (!match) return null;
  return { w: match[1] ?? "", h: match[2] ?? "" };
}

function parseSizeDimensions(value: string | undefined): { width: number; height: number } | null {
  const parts = parseCustomSize(value);
  if (!parts) return null;
  return { width: Number(parts.w), height: Number(parts.h) };
}

const DIMENSION_MIN = 256;
const DIMENSION_MAX = 4096;
const DIMENSION_DEFAULT = 1024;
const ASPECT_RATIO_EPSILON = 0.0001;
// Catalog stores OpenAI's custom-size ratio bounds numerically; show the
// familiar ratio labels for those bounds instead of decimal approximations.
const MIN_FORMATTED_ASPECT_RATIO = 1 / 3;
const MAX_FORMATTED_ASPECT_RATIO = 3;

function SizePicker({
  presets,
  value,
  allowCustom,
  constraints,
  onChange,
}: {
  presets: readonly string[];
  value: string | undefined;
  allowCustom: boolean;
  constraints: CustomSizeConstraints;
  onChange: (next: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const isPreset = !!value && presets.includes(value);
  const customParts = !isPreset ? parseCustomSize(value) : null;
  const isCustom = customParts !== null;

  const [w, setW] = useState(customParts?.w ?? String(DIMENSION_DEFAULT));
  const [h, setH] = useState(customParts?.h ?? String(DIMENSION_DEFAULT));
  const [error, setError] = useState<string | null>(null);

  // Sync inputs whenever the popover opens or the underlying value changes.
  useEffect(() => {
    if (!open) return;
    setW(customParts?.w ?? String(DIMENSION_DEFAULT));
    setH(customParts?.h ?? String(DIMENSION_DEFAULT));
    setError(null);
  }, [open, customParts?.w, customParts?.h]);

  const display = value ?? presets[0] ?? "Size";
  const hint = customSizeHint(constraints);

  const applyCustom = (): void => {
    if (!w.trim() || !h.trim()) {
      setError("Width and height are required.");
      return;
    }
    const wNum = Number(w);
    const hNum = Number(h);
    if (!Number.isFinite(wNum) || !Number.isFinite(hNum)) {
      setError("Width and height must be numbers.");
      return;
    }
    if (!Number.isInteger(wNum) || wNum <= 0 || !Number.isInteger(hNum) || hNum <= 0) {
      setError("Width and height must be positive integers.");
      return;
    }
    const validationError = validateCustomSize(wNum, hNum, constraints);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    onChange(`${wNum}x${hNum}`);
    setOpen(false);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === "Enter") {
      e.preventDefault();
      applyCustom();
    }
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label="Size"
          className={
            "flex h-8 w-[132px] items-center justify-between gap-2 rounded-(--radius-pill) " +
            "border border-(--border) bg-(--bg) px-3 py-0 text-[12px] text-(--text) " +
            "transition-colors duration-(--duration-fast) " +
            "hover:border-(--text-muted) " +
            "focus-visible:outline-none focus:border-(--text) " +
            "data-[state=open]:border-(--text)"
          }
        >
          <span className="flex min-w-0 items-center gap-1.5">
            <Icons.FrameCorners
              weight="duotone"
              className="size-3.5 shrink-0 text-(--text-muted)"
            />
            <span className="truncate">{display}</span>
          </span>
          <Icons.CaretDown weight="bold" className="size-3 shrink-0 text-(--text-muted)" />
        </button>
      </Popover.Trigger>
      <Popover.Content align="start" className="w-[280px] p-2">
        {presets.length > 0 ? (
          <div className="flex flex-col gap-0.5" role="listbox" aria-label="Preset sizes">
            {presets.map((preset) => {
              const selected = preset === value;
              return (
                <button
                  key={preset}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => {
                    onChange(preset);
                    setOpen(false);
                  }}
                  className={
                    "flex h-8 items-center justify-between rounded-(--radius-sm) px-2 " +
                    "text-[12px] text-(--text) hover:bg-(--surface) " +
                    "focus-visible:outline-none focus-visible:bg-(--surface)"
                  }
                >
                  <span>{preset}</span>
                  {selected ? <Icons.Check weight="bold" className="size-3.5" /> : null}
                </button>
              );
            })}
          </div>
        ) : null}
        {allowCustom ? (
          <>
            {presets.length > 0 ? <div className="my-2 h-px bg-(--border)" /> : null}
            <div className="flex flex-col gap-2 px-1 pb-1 pt-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-(--text-muted)">
                  Custom size (px)
                </span>
                {isCustom ? <Icons.Check weight="bold" className="size-3.5 text-(--text)" /> : null}
              </div>
              <span className="text-[10px] leading-4 text-(--text-faint)">{hint}</span>
              <DimensionRow
                label="Width"
                value={w}
                constraints={constraints.width}
                onChange={setW}
                onKeyDown={handleKeyDown}
              />
              <DimensionRow
                label="Height"
                value={h}
                constraints={constraints.height}
                onChange={setH}
                onKeyDown={handleKeyDown}
              />
              {error ? (
                <span className="text-[11px] text-(--danger)" role="alert">
                  {error}
                </span>
              ) : null}
              <Button
                size="sm"
                variant="secondary"
                onClick={applyCustom}
                disabled={!w.trim() || !h.trim()}
              >
                Apply
              </Button>
            </div>
          </>
        ) : null}
      </Popover.Content>
    </Popover.Root>
  );
}

interface DimensionConstraints {
  min: number;
  max: number;
  step: number;
}

interface CustomSizeConstraints {
  width: DimensionConstraints;
  height: DimensionConstraints;
  maxPixels?: number;
  minAspectRatio?: number;
  maxAspectRatio?: number;
}

function customSizeConstraints(caps: ImageModelCaps | undefined): CustomSizeConstraints {
  return {
    width: {
      min: caps?.minWidth ?? DIMENSION_MIN,
      max: caps?.maxWidth ?? DIMENSION_MAX,
      step: caps?.widthMultiple ?? 1,
    },
    height: {
      min: caps?.minHeight ?? DIMENSION_MIN,
      max: caps?.maxHeight ?? DIMENSION_MAX,
      step: caps?.heightMultiple ?? 1,
    },
    ...(caps?.maxPixels !== undefined ? { maxPixels: caps.maxPixels } : {}),
    ...(caps?.minAspectRatio !== undefined ? { minAspectRatio: caps.minAspectRatio } : {}),
    ...(caps?.maxAspectRatio !== undefined ? { maxAspectRatio: caps.maxAspectRatio } : {}),
  };
}

function isCustomSizeAllowed(
  dimensions: { width: number; height: number },
  constraints: CustomSizeConstraints,
): boolean {
  return validateCustomSize(dimensions.width, dimensions.height, constraints) === null;
}

function validateCustomSize(
  width: number,
  height: number,
  constraints: CustomSizeConstraints,
): string | null {
  if (width <= 0) {
    return "Width must be greater than 0.";
  }
  if (height <= 0) {
    return "Height must be greater than 0.";
  }
  if (width < constraints.width.min || width > constraints.width.max) {
    return `Width must be between ${constraints.width.min} and ${constraints.width.max}.`;
  }
  if (height < constraints.height.min || height > constraints.height.max) {
    return `Height must be between ${constraints.height.min} and ${constraints.height.max}.`;
  }
  if (constraints.width.step > 1 && width % constraints.width.step !== 0) {
    return `Width must be a multiple of ${constraints.width.step}.`;
  }
  if (constraints.height.step > 1 && height % constraints.height.step !== 0) {
    return `Height must be a multiple of ${constraints.height.step}.`;
  }
  if (constraints.maxPixels !== undefined && width * height > constraints.maxPixels) {
    return `Width × height must be at most ${constraints.maxPixels.toLocaleString()} pixels.`;
  }

  const aspectRatio = width / height;
  if (
    constraints.minAspectRatio !== undefined &&
    aspectRatio + ASPECT_RATIO_EPSILON < constraints.minAspectRatio
  ) {
    return `Aspect ratio must be at least ${formatAspectRatio(constraints.minAspectRatio)}.`;
  }
  if (
    constraints.maxAspectRatio !== undefined &&
    aspectRatio - ASPECT_RATIO_EPSILON > constraints.maxAspectRatio
  ) {
    return `Aspect ratio must be at most ${formatAspectRatio(constraints.maxAspectRatio)}.`;
  }
  return null;
}

function customSizeHint(constraints: CustomSizeConstraints): string {
  const width = `${constraints.width.min} to ${constraints.width.max}`;
  const height = `${constraints.height.min} to ${constraints.height.max}`;
  const widthStep = constraints.width.step > 1 ? `, step ${constraints.width.step}` : "";
  const heightStep = constraints.height.step > 1 ? `, step ${constraints.height.step}` : "";
  return `Width ${width}${widthStep}; height ${height}${heightStep}.`;
}

function formatAspectRatio(value: number): string {
  if (Math.abs(value - MIN_FORMATTED_ASPECT_RATIO) < ASPECT_RATIO_EPSILON) return "1:3";
  if (Math.abs(value - MAX_FORMATTED_ASPECT_RATIO) < ASPECT_RATIO_EPSILON) return "3:1";
  return value.toFixed(2);
}

function DimensionRow({
  label,
  value,
  constraints,
  onChange,
  onKeyDown,
}: {
  label: string;
  value: string;
  constraints: DimensionConstraints;
  onChange: (next: string) => void;
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
}) {
  const numeric = Number.parseInt(value, 10);
  const sliderValue = Number.isFinite(numeric)
    ? Math.min(constraints.max, Math.max(constraints.min, numeric))
    : constraints.min;

  return (
    <div className="flex items-center gap-2">
      <label
        className="w-11 shrink-0 text-[11px] font-medium text-(--text-muted)"
        htmlFor={`size-${label.toLowerCase()}-input`}
      >
        {label}
      </label>
      <input
        type="range"
        min={constraints.min}
        max={constraints.max}
        step={constraints.step}
        value={sliderValue}
        onChange={(e) => onChange(e.target.value)}
        aria-label={`${label} slider`}
        className={
          "h-1 flex-1 cursor-ew-resize appearance-none rounded-full bg-(--surface) " +
          "accent-(--accent) " +
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/40"
        }
      />
      <input
        id={`size-${label.toLowerCase()}-input`}
        type="number"
        min={constraints.min}
        max={constraints.max}
        step={constraints.step}
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={String(DIMENSION_DEFAULT)}
        aria-label={label}
        className={
          "h-7 w-14 shrink-0 rounded-(--radius-sm) border border-(--border) bg-(--bg) " +
          "px-1.5 text-right text-[12px] tabular-nums text-(--text) " +
          "placeholder:text-(--text-faint) " +
          "focus-visible:outline-none focus:border-(--text) " +
          "[&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        }
      />
    </div>
  );
}
