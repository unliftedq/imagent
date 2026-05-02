import type { GalleryItem } from "@imagine/core";
import { Icons } from "@imagine/ui";
import { useEffect, useMemo, useState } from "react";
import { useGalleryStore } from "../../state/useGalleryStore.js";
import { useJobsStore } from "../../state/useJobsStore.js";
import type { StudioMode } from "../../state/useUIStore.js";
import { useUIStore } from "../../state/useUIStore.js";
import { resolveGalleryUrl } from "./utils.js";

export function CanvasArea({ mode }: { mode: StudioMode }) {
  const items = useGalleryStore((state) => state.items);
  const activeJobId = useJobsStore((state) => state.activeJobId);
  const jobs = useJobsStore((state) => state.jobs);
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

  const activeJob = activeJobId && activeJobId !== "__pending__" ? (jobs[activeJobId] ?? null) : null;
  const submitting = activeJobId === "__pending__";
  const draftPrompt = mode === "image" ? imageDraft.prompt : videoDraft.prompt;
  const generating = submitting || activeJob !== null;

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-(--bg)">
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-6">
        {generating ? (
          <GeneratingCanvas mode={mode} prompt={draftPrompt} />
        ) : display ? (
          <CanvasMedia item={display} />
        ) : (
          <EmptyCanvas mode={mode} />
        )}
      </div>
    </section>
  );
}

function GeneratingCanvas({
  mode,
  prompt,
}: {
  mode: StudioMode;
  prompt: string;
}) {
  const label = prompt.trim()
    ? `Generating ${mode}: ${prompt.trim().slice(0, 80)}`
    : `Generating ${mode}`;

  return (
    <div
      className="studio-generating-placeholder relative w-full max-w-3xl overflow-hidden bg-(--surface-sunken)"
      role="status"
      aria-label={label}
    >
      <GenerationLayers />
    </div>
  );
}

function GenerationLayers() {
  return (
    <>
      <div className="studio-generation-dot-field" />
      <div className="studio-generation-vellum" />
    </>
  );
}

function CanvasMedia({ item, className = "" }: { item: GalleryItem; className?: string }) {
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
          `bg-black object-contain ${className}`
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
        "max-h-full max-w-full rounded-(--radius-lg) border border-(--border) object-contain " +
        className
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
