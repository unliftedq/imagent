import { useState, type ReactNode } from "react";
import { CaretRight, Check, CircleNotch, WarningCircle, XCircle } from "@phosphor-icons/react";
import { Button } from "../primitives/Button.js";
import { Tooltip } from "../primitives/Tooltip.js";
import { cn } from "../lib/cn.js";

export type ProviderTestStatus =
  | { kind: "idle" }
  | { kind: "testing" }
  | { kind: "ok"; latencyMs?: number; sampleModelId?: string }
  | { kind: "error"; reason: string; status?: number };

export interface ProviderRowProps {
  /** Vendor display name shown in the row header. */
  name: string;
  /** Tagline / sub-text under the name. */
  description?: string;
  /** Whether the provider has at least one secret saved. */
  configured: boolean;
  /** Current test status (drives the indicator color). */
  status: ProviderTestStatus;
  /** Children render the collapsible config form. */
  children: ReactNode;
  /** "Test" button click — async, status updates handled by parent. */
  onTest: () => void;
  /** "Save" button click — likely calls providers.config.set + secrets.set. */
  onSave?: () => void;
  /** Optional badge content rendered next to the name (e.g. "shared key"). */
  badge?: ReactNode;
  defaultOpen?: boolean;
}

/**
 * Single row on the Providers page. Always renders a header with name,
 * status indicator, and a Test button. The body is collapsible — click the
 * caret or the row header to expand the config form (rendered as `children`).
 */
export function ProviderRow({
  name,
  description,
  configured,
  status,
  children,
  onTest,
  onSave,
  badge,
  defaultOpen = false,
}: ProviderRowProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div
      className={cn(
        "rounded-(--radius-lg) border border-(--color-hairline) bg-(--color-canvas) overflow-hidden",
      )}
    >
      <div className="flex items-center gap-4 px-5 py-4">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex flex-1 items-center gap-3 text-left focus-visible:outline-none"
          aria-expanded={open}
        >
          <CaretRight
            weight="bold"
            className={cn(
              "size-4 text-(--color-muted) transition-transform duration-(--duration-fast)",
              open && "rotate-90",
            )}
          />
          <StatusDot status={status} />
          <div className="flex flex-1 flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <span className="text-(length:--text-title-sm) font-semibold text-(--color-ink)">
                {name}
              </span>
              {badge}
              {!configured ? (
                <span className="rounded-(--radius-pill) bg-(--color-surface-soft) px-2 py-0.5 text-(length:--text-caption-uppercase) tracking-[1.5px] text-(--color-muted)">
                  NOT CONFIGURED
                </span>
              ) : null}
            </div>
            {description ? (
              <span className="text-(length:--text-body-sm) text-(--color-muted)">
                {description}
              </span>
            ) : null}
          </div>
        </button>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onTest();
            }}
            disabled={status.kind === "testing"}
            leadingIcon={
              status.kind === "testing" ? (
                <CircleNotch weight="bold" className="size-4 animate-spin" />
              ) : null
            }
          >
            Test
          </Button>
          {onSave ? (
            <Button
              variant="primary"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onSave();
              }}
            >
              Save
            </Button>
          ) : null}
        </div>
      </div>
      {open ? (
        <div className="border-t border-(--color-hairline-soft) bg-(--color-surface-soft) p-5">
          {children}
        </div>
      ) : null}
    </div>
  );
}

function StatusDot({ status }: { status: ProviderTestStatus }) {
  if (status.kind === "ok") {
    return (
      <Tooltip
        content={
          status.latencyMs !== undefined
            ? `Connected · ${status.latencyMs}ms${status.sampleModelId ? ` · ${status.sampleModelId}` : ""}`
            : "Connected"
        }
      >
        <span className="inline-flex size-5 items-center justify-center rounded-(--radius-full) bg-(--color-brand-mint)/30 text-(--color-brand-teal)">
          <Check weight="bold" className="size-3.5" />
        </span>
      </Tooltip>
    );
  }
  if (status.kind === "error") {
    return (
      <Tooltip
        content={status.status ? `${status.reason} (HTTP ${status.status})` : status.reason}
      >
        <span className="inline-flex size-5 items-center justify-center rounded-(--radius-full) bg-(--color-error)/15 text-(--color-error)">
          <XCircle weight="fill" className="size-4" />
        </span>
      </Tooltip>
    );
  }
  if (status.kind === "testing") {
    return (
      <span className="inline-flex size-5 items-center justify-center rounded-(--radius-full) bg-(--color-surface-card) text-(--color-muted)">
        <CircleNotch weight="bold" className="size-3.5 animate-spin" />
      </span>
    );
  }
  return (
    <Tooltip content="Untested — click Test to verify the connection.">
      <span className="inline-flex size-5 items-center justify-center rounded-(--radius-full) bg-(--color-surface-card) text-(--color-muted)">
        <WarningCircle weight="bold" className="size-3.5" />
      </span>
    </Tooltip>
  );
}
