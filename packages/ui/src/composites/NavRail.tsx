import { Brain, Cube, Gear, Image, Plug, SquaresFour } from "@phosphor-icons/react";
import type { ComponentType, ReactNode } from "react";
import { cn } from "../lib/cn.js";

export type NavRoute = "studio" | "gallery" | "assets" | "models" | "providers" | "settings";

interface NavRailRow {
  id: NavRoute;
  label: string;
  Icon: ComponentType<{ weight?: "duotone"; className?: string }>;
  icon?: ReactNode;
}

export interface NavRailRoute {
  id: NavRoute;
  label: string;
  icon?: ReactNode;
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

export interface NavRailProps {
  activeRoute: NavRoute;
  onNavigate: (route: NavRoute) => void;
  routes?: ReadonlyArray<NavRailRoute>;
  /** App version (rendered as a caption under the wordmark). */
  version?: string;
  className?: string;
}

/**
 * NavRail. Persistent 220px left rail. Wordmark + version
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
  routes,
  version = "v0.0.1",
  className,
}: NavRailProps) {
  const rows = routes ? mergeNavRows(routes) : NAV_ROWS;
  const topNav = rows.filter((r) => r.id !== "settings");
  const bottomNav = rows.filter((r) => r.id === "settings");

  return (
    <nav
      aria-label="Primary"
      className={cn(
        "flex h-full w-[var(--rail-nav,220px)] shrink-0 flex-col " +
          "border-r border-(--border) bg-(--bg)",
        className,
      )}
    >
      <div className="px-4 pb-2 pt-4">
        <div className="text-base font-semibold text-(--text)">Imagine</div>
        <div className="text-xs text-(--text-muted)">{version}</div>
      </div>

      {/* Top nav rows (Studio / Gallery / Assets / Providers) */}
      <ul className="flex flex-col gap-1 p-3">
        {topNav.map((r) => (
          <li key={r.id}>
            <NavRowButton row={r} active={r.id === activeRoute} onClick={() => onNavigate(r.id)} />
          </li>
        ))}
      </ul>

      {/* Bottom nav rows (Settings), pushed to the bottom by mt-auto */}
      <ul className="mt-auto flex flex-col gap-1 p-3">
        {bottomNav.map((r) => (
          <li key={r.id}>
            <NavRowButton row={r} active={r.id === activeRoute} onClick={() => onNavigate(r.id)} />
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
  const { Icon, icon, label } = row;
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
      <span
        className={cn(
          "flex size-5 shrink-0 items-center justify-center",
          active ? "text-(--accent)" : "text-(--text-muted) group-hover:text-(--text)",
        )}
      >
        {icon ?? <Icon weight="duotone" className="size-5" />}
      </span>
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

function mergeNavRows(routes: ReadonlyArray<NavRailRoute>): NavRailRow[] {
  return routes.map((route) => {
    const fallback = NAV_ROWS.find((row) => row.id === route.id);
    return {
      id: route.id,
      label: route.label,
      Icon: fallback?.Icon ?? Image,
      icon: route.icon,
    };
  });
}

/** Test seam — re-export for consumers that need to render their own row list. */
export const NAV_RAIL_ROWS = NAV_ROWS;
