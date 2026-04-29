import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Icons,
  JobProgress,
  ModelSelect,
  PromptComposer,
  Select,
  type ResolvedModelOption,
} from "@imagine-studio/ui";
import type {
  Asset,
  AssetKind,
  GalleryItem,
  Job,
  VideoModelDef,
  VideoRequest,
} from "@imagine-studio/core";
import type { ProviderId } from "@imagine-studio/ipc";
import { IpcClientError } from "@imagine-studio/ipc";
import { api } from "../lib/api.js";
import { useAssetsStore } from "../state/useAssetsStore.js";
import { useConfigStore } from "../state/useConfigStore.js";
import { useGalleryStore } from "../state/useGalleryStore.js";
import { useJobsStore } from "../state/useJobsStore.js";
import { useUIStore } from "../state/useUIStore.js";
import { resolveAssetThumbnailUrl } from "./Assets.js";
import { resolveGalleryUrl } from "./Studio.js";

interface QueueEntry {
  jobId: string;
  /** Snapshot of the prompt at submit-time so the queue tile keeps a label
   * even if the user wipes the textarea afterward. */
  label: string;
  startedAt: number;
}

/**
 * Video Studio (M7). Mirrors Studio.tsx but for Seedance jobs:
 *   - prompt + asset slots (reuses PromptComposer / AssetPicker)
 *   - duration / fps / resolution driven by the resolved model's caps
 *   - first-frame slot (drag-drop or pick-from-gallery)
 *   - submit returns { jobId } immediately; multiple in-flight allowed
 *   - JobProgress queue rows subscribe to `job.progress` push events
 *   - Recent strip shows the most recent video gallery items
 */
