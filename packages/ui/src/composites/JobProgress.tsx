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
  className?: string;
}

/**
 * JobProgress per design.md §10. The image variant is an indeterminate striped
 * bar that completes on `state === "succeeded"`. ~24px tall, accent-color
 * stripes over `surface-raised`. Video presentation is deferred to M7 — the
 * video branch renders a dim "video progress not yet wired" placeholder.
 */
export function JobProgress({
  kind,
  state,
  progress,
  label,
  errorMessage,
  onCancel,
  className,
}: JobProgressProps) {
  if (kind === "video") {
    // TODO(M7): subscribe to provider polling cadence + render a determinate
    // bar with the persisted progress value. For now we render a dim line so
    // the layout doesn't shift when a video job starts (impossible in M5).
    return (
      <div
        className={cn(
          "rounded-(--radius-md) border border-dashed border-(--color-hairline) " +
            "bg-(--color-surface-soft) px-3 py-2 text-(length:--text-caption) text-(--color-muted)",
          className,
        )}
      >
        Video progress not yet wired (M7).
      </div>
    );
  }

  const isTerminal =
    state === "succeeded" || state === "failed" || state === "cancelled";
  const isError = state === "failed";

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-(--radius-md) border border-(--color-hairline) " +
          "bg-(--color-canvas) px-3 py-2",
        className,
      )}
    >
      <div className="flex flex-1 flex-col gap-1">
        <div className="flex items-center gap-2 text-(length:--text-caption) text-(--color-muted)">
          <span className="font-semibold uppercase tracking-[1.5px] text-(length:--text-caption-uppercase)">
            {humanState(state)}
          </span>
          {label ? <span className="truncate text-(--color-muted)">{label}</span> : null}
        </div>
        <div
          className={cn(
            "relative h-6 w-full overflow-hidden rounded-(--radius-sm)",
            "bg-(--color-surface-strong)",
          )}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={1}
          aria-valuenow={progress ?? undefined}
        >
          {isError ? (
            <div className="absolute inset-0 bg-(--color-error)/40" />
          ) : isTerminal ? (
            <div
              className="absolute inset-y-0 left-0 bg-(--color-accent)"
              style={{ width: state === "succeeded" ? "100%" : "0%" }}
            />
          ) : (
            // Striped indeterminate bar.
            <div
              className="absolute inset-0 bg-(--color-accent) opacity-80"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(45deg, rgba(255,255,255,0.35) 0 8px, transparent 8px 16px)",
                width:
                  typeof progress === "number"
                    ? `${Math.max(0, Math.min(1, progress)) * 100}%`
                    : "100%",
                animation:
                  typeof progress !== "number"
                    ? "imagine-stripe 1.2s linear infinite"
                    : undefined,
              }}
            />
          )}
        </div>
        {isError && errorMessage ? (
          <span className="text-(length:--text-caption) text-(--color-error)">
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
      <style>{`@keyframes imagine-stripe { to { background-position: 32px 0; } }`}</style>
    </div>
  );
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
