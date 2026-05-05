import { X } from "@phosphor-icons/react";
import { IconButton } from "../primitives/IconButton.js";
import { cn } from "../lib/cn.js";

export type JobProgressKind = "image" | "video";
export type JobProgressState =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export interface JobProgressProps {
  kind: JobProgressKind;
  state: JobProgressState;
  /** 0..1 if known, undefined for indeterminate. */
  progress?: number;
  /** A short prompt or label shown beside the bar. */
  label?: string;
  errorMessage?: string;
  onCancel?: () => void;
  /** Epoch ms when the job started — drives elapsed-time display (video). */
  startedAt?: number;
  /** Epoch ms reference for "now" — defaults to Date.now(). Test seam. */
  now?: number;
  className?: string;
}

/**
 * JobProgress per design.md §10. The image variant is an indeterminate striped
 * bar that completes on `state === "succeeded"`. ~24px tall, accent-color
 * stripes over `surface-raised`. The video variant (M7) is visually larger
 * (4px tall accent bar atop a label + elapsed/ETA row) and renders
 * determinate when `progress` is known, indeterminate striped otherwise.
 */
export function JobProgress({
  kind,
  state,
  progress,
  label,
  errorMessage,
  onCancel,
  startedAt,
  now,
  className,
}: JobProgressProps) {
  if (kind === "video") {
    return (
      <VideoVariant
        state={state}
        progress={progress}
        label={label}
        {...(errorMessage !== undefined ? { errorMessage } : {})}
        {...(onCancel ? { onCancel } : {})}
        {...(startedAt !== undefined ? { startedAt } : {})}
        {...(now !== undefined ? { now } : {})}
        {...(className !== undefined ? { className } : {})}
      />
    );
  }

  const isTerminal =
    state === "succeeded" || state === "failed" || state === "cancelled";
  const isError = state === "failed";

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-(--radius-md) border border-(--border) " +
          "bg-(--bg) px-3 py-2",
        className,
      )}
    >
      <div className="flex flex-1 flex-col gap-1">
        <div className="flex items-center gap-2 text-(length:--text-caption) text-(--text-muted)">
          <span className="font-semibold uppercase tracking-[1.5px] text-(length:--text-caption-uppercase)">
            {humanState(state)}
          </span>
          {label ? <span className="truncate text-(--text-muted)">{label}</span> : null}
        </div>
        <div
          className={cn(
            "relative h-6 w-full overflow-hidden rounded-(--radius-sm)",
            "bg-(--surface-sunken)",
          )}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={1}
          aria-valuenow={progress ?? undefined}
        >
          {isError ? (
            <div className="absolute inset-0 bg-(--danger)/40" />
          ) : isTerminal ? (
            <div
              className="absolute inset-y-0 left-0 bg-(--accent)"
              style={{ width: state === "succeeded" ? "100%" : "0%" }}
            />
          ) : (
            // Striped indeterminate bar.
            <div
              className="absolute inset-0 bg-(--accent) opacity-80"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(45deg, rgba(255,255,255,0.35) 0 8px, transparent 8px 16px)",
                width:
                  typeof progress === "number"
                    ? `${Math.max(0, Math.min(1, progress)) * 100}%`
                    : "100%",
                animation:
                  typeof progress !== "number"
                    ? "imagent-stripe 1.2s linear infinite"
                    : undefined,
              }}
            />
          )}
        </div>
        {isError && errorMessage ? (
          <span className="text-(length:--text-caption) text-(--danger)">
            {errorMessage}
          </span>
        ) : null}
      </div>
      {onCancel && !isTerminal ? (
        <IconButton
          icon={<X weight="bold" className="size-4" />}
          aria-label="Cancel job"
          size="sm"
          onClick={onCancel}
        />
      ) : null}
      {/* Stripes keyframes — global; harmless if duplicated. */}
      <style>{`@keyframes imagent-stripe { to { background-position: 32px 0; } }`}</style>
    </div>
  );
}

