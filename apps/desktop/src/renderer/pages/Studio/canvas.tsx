import type { GalleryItem, Job } from "@imagent/core";
import { Button, Dialog, Icons } from "@imagent/ui";
import { useEffect, useMemo, useState } from "react";
import { useGalleryStore } from "../../state/useGalleryStore.js";
import { useJobsStore } from "../../state/useJobsStore.js";
import type { StudioMode } from "../../state/useUIStore.js";
import { useUIStore } from "../../state/useUIStore.js";
import { resolveGalleryUrl } from "./utils.js";

const MAX_GENERATING_LABEL_PROMPT_LENGTH = 80;
const submittedAtFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
});

export function CanvasArea({ mode }: { mode: StudioMode }) {
  const items = useGalleryStore((state) => state.items);
  const activeJobId = useJobsStore((state) => state.activeJobId);
  const jobs = useJobsStore((state) => state.jobs);
  const studioJobs = useJobsStore((state) => state.studioJobs);

  const [pinnedId, setPinnedId] = useState<string | null>(null);

  useEffect(() => {
    const onPin = (event: Event): void => {
      const customEvent = event as CustomEvent<{ id: string }>;
      if (customEvent.detail?.id) setPinnedId(customEvent.detail.id);
    };
    window.addEventListener("imagent:canvas-pin", onPin as EventListener);
    return () => {
      window.removeEventListener("imagent:canvas-pin", onPin as EventListener);
    };
  }, []);

  const pinned = useMemo(() => {
    const item = pinnedId ? (items.find((candidate) => candidate.id === pinnedId) ?? null) : null;
    return item?.kind === mode ? item : null;
  }, [items, pinnedId, mode]);

  const modeJobs = useMemo(() => studioJobs.filter((job) => job.kind === mode), [mode, studioJobs]);
  const activeModeJob = modeJobs.find((job) => job.id === activeJobId) ?? null;
  // studioJobs is newest-first, so the first running fallback is the latest submitted job.
  const fallbackRunningJob = modeJobs.find((job) => isActiveJobState(jobs[job.id]?.state)) ?? null;
  const selectedStudioJob = activeModeJob ?? fallbackRunningJob;
  const selectedJob = selectedStudioJob ? (jobs[selectedStudioJob.id] ?? null) : null;
  const selectedResult =
    selectedJob?.resultItemId && selectedJob.kind === mode
      ? (items.find((item) => item.id === selectedJob.resultItemId) ?? null)
      : null;
  const display = selectedResult ?? pinned;
  const generating = selectedJob ? isActiveJobState(selectedJob.state) : false;

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-(--bg)">
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-6">
        {generating ? (
          <GeneratingCanvas
            mode={mode}
            jobId={selectedStudioJob?.id ?? null}
            prompt={selectedStudioJob?.prompt ?? ""}
          />
        ) : display ? (
          <CanvasMedia item={display} />
        ) : (
          <EmptyCanvas mode={mode} />
        )}
      </div>
      <StudioJobsMonitor mode={mode} />
    </section>
  );
}

function isActiveJobState(state: Job["state"] | undefined): boolean {
  return state === "queued" || state === "running";
}

function GeneratingCanvas({
  mode,
  jobId,
  prompt,
}: {
  mode: StudioMode;
  jobId: string | null;
  prompt: string;
}) {
  const trimmed = prompt.trim();
  const label = trimmed
    ? `Generating ${mode}: ${trimmed.slice(0, MAX_GENERATING_LABEL_PROMPT_LENGTH)}`
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
        <CancelGenerationControl mode={mode} jobId={jobId} />
      </div>
    </div>
  );
}

