import type { ImageModelDef, ImageRequest } from "@imagent/core";
import type { ProviderId } from "@imagent/ipc";
import { Button, Icons, Input, Select } from "@imagent/ui";
import { useEffect, useMemo, useState } from "react";
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

const CUSTOM_SIZE_SELECT_VALUE = "__custom_size__";

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
  const upsertOne = useGalleryStore((state) => state.upsertOne);

  const assetsByKind = useAssetsStore((state) => state.byKind);
  const refreshAssets = useAssetsStore((state) => state.refresh);

  const setActiveJobId = useJobsStore((state) => state.setActiveJobId);

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
    const first =
      appPrefs?.defaultProvider &&
      configuredProviders.find((provider) => provider.id === appPrefs.defaultProvider)
        ? configuredProviders.find((provider) => provider.id === appPrefs.defaultProvider)
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
  const supportsCustomSize = caps?.supportsArbitrarySize === true;
  const sizeOptions = useMemo(() => caps?.sizes ?? [], [caps?.sizes]);
  const selectedFixedSize = draft.size && sizeOptions.includes(draft.size) ? draft.size : undefined;
  const customSizeValue = draft.size && !selectedFixedSize ? draft.size : "";

  useEffect(() => {
    if (sizeOptions.length === 0) return;
    if (draft.size) {
      if (sizeOptions.includes(draft.size)) return;
      if (supportsCustomSize) return;
    }
    setDraft({ size: sizeOptions[0] });
  }, [draft.size, setDraft, sizeOptions, supportsCustomSize]);

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
    if (
      draft.size &&
      supportsCustomSize &&
      !sizeOptions.includes(draft.size) &&
      !/^\d+x\d+$/.test(draft.size)
    ) {
      setValidationError("Custom size must use WIDTHxHEIGHT format, for example 1024x768.");
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
    setActiveJobId("__pending__");
    try {
      const item = await api["image.generate"](request);
      upsertOne(item);
      window.dispatchEvent(
        new CustomEvent<{ id: string }>("imagent:canvas-pin", {
          detail: { id: item.id },
        }),
      );
      if (draft.parentId) setDraft({ parentId: undefined });
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

      {sizeOptions.length > 0 ? (
        <Select.Root
          value={
            customSizeValue && supportsCustomSize
              ? CUSTOM_SIZE_SELECT_VALUE
              : (selectedFixedSize ?? sizeOptions[0])
          }
          onValueChange={(value) => {
            if (value !== CUSTOM_SIZE_SELECT_VALUE) setDraft({ size: value });
          }}
        >
          <ToolbarSelectTrigger
            ariaLabel="Size"
            icon={<Icons.FrameCorners weight="duotone" className="size-3.5" />}
            className="h-8 w-[132px] rounded-(--radius-pill) bg-(--bg) px-3 py-0 text-[12px]"
          />
          <Select.Content>
            {customSizeValue && supportsCustomSize ? (
              <Select.Item value={CUSTOM_SIZE_SELECT_VALUE}>Custom</Select.Item>
            ) : null}
            {sizeOptions.map((size) => (
              <Select.Item key={size} value={size}>
                {size}
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
      ) : null}

      {supportsCustomSize ? (
        <div className="relative">
          <Icons.FrameCorners
            weight="duotone"
            className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-(--text-muted)"
          />
          <Input
            aria-label="Custom size"
            value={draft.size ?? ""}
            onChange={(event) => setDraft({ size: event.target.value.trim() || undefined })}
            placeholder="WIDTHxHEIGHT"
            className="h-8 w-[144px] rounded-(--radius-pill) py-0 pl-8 pr-3 text-[12px]"
          />
        </div>
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
