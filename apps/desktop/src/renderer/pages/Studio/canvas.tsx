import type { GalleryItem, Job } from "@imagent/core";
import { Button, Dialog, Icons } from "@imagent/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
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

/**
 * Returns the number of whole seconds elapsed since `startTime`. The clock
 * ticks every second while `active` is true and freezes otherwise — used by
 * the canvas generation badge and the running job cards to surface "how
 * long has this been going" without leaning on noisy provider progress.
 */
function useElapsedSeconds(startTime: number | null, active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active || startTime == null) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active, startTime]);
  if (startTime == null) return 0;
  return Math.max(0, Math.floor((now - startTime) / 1000));
}

function formatElapsedClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function CanvasArea({ mode }: { mode: StudioMode }) {
  const items = useGalleryStore((state) => state.items);
  const activeJobId = useJobsStore((state) => state.activeJobId);
  const jobs = useJobsStore((state) => state.jobs);
  const studioJobs = useJobsStore((state) => state.studioJobs);

  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const pinItem = useCallback((id: string): void => {
    setPinnedId(id);
  }, []);

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
  const display = pinned ?? selectedResult;
  const generating = selectedJob ? isActiveJobState(selectedJob.state) : false;

  // Siblings = every gallery item produced by the same job as `display`.
  // When a multi-image job lands, this powers the in-canvas filmstrip so
  // the user can switch between variants without leaving the focused view.
  const siblings = useMemo(() => {
    if (!display?.jobId) return [] as GalleryItem[];
    return items
      .filter((it) => it.kind === mode && it.jobId === display.jobId)
      .sort((a, b) => a.createdAt - b.createdAt);
  }, [items, display, mode]);

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-(--bg)">
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 overflow-auto p-6">
        {generating ? (
          <GeneratingCanvas
            mode={mode}
            jobId={selectedStudioJob?.id ?? null}
            prompt={selectedStudioJob?.prompt ?? ""}
            submittedAt={selectedStudioJob?.submittedAt ?? null}
          />
        ) : display ? (
          <>
            <CanvasMedia item={display} />
            {siblings.length > 1 ? (
              <CanvasFilmstrip
                siblings={siblings}
                focusedId={display.id}
                onSelect={pinItem}
              />
            ) : null}
          </>
        ) : (
          <EmptyCanvas mode={mode} />
        )}
      </div>
      <StudioJobsRail mode={mode} pinnedItemId={display?.id ?? null} onPinItem={pinItem} />
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
  submittedAt,
}: {
  mode: StudioMode;
  jobId: string | null;
  prompt: string;
  submittedAt: number | null;
}) {
  const trimmed = prompt.trim();
  const label = trimmed
    ? `Generating ${mode}: ${trimmed.slice(0, MAX_GENERATING_LABEL_PROMPT_LENGTH)}`
    : `Generating ${mode}`;
  const elapsed = useElapsedSeconds(submittedAt, jobId !== null);

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
        <span
          className="studio-generation-badge-elapsed tabular-nums"
          aria-label={`Elapsed ${elapsed} seconds`}
        >
          {formatElapsedClock(elapsed)}
        </span>
        <span className="studio-generation-badge-divider" aria-hidden="true" />
        <CancelGenerationControl mode={mode} jobId={jobId} />
      </div>
    </div>
  );
}