function StudioJobsMonitor({ mode }: { mode: StudioMode }) {
  const studioJobs = useJobsStore((state) => state.studioJobs);
  const jobs = useJobsStore((state) => state.jobs);
  const activeJobId = useJobsStore((state) => state.activeJobId);
  const setActiveJobId = useJobsStore((state) => state.setActiveJobId);
  const dismissStudioJob = useJobsStore((state) => state.dismissStudioJob);
  const cancelJob = useJobsStore((state) => state.cancel);
  const pushToast = useUIStore((state) => state.pushToast);

  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const modeJobs = studioJobs.filter((job) => job.kind === mode);
  if (modeJobs.length === 0) return null;

  const cancel = async (id: string): Promise<void> => {
    setCancellingId(id);
    try {
      await cancelJob(id);
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
      setCancellingId(null);
    }
  };

  return (
    <div className="border-t border-(--border-faint) bg-(--surface)/80 px-4 py-3 backdrop-blur">
      <div className="mx-auto flex max-w-5xl flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-[12px] font-semibold text-(--text)">Studio jobs</h2>
            <p className="text-[11px] text-(--text-muted)">
              Track multiple submitted jobs while continuing to compose.
            </p>
          </div>
          <span className="rounded-(--radius-pill) bg-(--bg) px-2 py-1 text-[11px] text-(--text-muted)">
            {modeJobs.length} recent
          </span>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {modeJobs.map((trackedJob) => {
            const job = jobs[trackedJob.id];
            const state = job?.state;
            const active = trackedJob.id === activeJobId;
            const progress = Math.max(0, Math.min(1, job?.progress ?? 0));
            const canCancel = isActiveJobState(state);
            const resultItemId = job?.resultItemId ?? null;
            return (
              <div
                key={trackedJob.id}
                className={
                  "min-w-0 rounded-(--radius-md) border bg-(--surface-raised) p-2 " +
                  (active ? "border-(--accent)" : "border-(--border)")
                }
              >
                <button
                  type="button"
                  onClick={() => {
                    setActiveJobId(trackedJob.id);
                    if (resultItemId) {
                      window.dispatchEvent(
                        new CustomEvent<{ id: string }>("imagent:canvas-pin", {
                          detail: { id: resultItemId },
                        }),
                      );
                    }
                  }}
                  className="flex w-full min-w-0 items-start gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--focus-ring)"
                  aria-pressed={active}
                >
                  <JobStateIcon state={state} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-medium text-(--text)">
                      {trackedJob.prompt}
                    </span>
                    <span className="mt-1 flex items-center gap-2 text-[11px] text-(--text-muted)">
                      <span>{jobStateLabel(state)}</span>
                      <span aria-hidden="true">·</span>
                      <span>{formatSubmittedAt(trackedJob.submittedAt)}</span>
                    </span>
                  </span>
                </button>
                <div className="mt-2 h-1 overflow-hidden rounded-(--radius-pill) bg-(--border-faint)">
                  <div
                    className={
                      "h-full rounded-(--radius-pill) " +
                      (state === "failed" || state === "cancelled"
                        ? "bg-(--danger)"
                        : "bg-(--accent)")
                    }
                    style={{
                      width: `${state === "succeeded" ? 100 : Math.round(progress * 100)}%`,
                    }}
                  />
                </div>
                <div className="mt-2 flex items-center justify-end gap-1">
                  {canCancel ? (
                    <button
                      type="button"
                      onClick={() => void cancel(trackedJob.id)}
                      disabled={cancellingId === trackedJob.id}
                      className="inline-flex h-7 items-center gap-1 rounded-(--radius-pill) px-2 text-[11px] font-medium text-(--danger) hover:bg-(--danger-soft) disabled:opacity-60"
                    >
                      <Icons.Stop weight="fill" className="size-3" aria-hidden="true" />
                      {cancellingId === trackedJob.id ? "Stopping…" : "Stop"}
                    </button>
                  ) : null}
                  {!canCancel ? (
                    <button
                      type="button"
                      onClick={() => dismissStudioJob(trackedJob.id)}
                      className="inline-flex h-7 items-center rounded-(--radius-pill) px-2 text-[11px] font-medium text-(--text-muted) hover:bg-(--surface) hover:text-(--text)"
                    >
                      Dismiss
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function JobStateIcon({ state }: { state: Job["state"] | undefined }) {
  if (state === "succeeded") {
    return <Icons.CheckCircle weight="fill" className="mt-0.5 size-4 shrink-0 text-(--success)" />;
  }
  if (state === "failed" || state === "cancelled") {
    return <Icons.XCircle weight="fill" className="mt-0.5 size-4 shrink-0 text-(--danger)" />;
  }
  if (state === "queued" || state === "running") {
    return (
      <Icons.CircleNotch
        weight="bold"
        className="mt-0.5 size-4 shrink-0 animate-spin text-(--accent)"
      />
    );
  }
  return <Icons.Timer weight="duotone" className="mt-0.5 size-4 shrink-0 text-(--text-muted)" />;
}

function jobStateLabel(state: Job["state"] | undefined): string {
  switch (state) {
    case "queued":
      return "Queued";
    case "running":
      return "Running";
    case "succeeded":
      return "Done";
    case "failed":
      return "Failed";
    case "cancelled":
      return "Cancelled";
    default:
      return "Submitted";
  }
}

function formatSubmittedAt(ts: number): string {
  return submittedAtFormatter.format(ts);
}

function CancelGenerationControl({ mode, jobId }: { mode: StudioMode; jobId: string | null }) {
  const cancelJob = useJobsStore((state) => state.cancel);
  const pushToast = useUIStore((state) => state.pushToast);

  const [open, setOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const hasRealJobId = !!jobId && jobId !== "__pending__";

  const handleConfirm = async (): Promise<void> => {
    if (!jobId || jobId === "__pending__") {
      // Runner hasn't returned a job id yet — wait for the next progress
      // tick. Keep the dialog open so the user can retry the moment the
      // job becomes cancellable.
      return;
    }
    setCancelling(true);
    try {
      await cancelJob(jobId);
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