/**
 * Video variant: visually larger than image (4px tall accent bar atop a
 * caption + elapsed/ETA row + cancel button). Determinate when `progress`
 * is known; indeterminate striped otherwise.
 */
function VideoVariant({
  state,
  progress,
  label,
  errorMessage,
  onCancel,
  startedAt,
  now,
  className,
}: Omit<JobProgressProps, "kind">) {
  const isTerminal =
    state === "succeeded" || state === "failed" || state === "cancelled";
  const isError = state === "failed";
  const t = now ?? Date.now();
  const elapsedMs = startedAt ? Math.max(0, t - startedAt) : 0;
  const elapsedSec = Math.round(elapsedMs / 1000);

  // ETA: linear extrapolation, capped at 600s, only when progress is known
  // and we have at least 2s of data (avoid wild estimates from the first tick).
  let etaSec: number | null = null;
  if (
    typeof progress === "number" &&
    progress > 0.05 &&
    startedAt &&
    elapsedSec >= 2 &&
    !isTerminal
  ) {
    const total = elapsedSec / progress;
    const rem = Math.max(0, Math.min(600, Math.round(total - elapsedSec)));
    etaSec = rem;
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-(--radius-md) border border-(--border) " +
          "bg-(--bg) px-4 py-3",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-center gap-2 text-(length:--text-caption) text-(--text-muted)">
            <span className="font-semibold uppercase tracking-[1.5px] text-(length:--text-caption-uppercase)">
              {humanState(state)}
            </span>
            {label ? (
              <span className="truncate text-(--text)">{label}</span>
            ) : null}
          </div>
          <div className="flex items-center gap-3 text-(length:--text-caption) text-(--text-faint) [font-variant-numeric:tabular-nums]">
            <span>{formatDuration(elapsedSec)} elapsed</span>
            {etaSec !== null ? <span>~{formatDuration(etaSec)} remaining</span> : null}
            {typeof progress === "number" && !isTerminal ? (
              <span>{Math.round(progress * 100)}%</span>
            ) : null}
          </div>
        </div>
        {onCancel && !isTerminal ? (
          <IconButton
            icon={<X weight="bold" className="size-4" />}
            aria-label="Cancel video job"
            size="sm"
            onClick={onCancel}
          />
        ) : null}
      </div>
      <div
        className="relative h-1 w-full overflow-hidden rounded-(--radius-pill) bg-(--surface-sunken)"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={1}
        aria-valuenow={progress ?? undefined}
      >
        {isError ? (
          <div className="absolute inset-0 bg-(--danger)/60" />
        ) : isTerminal ? (
          <div
            className="absolute inset-y-0 left-0 bg-(--accent)"
            style={{ width: state === "succeeded" ? "100%" : "0%" }}
          />
        ) : typeof progress === "number" ? (
          <div
            className="absolute inset-y-0 left-0 bg-(--accent) transition-[width] duration-(--duration-base)"
            style={{ width: `${Math.max(0, Math.min(1, progress)) * 100}%` }}
          />
        ) : (
          <div
            className="absolute inset-0 bg-(--accent)/80"
            style={{
              backgroundImage:
                "repeating-linear-gradient(45deg, rgba(255,255,255,0.35) 0 8px, transparent 8px 16px)",
              animation: "imagent-stripe 1.2s linear infinite",
            }}
          />
        )}
      </div>
      {isError && errorMessage ? (
        <span className="text-(length:--text-caption) text-(--danger)">
          {errorMessage}
        </span>
      ) : null}
      <style>{`@keyframes imagent-stripe { to { background-position: 32px 0; } }`}</style>
    </div>
  );
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function humanState(s: JobProgressState): string {
  switch (s) {
    case "queued":
      return "Queued";
    case "running":
      return "Generating";
    case "succeeded":
      return "Done";
    case "failed":
      return "Failed";
    case "cancelled":
      return "Cancelled";
  }
}
