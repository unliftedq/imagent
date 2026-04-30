import {
  Image,
  SquaresFour,
  Cube,
  Plug,
  Gear,
  Brain,
} from "@phosphor-icons/react";
import type { ComponentType } from "react";
import { cn } from "../lib/cn.js";

export type NavRoute =
  | "studio"
  | "gallery"
  | "assets"
  | "models"
  | "providers"
  | "settings";

interface NavRailRow {
  id: NavRoute;
  label: string;
  Icon: ComponentType<{ weight?: "duotone"; className?: string }>;
}

/**
 * Persistent rail rows. Phosphor duotone icons at 20px. The wordmark sits
 * above the rows; Settings is pinned to the bottom.
 */
const NAV_ROWS: ReadonlyArray<NavRailRow> = [
  { id: "studio", label: "Studio", Icon: Image },
  { id: "gallery", label: "Gallery", Icon: SquaresFour },
  { id: "assets", label: "Assets", Icon: Cube },
  { id: "models", label: "Models", Icon: Brain },
  { id: "providers", label: "Providers", Icon: Plug },
  { id: "settings", label: "Settings", Icon: Gear },
] as const;

const TOP_NAV: ReadonlyArray<NavRailRow> = NAV_ROWS.filter(
  (r) => r.id !== "settings",
);
const BOTTOM_NAV: ReadonlyArray<NavRailRow> = NAV_ROWS.filter(
  (r) => r.id === "settings",
);

export interface NavRailProps {
  activeRoute: NavRoute;
  onNavigate: (route: NavRoute) => void;
  /** App version (rendered as a caption under the wordmark). */
  version?: string;
  className?: string;
}

/**
 * NavRail — DESIGN.md §10.1. Persistent 220px left rail. Wordmark + version
 * at the top, four primary nav rows flush below, and Settings pinned to the
 * bottom via `mt-auto`. No top app bar exists; this rail is the only
 * persistent structural chrome.
 *
 * The wordmark "Imagine" stays monochrome (`--text`) — the accent is reserved
 * for the active row indicator, which sits as a 2px `--border-strong` left
 * edge plus accent text + accent-tinted icon.
 */
export function NavRail({
  activeRoute,
  onNavigate,
  version = "v0.0.1",
  className,
}: NavRailProps) {
  return (
    <nav
      aria-label="Primary"
      className={cn(
        "flex h-full w-[var(--rail-nav,220px)] shrink-0 flex-col " +
          "border-r border-(--border) bg-(--bg)",
        className,
      )}
    >
      {/* Wordmark */}
      <div className="flex items-center gap-2 px-4 pt-4 pb-3">
        <div
          aria-hidden="true"
          className={
            "inline-flex size-7 items-center justify-center rounded-(--radius-sm) " +
            "border border-(--border) bg-(--surface-raised) text-(--text)"
          }
        >
          <Image weight="duotone" className="size-4" />
        </div>
        <div className="flex flex-col leading-none">
          <span className="text-[20px] font-semibold tracking-[-0.01em] text-(--text)">
            Imagine
          </span>
          <span className="mt-0.5 text-[11px] font-medium text-(--text-faint)">
            {version}
          </span>
        </div>
      </div>

      <div className="mx-4 my-1 h-px bg-(--border-faint)" aria-hidden="true" />

      {/* Top nav rows (Studio / Gallery / Assets / Providers) */}
      <ul className="flex flex-col gap-1 p-3">
        {TOP_NAV.map((r) => (
          <li key={r.id}>
            <NavRowButton
              row={r}
              active={r.id === activeRoute}
              onClick={() => onNavigate(r.id)}
            />
          </li>
        ))}
      </ul>

      {/* Bottom nav rows (Settings), pushed to the bottom by mt-auto */}
      <ul className="mt-auto flex flex-col gap-1 p-3">
        {BOTTOM_NAV.map((r) => (
          <li key={r.id}>
            <NavRowButton
              row={r}
              active={r.id === activeRoute}
              onClick={() => onNavigate(r.id)}
            />
          </li>
        ))}
      </ul>
    </nav>
  );
}

function NavRowButton({
  row,
  active,
  onClick,
}: {
  row: NavRailRow;
  active: boolean;
  onClick: () => void;
}) {
  const { Icon, label } = row;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex h-10 w-full items-center gap-3 rounded-(--radius-sm) " +
          "pl-3 pr-2 text-left transition-colors duration-(--motion-fast) " +
          "ease-(--ease-out) focus-visible:outline-none focus-visible:ring-2 " +
          "focus-visible:ring-(--focus-ring) focus-visible:ring-offset-2 " +
          "focus-visible:ring-offset-(--bg)",
        active
          ? "bg-(--accent-soft) text-(--accent)"
          : "text-(--text-muted) hover:bg-(--surface-sunken) hover:text-(--text)",
      )}
    >
      <Icon
        weight="duotone"
        className={cn(
          "size-5 shrink-0",
          active ? "text-(--accent)" : "text-(--text-muted) group-hover:text-(--text)",
        )}
      />
      <span
        className={cn(
          "text-[13px]",
          active ? "font-semibold" : "font-normal group-hover:font-semibold",
        )}
      >
        {label}
      </span>
    </button>
  );
}

/** Test seam — re-export for consumers that need to render their own row list. */
export const NAV_RAIL_ROWS = NAV_ROWS;
