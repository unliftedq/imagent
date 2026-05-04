import type { GalleryItem } from "@imagine/core";
import { Button, Dialog, Icons } from "@imagine/ui";
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
  const trimmed = prompt.trim();
  const label = trimmed
    ? `Generating ${mode}: ${trimmed.slice(0, 80)}`
    : `Generating ${mode}`;

  return (
    <div
      className="studio-generating-placeholder relative w-full max-w-3xl overflow-hidden"
      role="status"
      aria-label={label}
    >
      <div className="studio-generation-shimmer" aria-hidden="true" />
      <div className="studio-generation-grain" aria-hidden="true" />
      <div className="studio-generation-badge">
        <span className="studio-generation-badge-dot" aria-hidden="true" />
        <span className="studio-generation-badge-label">Generating</span>
        <span className="studio-generation-badge-divider" aria-hidden="true" />
        <CancelGenerationControl mode={mode} />
      </div>
    </div>
  );
}

function CancelGenerationControl({ mode }: { mode: StudioMode }) {
  const activeJobId = useJobsStore((state) => state.activeJobId);
  const cancelJob = useJobsStore((state) => state.cancel);
  const pushToast = useUIStore((state) => state.pushToast);

  const [open, setOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const hasRealJobId = !!activeJobId && activeJobId !== "__pending__";

  const handleConfirm = async (): Promise<void> => {
    if (!activeJobId || activeJobId === "__pending__") {
      // Runner hasn't returned a job id yet — wait for the next progress
      // tick. Keep the dialog open so the user can retry the moment the
      // job becomes cancellable.
      return;
    }
    setCancelling(true);
    try {
      await cancelJob(activeJobId);
      setOpen(false);
      pushToast({
        title: `${mode === "video" ? "Video" : "Image"} generation cancelled`,
        variant: "info",
      });
    } catch (err) {
      pushToast({
        title: "Cancel failed",
        description: (err as Error)?.message ?? String(err),
        variant: "error",
      });
    } finally {
      setCancelling(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="studio-generation-cancel-button"
          aria-label="Cancel generation"
          title="Cancel generation"
        >
          <Icons.Stop weight="fill" className="size-3" aria-hidden="true" />
          <span>Stop</span>
        </button>
      </Dialog.Trigger>
      <Dialog.Content className="max-w-[420px]" showClose={false}>
        <Dialog.Title className="text-[15px] font-semibold tracking-[-0.01em] text-(--text)">
          Stop {mode === "video" ? "video" : "image"} generation?
        </Dialog.Title>
        <Dialog.Description className="mt-2 text-[13px] leading-5 text-(--text-muted)">
          {hasRealJobId
            ? "This will end the current job. Any partial result will be discarded."
            : "The job is still being prepared. Try again in a moment to cancel it cleanly."}
        </Dialog.Description>
        <div className="mt-6 flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={cancelling}>
            Keep generating
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => void handleConfirm()}
            disabled={!hasRealJobId || cancelling}
          >
            {cancelling ? "Stopping…" : "Stop generation"}
          </Button>
        </div>
      </Dialog.Content>
    </Dialog.Root>
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
