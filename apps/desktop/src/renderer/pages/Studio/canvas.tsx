import type { GalleryItem, Job } from "@imagine/core";
import { Icons, JobProgress } from "@imagine/ui";
import { useEffect, useMemo, useState } from "react";
import type { StudioMode } from "../../state/useUIStore.js";
import { useGalleryStore } from "../../state/useGalleryStore.js";
import { useJobsStore } from "../../state/useJobsStore.js";
import { useUIStore } from "../../state/useUIStore.js";
import { resolveGalleryUrl } from "./utils.js";

export function CanvasArea({ mode }: { mode: StudioMode }) {
  const items = useGalleryStore((state) => state.items);
  const activeJobId = useJobsStore((state) => state.activeJobId);
  const jobs = useJobsStore((state) => state.jobs);
  const cancelJob = useJobsStore((state) => state.cancel);
  const imageDraft = useUIStore((state) => state.studioDraft.image);
  const videoDraft = useUIStore((state) => state.studioDraft.video);

  const [pinnedId, setPinnedId] = useState<string | null>(null);

  useEffect(() => {
    const onPin = (event: Event): void => {
      const customEvent = event as CustomEvent<{ id: string }>;
      if (customEvent.detail?.id) setPinnedId(customEvent.detail.id);
    };
    window.addEventListener("imagine:canvas-pin", onPin as EventListener);
    return () => {
      window.removeEventListener("imagine:canvas-pin", onPin as EventListener);
    };
  }, []);

  const recent = useMemo(() => items.find((item) => item.kind === mode) ?? null, [items, mode]);
  const pinned = useMemo(
    () => (pinnedId ? items.find((item) => item.id === pinnedId) ?? null : null),
    [items, pinnedId],
  );
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
        "max-h-full max-w-full rounded-(--radius-lg) border border-(--border) object-contain"
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
