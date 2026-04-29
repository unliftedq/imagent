import { useDroppable } from "@dnd-kit/core";
import { type ReactNode } from "react";
import { Tooltip } from "../primitives/Tooltip.js";
import { cn } from "../lib/cn.js";

export interface BoardSidebarItemProps {
  /** A unique id used as a `useDroppable` target. Use the board id, or
   *  sentinels like "all" / "favorites" for the virtual rows. */
  id: string;
  label: string;
  /** Total items currently in the board (for the count badge). */
  count?: number;
  active?: boolean;
  /** When set, makes this row a drop target for `gallery-item:*` draggables. */
  acceptsDrop?: boolean;
  onClick?: () => void;
  /** Trailing decoration (e.g. icon or context menu trigger). */
  trailing?: ReactNode;
  /** Show a leading dot/icon. */
  leading?: ReactNode;
  className?: string;
}

/**
 * Single row in the Boards sidebar — board name + item count, drop target via
 * `useDroppable`, accent ring while hovering during drag. Tooltips overflow
 * the long names; click triggers `onClick`.
 */
export function BoardSidebarItem({
  id,
  label,
  count,
  active,
  acceptsDrop = true,
  onClick,
  trailing,
  leading,
  className,
}: BoardSidebarItemProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `board-drop:${id}`,
    data: { boardId: id },
    disabled: !acceptsDrop,
  });

  const row = (
    <button
      type="button"
      ref={setNodeRef}
      onClick={onClick}
      className={cn(
        "group flex w-full items-center gap-2 rounded-(--radius-sm) px-3 py-2 " +
          "text-left text-(length:--text-body-sm) " +
          "transition-colors duration-(--duration-fast)",
        active
          ? "bg-(--surface-raised) text-(--text) font-semibold"
          : "text-(--text) hover:bg-(--surface) hover:text-(--text)",
        isOver
          ? "outline outline-2 outline-(--accent) outline-offset-1 bg-(--surface)"
          : "",
        className,
      )}
    >
      {leading ? <span className="shrink-0">{leading}</span> : null}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {typeof count === "number" ? (
        <span
          className={cn(
            "shrink-0 rounded-(--radius-pill) px-2 py-0.5 text-(length:--text-caption) " +
              "[font-variant-numeric:tabular-nums]",
            active
              ? "bg-(--bg) text-(--text)"
              : "bg-(--surface-raised) text-(--text-muted)",
          )}
        >
          {count}
        </span>
      ) : null}
      {trailing ? <span className="shrink-0">{trailing}</span> : null}
    </button>
  );

  // Wrap with a tooltip surfaced only when the label looks like it'd truncate.
  if (label.length > 22) {
    return <Tooltip content={label}>{row}</Tooltip>;
  }
  return row;
}
