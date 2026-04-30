import { useEffect, useMemo, useState } from "react";
import {
  Button,
  GalleryRail,
  Icons,
  JobProgress,
  ModelSelect,
  PromptComposer,
  Select,
  Tabs,
  type GalleryRailItem,
  type ResolvedModelOption,
} from "@imagine/ui";
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
import type { ProviderId } from "@imagine/ipc";
import { IpcClientError } from "@imagine/ipc";
import { api } from "../lib/api.js";
import { useAssetsStore } from "../state/useAssetsStore.js";
import { useConfigStore } from "../state/useConfigStore.js";
import { useGalleryStore } from "../state/useGalleryStore.js";
import { useJobsStore } from "../state/useJobsStore.js";
import { useUIStore, type StudioMode } from "../state/useUIStore.js";
import { resolveAssetThumbnailUrl } from "./Assets.js";

/**
 * Unified Studio page (DESIGN.md §11.1).
 *
 *   ┌──────────────┬──────────────────────────┬─────────────────┐
 *   │ ParamsRail   │  Canvas + JobProgress    │  GalleryRail    │
 *   │ 280px        │  (fluid)                 │  240px           │
 *   │              │                          │                  │
 *   │ Image|Video  │  [active job result      │  All|Newest     │
 *   │ tabs at top  │   or last completed      │                  │
 *   │              │   in preview]            │  recent items   │
 *   └──────────────┴──────────────────────────┴─────────────────┘
 *
 * The `Image | Video` tab strip lives at the top of the rail and drives
 * `useUIStore.studioMode`. The Settings block, Generate button label,
 * and submit semantics rewire on mode switch; the rest of the rail is
 * mode-invariant.
 */
export function StudioPage() {
  const studioMode = useUIStore((s) => s.studioMode);
  const setStudioMode = useUIStore((s) => s.setStudioMode);
  const navigate = useUIStore((s) => s.navigate);

  return (
    <div
      className="grid h-full w-full"
      style={{
        gridTemplateColumns:
          "var(--rail-params, 280px) minmax(0, 1fr) var(--rail-gallery, 240px)",
      }}
    >
      <ParamsRail mode={studioMode} onModeChange={setStudioMode} />
      <CanvasArea mode={studioMode} />
      <StudioGalleryRail mode={studioMode} onViewAll={() => navigate("gallery")} />
    </div>
  );
}

/* -------------------------------------------------------------------------
 * ParamsRail — 280px left rail. Provider + Model + PromptComposer + asset
 * pickers + mode-specific Settings block + Generate button.
 * ----------------------------------------------------------------------- */