function StudioJobsRail({
  mode,
  pinnedItemId,
  onPinItem,
}: {
  mode: StudioMode;
  pinnedItemId: string | null;
  onPinItem: (id: string) => void;
}) {
  const studioJobs = useJobsStore((state) => state.studioJobs);
  const jobs = useJobsStore((state) => state.jobs);
  const activeJobId = useJobsStore((state) => state.activeJobId);
  const setActiveJobId = useJobsStore((state) => state.setActiveJobId);
  const dismissStudioJob = useJobsStore((state) => state.dismissStudioJob);
  const cancelJob = useJobsStore((state) => state.cancel);
  const retryJob = useJobsStore((state) => state.retry);
  const galleryItems = useGalleryStore((state) => state.items);
  const pushToast = useUIStore((state) => state.pushToast);

  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [expandedErrorId, setExpandedErrorId] = useState<string | null>(null);

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

  const retry = async (id: string): Promise<void> => {
    setRetryingId(id);
    try {
      await retryJob(id);
      pushToast({
        title: `${mode === "video" ? "Video" : "Image"} generation resubmitted`,
        variant: "success",
      });
    } catch (err) {
      pushToast({
        title: "Retry failed",
        description: (err as Error)?.message ?? String(err),
        variant: "error",
      });
    } finally {
      setRetryingId(null);
    }
  };

  const copyError = async (message: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(message);
      pushToast({ title: "Error copied", variant: "success" });
    } catch (err) {
      pushToast({
        title: "Copy failed",
        description: (err as Error)?.message ?? String(err),
        variant: "error",
      });
    }
  };

  const counts = {
    running: modeJobs.filter((j) => isActiveJobState(jobs[j.id]?.state)).length,
    failed: modeJobs.filter((j) => jobs[j.id]?.state === "failed").length,
    succeeded: modeJobs.filter((j) => jobs[j.id]?.state === "succeeded").length,
  };

  return (
    <div className="border-t border-(--border-faint) bg-(--surface)/80 px-4 py-3 backdrop-blur">
      <div className="mx-auto flex max-w-5xl flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-baseline gap-2">
            <h2 className="text-[12px] font-semibold tracking-[-0.01em] text-(--text)">
              Studio jobs
            </h2>
            <span className="text-[11px] text-(--text-faint)">
              Track multiple submissions while you keep composing.
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {counts.running > 0 ? (
              <CountChip tone="accent" label={`${counts.running} running`} />
            ) : null}
            {counts.failed > 0 ? (
              <CountChip tone="danger" label={`${counts.failed} failed`} />
            ) : null}
            {counts.succeeded > 0 && counts.running === 0 && counts.failed === 0 ? (
              <CountChip tone="muted" label={`${counts.succeeded} done`} />
            ) : null}
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {modeJobs.map((trackedJob) => {
            const job = jobs[trackedJob.id];
            const state = job?.state;
            const active = trackedJob.id === activeJobId;
            const canCancel = isActiveJobState(state);
            const resultItemId = job?.resultItemId ?? null;
            const isFailed = state === "failed";
            const isCancelled = state === "cancelled";
            const errorMessage = job?.errorMessage ?? null;
            const errorExpanded = expandedErrorId === trackedJob.id;
            const isRetrying = retryingId === trackedJob.id;

            // Multi-output fan-out: every gallery item produced by this job
            // shares the same `job_id`. Show every output as a thumbnail.
            const jobResults = trackedJob.id
              ? galleryItems
                  .filter((it) => it.kind === mode && it.jobId === trackedJob.id)
                  .sort((a, b) => a.createdAt - b.createdAt)
              : [];

            return (
              <article
                key={trackedJob.id}
                data-state={state ?? "submitted"}
                className={
                  "group/job-card flex min-w-0 flex-col gap-2 rounded-(--radius-md) border bg-(--surface-raised) p-3 " +
                  "shadow-[0_1px_0_color-mix(in_oklch,var(--border-faint)_70%,transparent)] " +
                  "transition-colors duration-(--motion-fast) " +
                  (active
                    ? "border-(--accent) ring-1 ring-(--accent)/30"
                    : isFailed
                      ? "border-(--danger)/40 hover:border-(--danger)/60"
                      : "border-(--border) hover:border-(--border-strong)")
                }
              >
                <header className="flex min-w-0 items-center gap-2">
                  <JobStateBadge state={state} />
                  <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-(--text-faint)">
                    <Icons.Timer weight="duotone" className="size-3" aria-hidden="true" />
                    {formatSubmittedAt(trackedJob.submittedAt)}
                  </span>
                </header>

                <button
                  type="button"
                  onClick={() => {
                    setActiveJobId(trackedJob.id);
                    const focusItem = resultItemId ?? jobResults[0]?.id ?? null;
                    if (focusItem) {
                      window.dispatchEvent(
                        new CustomEvent<{ id: string }>("imagent:canvas-pin", {
                          detail: { id: focusItem },
                        }),
                      );
                    }
                  }}
                  className="-mx-1 flex w-[calc(100%+0.5rem)] min-w-0 items-start gap-2 rounded-(--radius-sm) px-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--focus-ring)"
                  aria-pressed={active}
                  aria-label={`Focus job: ${trackedJob.prompt}`}
                >
                  <span className="line-clamp-2 flex-1 text-[12.5px] leading-[1.35] text-(--text)">
                    {trackedJob.prompt || (
                      <span className="italic text-(--text-muted)">(no prompt)</span>
                    )}
                  </span>
                </button>

                {/* State-specific body */}
                {canCancel ? (
                  <RunningJobProgress submittedAt={trackedJob.submittedAt} />
                ) : null}

                {state === "succeeded" && jobResults.length > 0 ? (
                  <JobResultsStrip
                    results={jobResults}
                    activeItemId={pinnedItemId}
                    onSelect={(itemId) => {
                      setActiveJobId(trackedJob.id);
                      onPinItem(itemId);
                      window.dispatchEvent(
                        new CustomEvent<{ id: string }>("imagent:canvas-pin", {
                          detail: { id: itemId },
                        }),
                      );
                    }}
                  />
                ) : null}

                {isFailed ? (
                  <JobErrorBlock
                    message={errorMessage}
                    expanded={errorExpanded}
                    onToggle={() =>
                      setExpandedErrorId(errorExpanded ? null : trackedJob.id)
                    }
                    onCopy={() => {
                      if (errorMessage) void copyError(errorMessage);
                    }}
                  />
                ) : null}

                {/* Footer actions */}
                <footer className="-mt-0.5 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-(--text-faint)">
                    {state === "succeeded" && jobResults.length > 1
                      ? `${jobResults.length} images`
                      : null}
                  </span>
                  <div className="flex items-center gap-1">
                    {canCancel ? (
                      <button
                        type="button"
                        onClick={() => void cancel(trackedJob.id)}
                        disabled={cancellingId === trackedJob.id}
                        className={
                          "inline-flex h-7 items-center gap-1 rounded-(--radius-pill) px-2.5 " +
                          "text-[11px] font-medium text-(--danger) " +
                          "hover:bg-(--danger)/10 disabled:opacity-60"
                        }
                      >
                        <Icons.Stop weight="fill" className="size-3" aria-hidden="true" />
                        {cancellingId === trackedJob.id ? "Stopping…" : "Stop"}
                      </button>
                    ) : (
                      <>
                        {isFailed || isCancelled ? (
                          <button
                            type="button"
                            onClick={() => void retry(trackedJob.id)}
                            disabled={isRetrying}
                            className={
                              "inline-flex h-7 items-center gap-1 rounded-(--radius-pill) px-2.5 " +
                              "text-[11px] font-medium text-(--accent) " +
                              "hover:bg-(--accent)/10 disabled:opacity-60"
                            }
                          >
                            <Icons.ArrowClockwise
                              weight="bold"
                              className={"size-3 " + (isRetrying ? "animate-spin" : "")}
                              aria-hidden="true"
                            />
                            {isRetrying ? "Retrying…" : "Retry"}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => dismissStudioJob(trackedJob.id)}
                          className={
                            "inline-flex h-7 items-center gap-1 rounded-(--radius-pill) px-2.5 " +
                            "text-[11px] font-medium text-(--text-muted) " +
                            "hover:bg-(--surface) hover:text-(--text)"
                          }
                        >
                          <Icons.X weight="bold" className="size-3" aria-hidden="true" />
                          Dismiss
                        </button>
                      </>
                    )}
                  </div>
                </footer>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CountChip({ tone, label }: { tone: "accent" | "danger" | "muted"; label: string }) {
  const toneClass =
    tone === "accent"
      ? "bg-(--accent)/12 text-(--accent) ring-1 ring-(--accent)/20"
      : tone === "danger"
        ? "bg-(--danger)/12 text-(--danger) ring-1 ring-(--danger)/20"
        : "bg-(--bg) text-(--text-muted) ring-1 ring-(--border-faint)";
  return (
    <span
      className={
        "inline-flex items-center gap-1 rounded-(--radius-pill) px-2 py-0.5 " +
        "text-[10.5px] font-medium tracking-[0.01em] " +
        toneClass
      }
    >
      {label}
    </span>
  );
}

/**
 * Indeterminate progress + a live MM:SS clock for a running job card.
 * Providers don't surface reliable progress numbers across image / video
 * vendors, so we show motion (the comet slide) paired with elapsed time
 * the user can act on instead of a misleading percentage.
 */
function RunningJobProgress({ submittedAt }: { submittedAt: number }) {
  const elapsed = useElapsedSeconds(submittedAt, true);
  return (
    <div className="flex items-center gap-2">
      <div
        className="studio-progress-indeterminate flex-1"
        role="progressbar"
        aria-label="Generation in progress"
      />
      <span
        className="text-[11px] tabular-nums text-(--text-muted)"
        aria-label={`Elapsed ${elapsed} seconds`}
      >
        {formatElapsedClock(elapsed)}
      </span>
    </div>
  );
}

function JobStateBadge({ state }: { state: Job["state"] | undefined }) {
  if (state === "succeeded") {
    return (
      <span className="inline-flex items-center gap-1 rounded-(--radius-pill) bg-(--success)/12 px-1.5 py-0.5 text-[10.5px] font-medium text-(--success)">
        <Icons.CheckCircle weight="fill" className="size-3" aria-hidden="true" />
        Done
      </span>
    );
  }
  if (state === "failed") {
    return (
      <span className="inline-flex items-center gap-1 rounded-(--radius-pill) bg-(--danger)/12 px-1.5 py-0.5 text-[10.5px] font-medium text-(--danger)">
        <Icons.WarningCircle weight="fill" className="size-3" aria-hidden="true" />
        Failed
      </span>
    );
  }
  if (state === "cancelled") {
    return (
      <span className="inline-flex items-center gap-1 rounded-(--radius-pill) bg-(--bg) px-1.5 py-0.5 text-[10.5px] font-medium text-(--text-muted) ring-1 ring-(--border-faint)">
        <Icons.X weight="bold" className="size-3" aria-hidden="true" />
        Cancelled
      </span>
    );
  }
  if (state === "running") {
    return (
      <span className="inline-flex items-center gap-1 rounded-(--radius-pill) bg-(--accent)/12 px-1.5 py-0.5 text-[10.5px] font-medium text-(--accent)">
        <Icons.CircleNotch
          weight="bold"
          className="size-3 animate-spin"
          aria-hidden="true"
        />
        Running
      </span>
    );
  }
  if (state === "queued") {
    return (
      <span className="inline-flex items-center gap-1 rounded-(--radius-pill) bg-(--accent)/8 px-1.5 py-0.5 text-[10.5px] font-medium text-(--accent)">
        <Icons.Timer weight="duotone" className="size-3" aria-hidden="true" />
        Queued
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-(--radius-pill) bg-(--bg) px-1.5 py-0.5 text-[10.5px] font-medium text-(--text-muted) ring-1 ring-(--border-faint)">
      <Icons.Timer weight="duotone" className="size-3" aria-hidden="true" />
      Submitted
    </span>
  );
}

function JobResultsStrip({
  results,
  activeItemId,
  onSelect,
}: {
  results: GalleryItem[];
  activeItemId: string | null;
  onSelect: (itemId: string) => void;
}) {
  return (
    <div className="-mx-0.5 flex items-center gap-1.5 overflow-x-auto pb-0.5">
      {results.map((item) => {
        const src =
          item.kind === "video"
            ? item.thumbPath
              ? resolveGalleryUrl(item.thumbPath)
              : ""
            : resolveGalleryUrl(item.relPath);
        const focused = item.id === activeItemId;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            aria-pressed={focused}
            aria-label={`Variant ${item.id}`}
            className={
              "group relative size-12 shrink-0 overflow-hidden rounded-(--radius-sm) " +
              "border transition-[border-color,transform] duration-(--motion-fast) " +
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--focus-ring) " +
              (focused
                ? "border-(--accent) ring-1 ring-(--accent)/40"
                : "border-(--border) hover:border-(--border-strong)")
            }
          >
            {src ? (
              <img
                src={src}
                alt=""
                loading="lazy"
                draggable={false}
                className="block size-full object-cover"
              />
            ) : (
              <span className="flex size-full items-center justify-center bg-(--surface-sunken) text-(--text-muted)">
                <Icons.ImageSquare weight="duotone" className="size-5" />
              </span>
            )}
            {item.kind === "video" ? (
              <span className="pointer-events-none absolute right-0.5 bottom-0.5 inline-flex size-4 items-center justify-center rounded-(--radius-pill) bg-black/55 text-white">
                <Icons.Play weight="fill" className="size-2" />
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function JobErrorBlock({
  message,
  expanded,
  onToggle,
  onCopy,
}: {
  message: string | null;
  expanded: boolean;
  onToggle: () => void;
  onCopy: () => void;
}) {
  const text = (message ?? "Provider returned no error message.").trim();
  const oneLine = text.split("\n")[0] ?? text;
  const hasMore = text.length > oneLine.length || text.includes("\n");

  return (
    <div className="rounded-(--radius-sm) border border-(--danger)/25 bg-(--danger)/8 p-2">
      <div className="flex min-w-0 items-start gap-2">
        <Icons.WarningCircle
          weight="duotone"
          className="mt-0.5 size-3.5 shrink-0 text-(--danger)"
          aria-hidden="true"
        />
        <p
          className={
            "min-w-0 flex-1 text-[11.5px] leading-[1.4] text-(--text) " +
            (expanded
              ? "whitespace-pre-wrap break-words"
              : hasMore
                ? "truncate"
                : "whitespace-normal break-words")
          }
        >
          {expanded ? text : oneLine}
        </p>
      </div>
      <div className="mt-1.5 flex items-center justify-end gap-1">
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex h-6 items-center gap-1 rounded-(--radius-pill) px-2 text-[10.5px] font-medium text-(--text-muted) hover:bg-(--surface) hover:text-(--text)"
        >
          Copy
        </button>
        {hasMore ? (
          <button
            type="button"
            onClick={onToggle}
            className="inline-flex h-6 items-center gap-1 rounded-(--radius-pill) px-2 text-[10.5px] font-medium text-(--text-muted) hover:bg-(--surface) hover:text-(--text)"
          >
            <Icons.CaretDown
              weight="bold"
              className={
                "size-3 transition-transform duration-(--motion-fast) " +
                (expanded ? "rotate-180" : "")
              }
              aria-hidden="true"
            />
            {expanded ? "Hide details" : "Show details"}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function CanvasFilmstrip({
  siblings,
  focusedId,
  onSelect,
}: {
  siblings: GalleryItem[];
  focusedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div
      className={
        "flex max-w-full items-center gap-2 overflow-x-auto rounded-(--radius-pill) " +
        "border border-(--border-faint) bg-(--surface-raised)/85 px-2 py-1.5 backdrop-blur"
      }
      aria-label="Variants generated for this job"
    >
      {siblings.map((item, idx) => {
        const focused = item.id === focusedId;
        const src =
          item.kind === "video"
            ? item.thumbPath
              ? resolveGalleryUrl(item.thumbPath)
              : ""
            : resolveGalleryUrl(item.relPath);
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            aria-pressed={focused}
            aria-label={`Variant ${idx + 1} of ${siblings.length}`}
            className={
              "relative size-14 shrink-0 overflow-hidden rounded-(--radius-sm) " +
              "border transition-[border-color,transform] duration-(--motion-fast) " +
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--focus-ring) " +
              (focused
                ? "border-(--accent) ring-2 ring-(--accent)/35"
                : "border-(--border) hover:border-(--border-strong) hover:scale-[1.02]")
            }
          >
            {src ? (
              <img
                src={src}
                alt=""
                loading="lazy"
                draggable={false}
                className="block size-full object-cover"
              />
            ) : (
              <span className="flex size-full items-center justify-center bg-(--surface-sunken) text-(--text-muted)">
                <Icons.ImageSquare weight="duotone" className="size-5" />
              </span>
            )}
            <span className="pointer-events-none absolute top-0.5 left-0.5 inline-flex min-w-[14px] items-center justify-center rounded-(--radius-pill) bg-black/55 px-1 text-[9px] font-medium text-white tabular-nums">
              {idx + 1}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function formatSubmittedAt(ts: number): string {
  return submittedAtFormatter.format(ts);
}

function CancelGenerationControl({ mode, jobId }: { mode: StudioMode; jobId: string | null }) {
  const cancelJob = useJobsStore((state) => state.cancel);
  const pushToast = useUIStore((state) => state.pushToast);

  const [open, setOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const handleConfirm = async (): Promise<void> => {
    if (!jobId) return;
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
          This will end the current job. Any partial result will be discarded.
        </Dialog.Description>
        <div className="mt-6 flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={cancelling}>
            Keep generating
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => void handleConfirm()}
            disabled={!jobId || cancelling}
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
