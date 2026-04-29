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
import type { Asset, AssetKind, GalleryItem, ImageModelDef, ImageRequest } from "@imagine-studio/core";
import type { ProviderId } from "@imagine-studio/ipc";
import { IpcClientError } from "@imagine-studio/ipc";
import { api } from "../lib/api.js";
import { useAssetsStore } from "../state/useAssetsStore.js";
import { useConfigStore } from "../state/useConfigStore.js";
import { useGalleryStore } from "../state/useGalleryStore.js";
import { useJobsStore } from "../state/useJobsStore.js";
import { useUIStore } from "../state/useUIStore.js";
import { resolveAssetThumbnailUrl } from "./Assets.js";

/**
 * Studio page (M5) — image generation flow per design.md §11.
 *
 * Layout (top → bottom):
 *   PromptComposer (full width, autosize 6→14 rows, Cmd/Ctrl+Enter submits)
 *   provider · model · size · count · seed parameter rail
 *   Generate button
 *   Recent strip (6 most recent gallery_items, image-only)
 *   Active job progress bar (when a job is running)
 */
export function StudioPage() {
  const draft = useUIStore((s) => s.studioDraft);
  const setDraft = useUIStore((s) => s.setStudioDraft);
  const resetDraft = useUIStore((s) => s.resetStudioDraft);
  const navigate = useUIStore((s) => s.navigate);
  const pushToast = useUIStore((s) => s.pushToast);

  const summaries = useConfigStore((s) => s.summaries);
  const appPrefs = useConfigStore((s) => s.appPrefs);
  const refreshConfig = useConfigStore((s) => s.refresh);

  const items = useGalleryStore((s) => s.items);
  const refreshGallery = useGalleryStore((s) => s.refresh);
  const upsertOne = useGalleryStore((s) => s.upsertOne);

  const assetsByKind = useAssetsStore((s) => s.byKind);
  const refreshAssets = useAssetsStore((s) => s.refresh);

  const activeJobId = useJobsStore((s) => s.activeJobId);
  const setActiveJobId = useJobsStore((s) => s.setActiveJobId);
  const jobs = useJobsStore((s) => s.jobs);
  const cancelJob = useJobsStore((s) => s.cancel);

  const [models, setModels] = useState<ImageModelDef[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const configuredProviders = useMemo(
    () => summaries.filter((s) => s.configured),
    [summaries],
  );

  // Bootstrap: load config + gallery + assets on mount.
  useEffect(() => {
    void refreshConfig();
    void refreshGallery();
    void refreshAssets();
  }, [refreshConfig, refreshGallery, refreshAssets]);

  // Default provider/model selection on first load — falls back to the user's
  // app-pref `defaultProvider`, then the first configured provider.
  useEffect(() => {
    if (configuredProviders.length === 0) return;
    if (draft.providerId && configuredProviders.some((p) => p.id === draft.providerId)) {
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

  // Load resolved models when the provider changes.
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
        // Make sure the selected model exists in the list.
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

  // Snap size to model.capabilities.sizes when the model changes.
  useEffect(() => {
    if (!caps?.sizes || caps.sizes.length === 0) return;
    if (draft.size && caps.sizes.includes(draft.size)) return;
    setDraft({ size: caps.sizes[0] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caps?.sizes?.join(",")]);

  // Reflect the active job's latest snapshot.
  const activeJob = activeJobId ? jobs[activeJobId] ?? null : null;

  // Recent items (image only, latest 6).
  const recent = useMemo(
    () => items.filter((it) => it.kind === "image").slice(0, 6),
    [items],
  );

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
      references: draft.references.map((path) => ({ path, role: "freeform" as const })),
      assetIds: [],
      ...(draft.parentId ? { parentId: draft.parentId } : {}),
      ...(slotsHaveAny ? { assetSlots: draft.assetIds } : {}),
    };

    setSubmitting(true);
    // The current contract returns the GalleryItem after the job completes —
    // we still rely on `job.progress` push events for the in-flight bar. We
    // pre-mark a synthetic "active" id so the progress component renders
    // immediately; the real id is set when the first progress event lands.
    setActiveJobId("__pending__");
    try {
      const item = await api["image.generate"](req);
      upsertOne(item);
      // One-shot: clear parentId so the next generate isn't accidentally a remix.
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

  const onDropFiles = (e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    if (!caps || (caps.maxReferences ?? 0) === 0) {
      pushToast({
        title: "No reference support",
        description: `Model ${selectedModel?.id ?? ""} does not accept reference images.`,
        variant: "warning",
      });
      return;
    }
    const paths: string[] = [];
    for (const f of Array.from(e.dataTransfer.files)) {
      // Electron exposes `path` on File objects passed via the OS drag-drop API.
      const p = (f as File & { path?: string }).path;
      if (typeof p === "string" && p.length > 0) paths.push(p);
    }
    if (paths.length === 0) return;
    const cap = caps.maxReferences ?? Number.POSITIVE_INFINITY;
    const next = [...draft.references, ...paths].slice(0, cap);
    setDraft({ references: next });
  };

  if (configuredProviders.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-8 py-16">
        <div className="rounded-(--radius-lg) border border-(--color-hairline) bg-(--color-canvas) p-8 text-center">
          <Icons.Plug weight="duotone" className="mx-auto size-10 text-(--color-muted)" />
          <h2 className="mt-3 text-(length:--text-title-md) font-semibold text-(--color-ink)">
            No provider configured yet
          </h2>
          <p className="mt-1 text-(length:--text-body-sm) text-(--color-muted)">
            Open Providers and add an API key to start generating.
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
    capabilities: m.capabilities,
  }));

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 px-8 py-8">
      <header className="flex items-baseline justify-between">
        <h1 className="text-(length:--text-display-sm) font-(family-name:--font-display) text-(--color-ink)">
          Studio
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
        / {caps?.maxReferences ?? 0} attached
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
            <span className="text-(length:--text-caption) text-(--color-muted)">
              {caps?.aspectRatios?.length
                ? "Use aspect ratio (model uses ratios, not sizes)"
                : "Model accepts free-form sizes"}
            </span>
          )}
        </Field>
        <Field label={`Count (max ${caps?.maxOutputs ?? 1})`}>
          <input
            type="range"
            min={1}
            max={Math.max(1, caps?.maxOutputs ?? 1)}
            value={draft.count}
            onChange={(e) =>
              setDraft({ count: Number.parseInt(e.target.value, 10) || 1 })
            }
            className="w-full accent-(--color-accent)"
          />
          <span className="text-(length:--text-caption) text-(--color-muted) [font-variant-numeric:tabular-nums]">
            {draft.count}
          </span>
        </Field>
      </div>

      {validationError ? (
        <div className="rounded-(--radius-md) border border-(--color-error)/40 bg-(--color-error)/10 px-3 py-2 text-(length:--text-caption) text-(--color-error)">
          {validationError}
        </div>
      ) : null}

      <div className="flex items-center gap-3">
        <Button
          onClick={() => void generate()}
          disabled={submitting || !draft.prompt.trim()}
        >
          Generate
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

      {/* Active job progress */}
      {(submitting || activeJob) && draft.providerId ? (
        <JobProgress
          kind="image"
          state={activeJob?.state ?? "running"}
          progress={activeJob?.progress ?? undefined}
          label={draft.prompt.slice(0, 60)}
          {...(activeJob?.errorMessage ? { errorMessage: activeJob.errorMessage } : {})}
          onCancel={
            activeJob && activeJob.id !== "__pending__"
              ? () => void cancelJob(activeJob.id)
              : undefined
          }
        />
      ) : null}

      {/* Recent strip */}
      {recent.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-(length:--text-caption-uppercase) font-semibold uppercase tracking-[1.5px] text-(--color-muted)">
            Recent
          </h3>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            {recent.map((it) => (
              <RecentTile key={it.id} item={it} />
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

function RecentTile({ item }: { item: GalleryItem }) {
  const navigate = useUIStore((s) => s.navigate);
  return (
    <button
      type="button"
      className={
        "block aspect-square w-full overflow-hidden rounded-(--radius-md) " +
        "border border-(--color-hairline) bg-(--color-surface-soft) " +
        "transition-colors duration-(--duration-fast) hover:border-(--color-ink)"
      }
      onClick={() => navigate("gallery")}
      title={item.prompt}
    >
      <img
        src={resolveGalleryUrl(item.relPath)}
        alt={item.prompt}
        loading="lazy"
        className="block h-full w-full object-cover"
      />
    </button>
  );
}

/**
 * Renderer-side helper to convert a `gallery_items.rel_path` into a URL the
 * <img> tag can load. Electron with `webSecurity:true` won't load `file://`
 * unless the protocol is registered — in dev we rely on the dev server to
 * serve the cached image; in prod the renderer reads via the `file://` URL
 * after the renderer is allowed to via the `webPreferences` entry.
 */
function resolveGalleryUrl(relPath: string): string {
  // We persist relative paths in the DB. Electron's `file://` protocol is the
  // simplest read path; the main process dataDir is exposed via app.storagePaths.
  // Rather than add a per-item IPC, we lazily prefix with the dataDir baked
  // into a window-scoped global on first config refresh.
  const w = window as unknown as { __imagineDataDir__?: string };
  const dataDir = w.__imagineDataDir__ ?? "";
  if (!dataDir) {
    return relPath; // best-effort; the <img> may 404 until storage paths land.
  }
  // Forward-slash join is fine for Windows file:// URLs.
  const norm = relPath.replace(/\\/g, "/");
  const root = dataDir.replace(/\\/g, "/");
  return `file:///${root}/${norm}`.replace(/\/+/g, "/").replace("file:/", "file:///");
}

export { resolveGalleryUrl };