export function VideoStudioPage() {
  const draft = useUIStore((s) => s.videoDraft);
  const setDraft = useUIStore((s) => s.setVideoDraft);
  const resetDraft = useUIStore((s) => s.resetVideoDraft);
  const navigate = useUIStore((s) => s.navigate);
  const pushToast = useUIStore((s) => s.pushToast);

  const summaries = useConfigStore((s) => s.summaries);
  const providerPrefs = useConfigStore((s) => s.providerPrefs);
  const refreshConfig = useConfigStore((s) => s.refresh);

  const items = useGalleryStore((s) => s.items);
  const refreshGallery = useGalleryStore((s) => s.refresh);

  const assetsByKind = useAssetsStore((s) => s.byKind);
  const refreshAssets = useAssetsStore((s) => s.refresh);

  const jobs = useJobsStore((s) => s.jobs);
  const cancelJob = useJobsStore((s) => s.cancel);

  const [models, setModels] = useState<VideoModelDef[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [queue, setQueue] = useState<QueueEntry[]>([]);

  // Providers that participate in video generation (currently just Volcengine).
  const configuredVideoProviders = useMemo(
    () =>
      summaries.filter(
        (s) => s.configured && s.kinds.includes("video"),
      ),
    [summaries],
  );

  useEffect(() => {
    void refreshConfig();
    void refreshGallery();
    void refreshAssets();
  }, [refreshConfig, refreshGallery, refreshAssets]);

  // Default provider/model selection.
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

  // Load video model list when the provider changes.
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
          // Prefer the prefs default video model, then the catalog default,
          // then the first model.
          const pref = providerPrefs?.volcengine?.defaultVideoModel;
          const fallback =
            (pref && r.models.some((m) => m.id === pref) ? pref : null) ??
            r.defaultModel ??
            r.models[0]?.id ??
            "";
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

  // Snap duration / fps / resolution to the closest supported value when the
  // model changes (or the value becomes invalid).
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

  const recent = useMemo(
    () => items.filter((it) => it.kind === "video").slice(0, 4),
    [items],
  );

  // Drop completed/cancelled/failed entries from the queue once we get the
  // terminal job snapshot. The push events are wired by useJobsStore.
  useEffect(() => {
    setQueue((prev) =>
      prev.filter((q) => {
        const j = jobs[q.jobId];
        if (!j) return true;
        return j.state !== "succeeded" && j.state !== "failed" && j.state !== "cancelled";
      }),
    );
  }, [jobs]);

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
      const { jobId } = await api["video.submit"](req);
      const entry: QueueEntry = {
        jobId,
        label: req.prompt.slice(0, 60),
        startedAt: Date.now(),
      };
      setQueue((q) => [entry, ...q]);
      // One-shot: clear remix marker so the next submit isn't accidentally a remix.
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

  const onDropFiles = (e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    if (caps && caps.supportsRefImages === false) {
      pushToast({
        title: "No reference support",
        description: `Model ${selectedModel?.id ?? ""} does not accept reference images.`,
        variant: "warning",
      });
      return;
    }
    const paths: string[] = [];
    for (const f of Array.from(e.dataTransfer.files)) {
      const p = (f as File & { path?: string }).path;
      if (typeof p === "string" && p.length > 0) paths.push(p);
    }
    if (paths.length === 0) return;
    setDraft({ references: [...draft.references, ...paths] });
  };

  if (configuredVideoProviders.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-8 py-16">
        <div className="rounded-(--radius-lg) border border-(--color-hairline) bg-(--color-canvas) p-8 text-center">
          <Icons.FilmReel weight="duotone" className="mx-auto size-10 text-(--color-muted)" />
          <h2 className="mt-3 text-(length:--text-title-md) font-semibold text-(--color-ink)">
            No video provider configured
          </h2>
          <p className="mt-1 text-(length:--text-body-sm) text-(--color-muted)">
            Add a Volcengine API key on Providers to start generating videos.
          </p>
          <div className="mt-4 inline-flex">
            <Button onClick={() => navigate("providers")}>Open Providers</Button>
          </div>
        </div>
      </div>
    );
  }

  const modelOptions: ResolvedModelOption[] = models.map((m) => ({
    id: m.id,
    displayName: m.displayName ?? null,
    capabilities: {
      // Map VideoModelCaps → the display-friendly subset ResolvedModelOption
      // expects. ModelSelect currently shows sizes/aspectRatios; we substitute
      // resolutions for sizes so the right-hand caption surfaces something useful.
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
    <div className="mx-auto flex max-w-4xl flex-col gap-6 px-8 py-8">
      <header className="flex items-baseline justify-between">
        <h1 className="text-(length:--text-display-sm) font-(family-name:--font-display) text-(--color-ink)">
          Video Studio
        </h1>
        {draft.parentId ? (
          <span className="rounded-(--radius-pill) bg-(--color-surface-card) px-3 py-1 text-(length:--text-caption) text-(--color-ink)">
            remix of {draft.parentId.slice(0, 8)}…
          </span>
        ) : null}
      </header>

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

      {/* Reference drop zone */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDropFiles}
        className={
          "rounded-(--radius-md) border border-dashed border-(--color-hairline) " +
          "bg-(--color-surface-soft) px-4 py-3 text-(length:--text-caption) text-(--color-muted)"
        }
      >
        Drag reference images here ·{" "}
        <span className="[font-variant-numeric:tabular-nums]">
          {draft.references.length}
        </span>{" "}
        attached
        {draft.references.length > 0 ? (
          <button
            type="button"
            className="ml-2 text-(--color-ink) underline"
            onClick={() => setDraft({ references: [] })}
          >
            clear
          </button>
        ) : null}
      </div>

      {/* Parameter rail */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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

        {caps?.durationsSec && caps.durationsSec.length > 0 ? (
          <Field label={`Duration (sec) — model supports ${caps.durationsSec.join(", ")}`}>
            <input
              type="range"
              min={Math.min(...caps.durationsSec)}
              max={Math.max(...caps.durationsSec)}
              step={1}
              value={draft.durationSec ?? caps.durationsSec[0]!}
              onChange={(e) => {
                const n = Number.parseInt(e.target.value, 10);
                const snapped = nearestNumber(caps.durationsSec ?? [n], n);
                setDraft({ durationSec: snapped });
              }}
              className="w-full accent-(--color-accent)"
            />
            <span className="text-(length:--text-caption) text-(--color-muted) [font-variant-numeric:tabular-nums]">
              {draft.durationSec ?? caps.durationsSec[0]} s
            </span>
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
                    {f} fps
                  </Select.Item>
                ))}
              </Select.Content>
            </Select.Root>
          </Field>
        ) : null}

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
              recentVideoFrames={items.filter((it) => it.kind === "image").slice(0, 12)}
            />
          </Field>
        ) : null}
      </div>

      {validationError ? (
        <div className="rounded-(--radius-md) border border-(--color-error)/40 bg-(--color-error)/10 px-3 py-2 text-(length:--text-caption) text-(--color-error)">
          {validationError}
        </div>
      ) : null}

      <div className="flex items-center gap-3">
        <Button
          onClick={() => void submit()}
          disabled={submitting || !draft.prompt.trim()}
        >
          Submit
        </Button>
        <span className="text-(length:--text-caption) text-(--color-muted-soft)">
          ⌘↵ or Ctrl+Enter
        </span>
        {draft.parentId ? (
          <Button variant="ghost" size="sm" onClick={() => resetDraft()}>
            Clear remix
          </Button>
        ) : null}
      </div>

      {/* Active job queue */}
      {queue.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-(length:--text-caption-uppercase) font-semibold uppercase tracking-[1.5px] text-(--color-muted)">
            Active jobs
          </h3>
          {queue.map((q) => (
            <QueueRow
              key={q.jobId}
              entry={q}
              job={jobs[q.jobId] ?? null}
              onCancel={() => void cancelJob(q.jobId)}
            />
          ))}
        </div>
      ) : null}

      {/* Recent strip */}
      {recent.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-(length:--text-caption-uppercase) font-semibold uppercase tracking-[1.5px] text-(--color-muted)">
            Recent
          </h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {recent.map((it) => (
              <RecentVideoTile key={it.id} item={it} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-(length:--text-caption) font-semibold text-(--color-muted)">
        {label}
      </span>
      {children}
    </label>
  );
}

function QueueRow({
  entry,
  job,
  onCancel,
}: {
  entry: QueueEntry;
  job: Job | null;
  onCancel: () => void;
}) {
  const state = job?.state ?? "running";
  return (
    <JobProgress
      kind="video"
      state={state}
      {...(typeof job?.progress === "number" ? { progress: job.progress } : {})}
      label={entry.label}
      {...(job?.errorMessage ? { errorMessage: job.errorMessage } : {})}
      onCancel={onCancel}
      startedAt={entry.startedAt}
    />
  );
}

function RecentVideoTile({ item }: { item: GalleryItem }) {
  const navigate = useUIStore((s) => s.navigate);
  const thumb = item.thumbPath ? resolveGalleryUrl(item.thumbPath) : null;
  return (
    <button
      type="button"
      className={
        "group relative block aspect-video w-full overflow-hidden rounded-(--radius-md) " +
        "border border-(--color-hairline) bg-(--color-surface-soft) " +
        "transition-colors duration-(--duration-fast) hover:border-(--color-ink)"
      }
      onClick={() => navigate("gallery")}
      title={item.prompt}
    >
      {thumb ? (
        <img
          src={thumb}
          alt={item.prompt}
          loading="lazy"
          className="block h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-(--color-muted)">
          <Icons.FilmStrip weight="duotone" className="size-8" />
        </div>
      )}
      <div className="pointer-events-none absolute bottom-1.5 left-1.5 inline-flex size-6 items-center justify-center rounded-(--radius-pill) bg-black/55 text-white">
        <Icons.Play weight="fill" className="size-3" />
      </div>
    </button>
  );
}

function FirstFramePicker({
  value,
  onChange,
  recentVideoFrames,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  recentVideoFrames: GalleryItem[];
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
    <div className="flex items-center gap-2">
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        className={
          "flex flex-1 items-center justify-center rounded-(--radius-md) " +
          "border border-dashed border-(--color-hairline) bg-(--color-surface-soft) " +
          "px-3 py-2 text-(length:--text-caption) text-(--color-muted)"
        }
      >
        {value ? (
          <span className="truncate">
            {value.split(/[\\/]/).pop() ?? value}
          </span>
        ) : (
          <span>Drop an image, or pick from gallery →</span>
        )}
      </div>
      <Button size="sm" variant="ghost" onClick={() => setPickerOpen((o) => !o)}>
        {pickerOpen ? "Close" : "Pick"}
      </Button>
      {value ? (
        <Button size="sm" variant="ghost" onClick={() => onChange(null)}>
          Clear
        </Button>
      ) : null}
      {pickerOpen ? (
        <div
          className={
            "absolute z-30 mt-1 max-h-56 w-72 overflow-auto rounded-(--radius-md) " +
            "border border-(--color-hairline) bg-(--color-canvas) p-2 shadow-[0_4px_24px_-8px_rgba(0,0,0,0.08)]"
          }
        >
          {recentVideoFrames.length === 0 ? (
            <div className="px-2 py-3 text-(length:--text-caption) text-(--color-muted)">
              No images in your gallery yet.
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-1.5">
              {recentVideoFrames.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => {
                    onChange(it.relPath);
                    setPickerOpen(false);
                  }}
                  className={
                    "block aspect-square overflow-hidden rounded-(--radius-sm) " +
                    "border border-(--color-hairline) hover:border-(--color-ink)"
                  }
                  title={it.prompt}
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
