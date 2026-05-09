import type { VideoModelDef, VideoRequest } from "@imagent/core";
import type { ProviderId } from "@imagent/ipc";
import { IpcClientError } from "@imagent/ipc";
import { Button, Icons, Select } from "@imagent/ui";
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
import { nearestNumber, pruneReferenceRoles } from "./utils.js";
import { FirstFrameToolbarPicker } from "./videoFirstFramePicker.js";

export function VideoRail() {
  const draft = useUIStore((state) => state.studioDraft.video);
  const setDraft = useUIStore((state) => state.setVideoDraft);
  const resetDraft = useUIStore((state) => state.resetVideoDraft);
  const navigate = useUIStore((state) => state.navigate);
  const pushToast = useUIStore((state) => state.pushToast);

  const summaries = useConfigStore((state) => state.summaries);
  const refreshConfig = useConfigStore((state) => state.refresh);

  const refreshGallery = useGalleryStore((state) => state.refresh);
  const items = useGalleryStore((state) => state.items);

  const assetsByKind = useAssetsStore((state) => state.byKind);
  const refreshAssets = useAssetsStore((state) => state.refresh);

  const trackStudioJob = useJobsStore((state) => state.trackStudioJob);

  const [modelsByProvider, setModelsByProvider] = useState<Record<string, VideoModelDef[]>>({});
  const [submitting, setSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const { favoriteKeys, toggleFavorite } = useModelFavorites();

  const configuredVideoProviders = useMemo(
    () => summaries.filter((summary) => summary.configured && summary.kinds.includes("video")),
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
      draft.providerId &&
      configuredVideoProviders.some((provider) => provider.id === draft.providerId)
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
      const failures: string[] = [];
      await Promise.all(
        configuredVideoProviders.map(async (provider) => {
          try {
            const response = await api["video.models"]({ providerId: provider.id as ProviderId });
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
    if (activeModels.length === 0 || activeModels.some((model) => model.id === draft.modelId))
      return;
    const fallback = activeModels[0]?.id ?? "";
    if (fallback) {
      setDraft({ providerId: activeProvider, modelId: fallback });
    }
  }, [configuredVideoProviders, draft.modelId, draft.providerId, modelsByProvider, setDraft]);

  const selectedModel = useMemo(
    () => modelsByProvider[draft.providerId]?.find((model) => model.id === draft.modelId) ?? null,
    [modelsByProvider, draft.providerId, draft.modelId],
  );
  const caps = selectedModel?.capabilities;

  useEffect(() => {
    if (!caps) return;
    const patch: Partial<typeof draft> = {};
    if (caps.durationsSec && caps.durationsSec.length > 0) {
      if (!draft.durationSec || !caps.durationsSec.includes(draft.durationSec)) {
        patch.durationSec = nearestNumber(caps.durationsSec, draft.durationSec ?? 5);
      }
    }
    if (caps.fpsOptions && caps.fpsOptions.length > 0) {
      if (!draft.fps || !caps.fpsOptions.includes(draft.fps)) {
        patch.fps = nearestNumber(caps.fpsOptions, draft.fps ?? 24);
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

    const request: VideoRequest & {
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
      const { jobId } = await api["video.submit"](request);
      trackStudioJob({
        id: jobId,
        kind: "video",
        prompt: request.prompt,
        submittedAt: Date.now(),
      });
      setDraft({
        prompt: "",
        ...(draft.parentId ? { parentId: undefined } : {}),
      });
    } catch (err) {
      const message =
        err instanceof IpcClientError ? `${err.message}` : ((err as Error)?.message ?? String(err));
      pushToast({
        title: "Video submit failed",
        description: message,
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
      onPromptChange={(prompt) => setDraft({ prompt })}
      onSubmit={() => void submit()}
      placeholder="Describe the video you want to generate"
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
        onRequestCreateAsset={() => navigate("assets")}
        onError={(message) =>
          pushToast({ title: "Reference failed", description: message, variant: "error" })
        }
      />

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
          onValueChange={(value) => setDraft({ durationSec: Number.parseInt(value, 10) })}
        >
          <ToolbarSelectTrigger
            ariaLabel="Duration"
            icon={<Icons.Timer weight="duotone" className="size-3.5" />}
            className="h-8 w-[88px] rounded-(--radius-pill) bg-(--bg) px-3 py-0 text-[12px]"
          />
          <Select.Content>
            {caps.durationsSec.map((duration) => (
              <Select.Item key={duration} value={String(duration)}>
                {duration}s
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
      ) : null}

      {caps?.fpsOptions && caps.fpsOptions.length > 0 ? (
        <Select.Root
          value={String(draft.fps ?? caps.fpsOptions[0])}
          onValueChange={(value) => setDraft({ fps: Number.parseInt(value, 10) })}
        >
          <ToolbarSelectTrigger
            ariaLabel="FPS"
            icon={<Icons.Speedometer weight="duotone" className="size-3.5" />}
            className="h-8 w-[86px] rounded-(--radius-pill) bg-(--bg) px-3 py-0 text-[12px]"
          />
          <Select.Content>
            {caps.fpsOptions.map((fps) => (
              <Select.Item key={fps} value={String(fps)}>
                {fps}
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
      ) : null}

      {caps?.resolutions && caps.resolutions.length > 0 ? (
        <Select.Root
          value={draft.resolution ?? caps.resolutions[0]}
          onValueChange={(value) => setDraft({ resolution: value })}
        >
          <ToolbarSelectTrigger
            ariaLabel="Resolution"
            icon={<Icons.Monitor weight="duotone" className="size-3.5" />}
            className="h-8 w-[116px] rounded-(--radius-pill) bg-(--bg) px-3 py-0 text-[12px]"
          />
          <Select.Content>
            {caps.resolutions.map((resolution) => (
              <Select.Item key={resolution} value={resolution}>
                {resolution}
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
      ) : null}

      {caps?.supportsFirstFrame ? (
        <FirstFrameToolbarPicker
          value={draft.firstFrame ?? null}
          onChange={(value) => setDraft({ firstFrame: value ?? undefined })}
          recentFrames={items.filter((item) => item.kind === "image").slice(0, 12)}
        />
      ) : null}
    </ChatComposerShell>
  );
}