function ParamsRail({
  mode,
  onModeChange,
}: {
  mode: StudioMode;
  onModeChange: (m: StudioMode) => void;
}) {
  return (
    <aside className="flex h-full flex-col border-r border-(--border) bg-(--surface)">
      <Tabs.Root
        value={mode}
        onValueChange={(v: string) => onModeChange(v as StudioMode)}
        className="flex h-full flex-col"
      >
        <Tabs.ListUnderline className="shrink-0">
          <Tabs.TriggerUnderline value="image">Image</Tabs.TriggerUnderline>
          <Tabs.TriggerUnderline value="video">Video</Tabs.TriggerUnderline>
        </Tabs.ListUnderline>
        <div className="flex-1 overflow-y-auto px-3 py-3">
          <Tabs.Content value="image" className="outline-none">
            <ImageRail />
          </Tabs.Content>
          <Tabs.Content value="video" className="outline-none">
            <VideoRail />
          </Tabs.Content>
        </div>
      </Tabs.Root>
    </aside>
  );
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

  const [models, setModels] = useState<ImageModelDef[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const configuredProviders = useMemo(
    () => summaries.filter((s) => s.configured),
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
      configuredProviders.some((p) => p.id === draft.providerId)
    ) {
      return;
    }
    const defaultId =
      appPrefs?.defaultProvider &&
      configuredProviders.find((p) => p.id === appPrefs.defaultProvider)
        ? (appPrefs.defaultProvider as ProviderId)
        : configuredProviders[0]!.id;
    const first = configuredProviders.find((p) => p.id === defaultId)!;
    setDraft({
      providerId: first.id,
      modelId: first.defaultModel ?? first.modelIds[0] ?? "",
    });
  }, [configuredProviders, appPrefs?.defaultProvider, draft.providerId, setDraft]);

  useEffect(() => {
    if (!draft.providerId) {
      setModels([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const r = await api["image.models"]({
          providerId: draft.providerId as ProviderId,
        });
        if (cancelled) return;
        setModels(r.models);
        if (!r.models.some((m) => m.id === draft.modelId)) {
          const fallback = r.defaultModel ?? r.models[0]?.id ?? "";
          if (fallback) setDraft({ modelId: fallback });
        }
      } catch (err) {
        if (!cancelled) {
          pushToast({
            title: "Could not load models",
            description: (err as Error)?.message ?? String(err),
            variant: "error",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.providerId]);

  const selectedModel = useMemo(
    () => models.find((m) => m.id === draft.modelId) ?? null,
    [models, draft.modelId],
  );
  const caps = selectedModel?.capabilities;

  useEffect(() => {
    if (!caps?.sizes || caps.sizes.length === 0) return;
    if (draft.size && caps.sizes.includes(draft.size)) return;
    setDraft({ size: caps.sizes[0] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caps?.sizes?.join(",")]);

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
        (selectedModel?.defaults as { quality?: string } | undefined)?.quality ??
        supported[0];
      setDraft({ quality: fallback });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caps?.qualities?.join(","), draft.modelId]);

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
    if (
      caps?.maxOutputs &&
      typeof draft.count === "number" &&
      draft.count > caps.maxOutputs
    ) {
      setValidationError(
        `Model accepts at most ${caps.maxOutputs} outputs (got ${draft.count}).`,
      );
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
      const msg =
        err instanceof IpcClientError
          ? `${err.message}`
          : (err as Error)?.message ?? String(err);
      pushToast({
        title: "Generate failed",
        description: msg,
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
        <Icons.Plug
          weight="duotone"
          className="mx-auto size-8 text-(--text-muted)"
        />
        <h2 className="mt-2 text-[15px] font-semibold tracking-[-0.01em] text-(--text)">
          No providers
        </h2>
        <p className="mt-1 text-[12px] text-(--text-muted)">
          Add an API key to start generating.
        </p>
        <div className="mt-3 inline-flex">
          <Button size="sm" onClick={() => navigate("providers")}>
            Open Providers
          </Button>
        </div>
      </div>
    );
  }

  const modelOptions: ResolvedModelOption[] = models.map((m) => ({
    id: m.id,
    displayName: m.displayName ?? null,
    capabilities: m.capabilities,
  }));

  return (
    <div className="flex flex-col gap-3">
      {draft.parentId ? (
        <span
          className={
            "inline-flex w-fit items-center gap-1 rounded-(--radius-xs) " +
            "bg-(--accent-soft) px-2 py-0.5 text-[11px] text-(--accent)"
          }
        >
          remix of {draft.parentId.slice(0, 8)}…
        </span>
      ) : null}

      <Field label="Provider">
        <Select.Root
          value={draft.providerId}
          onValueChange={(v) => setDraft({ providerId: v as ProviderId })}
        >
          <Select.Trigger>
            <Select.Value />
          </Select.Trigger>
          <Select.Content>
            {configuredProviders.map((p) => (
              <Select.Item key={p.id} value={p.id}>
                {p.displayName}
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
      </Field>

      <Field label="Model">
        <ModelSelect
          models={modelOptions}
          value={draft.modelId}
          onChange={(id) => setDraft({ modelId: id })}
          disabled={modelOptions.length === 0}
        />
      </Field>

      <PromptComposer
        prompt={draft.prompt}
        onPromptChange={(p) => setDraft({ prompt: p })}
        onSubmit={() => void generate()}
        showCharCount
        enableAssetPicker
        assets={{ byKind: assetsByKind }}
        selectedAssetIds={draft.assetIds}
        onAssetIdsChange={(next) => setDraft({ assetIds: next })}
        thumbnailUrl={(a: Asset) => resolveAssetThumbnailUrl(a)}
        {...(caps?.maxReferences !== undefined
          ? { maxReferencesHint: caps.maxReferences }
          : {})}
        onRequestCreateAsset={(_kind: AssetKind) => navigate("assets")}
      />

      {/* Image Settings */}
      <SettingsHeading>Image Settings</SettingsHeading>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Size">
          {caps?.sizes && caps.sizes.length > 0 ? (
            <Select.Root
              value={draft.size ?? caps.sizes[0]}
              onValueChange={(v) => setDraft({ size: v })}
            >
              <Select.Trigger>
                <Select.Value />
              </Select.Trigger>
              <Select.Content>
                {caps.sizes.map((s) => (
                  <Select.Item key={s} value={s}>
                    {s}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select.Root>
          ) : (
            <span className="text-[11px] text-(--text-muted)">
              Free-form
            </span>
          )}
        </Field>
        {caps?.aspectRatios && caps.aspectRatios.length > 0 ? (
          <Field label="Aspect">
            <Select.Root
              value={draft.aspectRatio ?? caps.aspectRatios[0]}
              onValueChange={(v) => setDraft({ aspectRatio: v })}
            >
              <Select.Trigger>
                <Select.Value />
              </Select.Trigger>
              <Select.Content>
                {caps.aspectRatios.map((s) => (
                  <Select.Item key={s} value={s}>
                    {s}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select.Root>
          </Field>
        ) : null}
      </div>
      {caps?.qualities && caps.qualities.length > 0 ? (
        <Field label="Quality">
          <Select.Root
            value={draft.quality ?? caps.qualities[0]}
            onValueChange={(v) => setDraft({ quality: v })}
          >
            <Select.Trigger>
              <Select.Value />
            </Select.Trigger>
            <Select.Content>
              {caps.qualities.map((q) => (
                <Select.Item key={q} value={q}>
                  {q}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
        </Field>
      ) : null}
      <Field label={`Count (max ${caps?.maxOutputs ?? 1})`}>
        <input
          type="range"
          min={1}
          max={Math.max(1, caps?.maxOutputs ?? 1)}
          value={draft.count}
          onChange={(e) =>
            setDraft({ count: Number.parseInt(e.target.value, 10) || 1 })
          }
          className="w-full accent-(--accent)"
        />
        <span className="text-[11px] text-(--text-muted) [font-variant-numeric:tabular-nums]">
          {draft.count}
        </span>
      </Field>

      {validationError ? (
        <div
          className={
            "rounded-(--radius-sm) border border-(--danger) bg-(--danger-soft) " +
            "px-2.5 py-2 text-[12px] text-(--danger)"
          }
        >
          {validationError}
        </div>
      ) : null}

      <Button
        onClick={() => void generate()}
        disabled={submitting || !draft.prompt.trim()}
        className="w-full"
      >
        {submitting ? "Generating…" : "Generate"}
      </Button>
      <span className="text-[11px] text-(--text-faint)">
        ⌘↵ or Ctrl+Enter
      </span>
      {draft.parentId ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => resetDraft()}
          className="w-full"
        >
          Clear remix
        </Button>
      ) : null}
    </div>
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
  const providerPrefs = useConfigStore((s) => s.providerPrefs);
  const refreshConfig = useConfigStore((s) => s.refresh);

  const refreshGallery = useGalleryStore((s) => s.refresh);
  const items = useGalleryStore((s) => s.items);

  const assetsByKind = useAssetsStore((s) => s.byKind);
  const refreshAssets = useAssetsStore((s) => s.refresh);

  const [models, setModels] = useState<VideoModelDef[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

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
    const defaultId =
      draft.providerId &&
      configuredVideoProviders.some((p) => p.id === draft.providerId)
        ? (draft.providerId as ProviderId)
        : (configuredVideoProviders[0]!.id as ProviderId);
    if (draft.providerId !== defaultId) {
      setDraft({ providerId: defaultId });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configuredVideoProviders.length]);

  useEffect(() => {
    if (!draft.providerId) {
      setModels([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const r = await api["video.models"]({
          providerId: draft.providerId as ProviderId,
        });
        if (cancelled) return;
        setModels(r.models);
        if (!r.models.some((m) => m.id === draft.modelId)) {
          // Catalog drives the default; the IPC route returns it via
          // `r.defaultModel` (registry's first model id).
          const fallback = r.defaultModel ?? r.models[0]?.id ?? "";
          if (fallback) setDraft({ modelId: fallback });
        }
      } catch (err) {
        if (!cancelled) {
          pushToast({
            title: "Could not load video models",
            description: (err as Error)?.message ?? String(err),
            variant: "error",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.providerId]);

  const selectedModel = useMemo(
    () => models.find((m) => m.id === draft.modelId) ?? null,
    [models, draft.modelId],
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
        patch.resolution = caps.resolutions[0]!;
      }
    }
    if (Object.keys(patch).length > 0) setDraft(patch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    caps?.durationsSec?.join(","),
    caps?.fpsOptions?.join(","),
    caps?.resolutions?.join(","),
  ]);

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
        err instanceof IpcClientError
          ? `${err.message}`
          : (err as Error)?.message ?? String(err);
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
        <Icons.FilmReel
          weight="duotone"
          className="mx-auto size-8 text-(--text-muted)"
        />
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

  const modelOptions: ResolvedModelOption[] = models.map((m) => ({
    id: m.id,
    displayName: m.displayName ?? null,
    capabilities: {
      ...(m.capabilities?.resolutions
        ? { sizes: m.capabilities.resolutions as readonly string[] }
        : {}),
      maxOutputs: 1,
      supportsNegativePrompt: false,
      supportsSeed: false,
      supportsStyleRef: false,
    },
  }));

  return (
    <div className="flex flex-col gap-3">
      {draft.parentId ? (
        <span
          className={
            "inline-flex w-fit items-center gap-1 rounded-(--radius-xs) " +
            "bg-(--accent-soft) px-2 py-0.5 text-[11px] text-(--accent)"
          }
        >
          remix of {draft.parentId.slice(0, 8)}…
        </span>
      ) : null}

      <Field label="Provider">
        <Select.Root
          value={draft.providerId}
          onValueChange={(v) => setDraft({ providerId: v as ProviderId })}
        >
          <Select.Trigger>
            <Select.Value />
          </Select.Trigger>
          <Select.Content>
            {configuredVideoProviders.map((p) => (
              <Select.Item key={p.id} value={p.id}>
                {p.displayName}
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
      </Field>

      <Field label="Model">
        <ModelSelect
          models={modelOptions}
          value={draft.modelId}
          onChange={(id) => setDraft({ modelId: id })}
          disabled={modelOptions.length === 0}
        />
      </Field>

      <PromptComposer
        prompt={draft.prompt}
        onPromptChange={(p) => setDraft({ prompt: p })}
        onSubmit={() => void submit()}
        showCharCount
        enableAssetPicker
        placeholder="Describe the video you want…"
        assets={{ byKind: assetsByKind }}
        selectedAssetIds={draft.assetIds}
        onAssetIdsChange={(next) => setDraft({ assetIds: next })}
        thumbnailUrl={(a: Asset) => resolveAssetThumbnailUrl(a)}
        onRequestCreateAsset={(_kind: AssetKind) => navigate("assets")}
      />

      <SettingsHeading>Video Settings</SettingsHeading>
      <div className="grid grid-cols-2 gap-2">
        {caps?.durationsSec && caps.durationsSec.length > 0 ? (
          <Field label="Duration (s)">
            <Select.Root
              value={String(draft.durationSec ?? caps.durationsSec[0])}
              onValueChange={(v) =>
                setDraft({ durationSec: Number.parseInt(v, 10) })
              }
            >
              <Select.Trigger>
                <Select.Value />
              </Select.Trigger>
              <Select.Content>
                {caps.durationsSec.map((d) => (
                  <Select.Item key={d} value={String(d)}>
                    {d}s
                  </Select.Item>
                ))}
              </Select.Content>
            </Select.Root>
          </Field>
        ) : null}
        {caps?.fpsOptions && caps.fpsOptions.length > 0 ? (
          <Field label="FPS">
            <Select.Root
              value={String(draft.fps ?? caps.fpsOptions[0])}
              onValueChange={(v) => setDraft({ fps: Number.parseInt(v, 10) })}
            >
              <Select.Trigger>
                <Select.Value />
              </Select.Trigger>
              <Select.Content>
                {caps.fpsOptions.map((f) => (
                  <Select.Item key={f} value={String(f)}>
                    {f}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select.Root>
          </Field>
        ) : null}
      </div>
      {caps?.resolutions && caps.resolutions.length > 0 ? (
        <Field label="Resolution">
          <Select.Root
            value={draft.resolution ?? caps.resolutions[0]}
            onValueChange={(v) => setDraft({ resolution: v })}
          >
            <Select.Trigger>
              <Select.Value />
            </Select.Trigger>
            <Select.Content>
              {caps.resolutions.map((r) => (
                <Select.Item key={r} value={r}>
                  {r}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
        </Field>
      ) : null}
      {caps?.supportsFirstFrame ? (
        <Field label="First frame (optional)">
          <FirstFramePicker
            value={draft.firstFrame ?? null}
            onChange={(v) => setDraft({ firstFrame: v ?? undefined })}
            recentFrames={items.filter((it) => it.kind === "image").slice(0, 12)}
          />
        </Field>
      ) : null}

      {validationError ? (
        <div
          className={
            "rounded-(--radius-sm) border border-(--danger) bg-(--danger-soft) " +
            "px-2.5 py-2 text-[12px] text-(--danger)"
          }
        >
          {validationError}
        </div>
      ) : null}

      <Button
        onClick={() => void submit()}
        disabled={submitting || !draft.prompt.trim()}
        className="w-full"
      >
        {submitting ? "Submitting…" : "Submit"}
      </Button>
      <span className="text-[11px] text-(--text-faint)">
        ⌘↵ or Ctrl+Enter
      </span>
      {draft.parentId ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => resetDraft()}
          className="w-full"
        >
          Clear remix
        </Button>
      ) : null}
    </div>
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

  // Reset the pinned canvas item when the user switches modes.
  useEffect(() => {
    setPinnedId(null);
  }, [mode]);

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
    activeJobId && activeJobId !== "__pending__"
      ? jobs[activeJobId] ?? null
      : null;
  const submitting = activeJobId === "__pending__";

  const draftPrompt = mode === "image" ? imageDraft.prompt : videoDraft.prompt;
  const draftProvider =
    mode === "image" ? imageDraft.providerId : videoDraft.providerId;

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
              aria-label="Generating…"
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
            {...(typeof activeJob?.progress === "number"
              ? { progress: activeJob.progress }
              : {})}
            label={draftPrompt.slice(0, 60)}
            {...(activeJob?.errorMessage
              ? { errorMessage: activeJob.errorMessage }
              : {})}
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
      // eslint-disable-next-line jsx-a11y/media-has-caption
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
        "max-h-full max-w-full rounded-(--radius-lg) border border-(--border) " +
        "object-contain"
      }
    />
  );
}

function EmptyCanvas({ mode }: { mode: StudioMode }) {
  const Icon = mode === "video" ? Icons.FilmReel : Icons.Image;
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <Icon
        weight="duotone"
        className="size-10 text-(--text-faint)"
        aria-hidden="true"
      />
      <p className="text-[12px] text-(--text-muted)">
        Your {mode === "video" ? "video" : "image"} will appear here.
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Right gallery rail — wraps GalleryRail with mode-specific filtering.
 * ----------------------------------------------------------------------- */

function StudioGalleryRail({
  mode,
  onViewAll,
}: {
  mode: StudioMode;
  onViewAll: () => void;
}) {
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
 * Helpers (Field, SettingsHeading, FirstFramePicker, gallery URL resolver)
 * ----------------------------------------------------------------------- */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[12px] text-(--text-muted)">{label}</span>
      {children}
    </label>
  );
}

function SettingsHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-1 border-t border-(--border-faint) pt-3">
      <h3 className="text-[12px] text-(--text-muted)">{children}</h3>
    </div>
  );
}

function FirstFramePicker({
  value,
  onChange,
  recentFrames,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  recentFrames: GalleryItem[];
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const onDrop = (e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (!f) return;
    const p = (f as File & { path?: string }).path;
    if (typeof p === "string" && p.length > 0) onChange(p);
  };
  return (
    <div className="flex flex-col gap-1.5">
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        className={
          "flex items-center justify-center rounded-(--radius-sm) " +
          "border border-dashed border-(--border) bg-(--surface-sunken) " +
          "px-2.5 py-2 text-[11px] text-(--text-muted)"
        }
      >
        {value ? (
          <span className="truncate">{value.split(/[\\/]/).pop() ?? value}</span>
        ) : (
          <span>Drop image or pick…</span>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <Button size="sm" variant="ghost" onClick={() => setPickerOpen((o) => !o)}>
          {pickerOpen ? "Close" : "Pick"}
        </Button>
        {value ? (
          <Button size="sm" variant="ghost" onClick={() => onChange(null)}>
            Clear
          </Button>
        ) : null}
      </div>
      {pickerOpen ? (
        recentFrames.length === 0 ? (
          <div className="px-1 py-2 text-[11px] text-(--text-muted)">
            No recent images.
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-1">
            {recentFrames.map((it) => (
              <button
                key={it.id}
                type="button"
                onClick={() => {
                  onChange(it.relPath);
                  setPickerOpen(false);
                }}
                title={it.prompt}
                className={
                  "block aspect-square overflow-hidden rounded-(--radius-xs) " +
                  "border border-(--border) hover:border-(--border-strong)"
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
        )
      ) : null}
    </div>
  );
}

function nearestNumber(allowed: readonly number[], target: number): number {
  if (allowed.length === 0) return target;
  let best = allowed[0]!;
  let bestDiff = Math.abs(allowed[0]! - target);
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
 * Renderer-side helper to convert a `gallery_items.rel_path` into a URL the
 * <img> tag can load. Electron with `webSecurity:true` won't load `file://`
 * unless the protocol is registered — in dev we rely on the dev server to
 * serve the cached image; in prod the renderer reads via `file://` after
 * the dataDir is exposed via `app.storagePaths`.
 */
function resolveGalleryUrl(relPath: string): string {
  const w = window as unknown as { __imagineDataDir__?: string };
  const dataDir = w.__imagineDataDir__ ?? "";
  if (!dataDir) {
    return relPath;
  }
  const norm = relPath.replace(/\\/g, "/");
  const root = dataDir.replace(/\\/g, "/");
  return `file:///${root}/${norm}`.replace(/\/+/g, "/").replace("file:/", "file:///");
}

export { resolveGalleryUrl };
