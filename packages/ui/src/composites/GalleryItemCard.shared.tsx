import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  ArrowSquareOut,
  CaretRight,
  Folder,
  Heart,
  MagicWand,
  Plus,
  StackPlus,
  Trash,
} from "@phosphor-icons/react";
import type { ButtonHTMLAttributes, MouseEvent, ReactNode, Ref } from "react";

import { cn } from "../lib/cn.js";
import type { GalleryItemCardBoardOption } from "./GalleryItemCard.types.js";

function Item({
  children,
  icon,
  onSelect,
  variant,
}: {
  children: ReactNode;
  icon?: ReactNode;
  onSelect?: () => void;
  variant?: "danger";
}) {
  return (
    <DropdownMenu.Item
      disabled={!onSelect}
      onSelect={() => onSelect?.()}
      className={cn(
        "group relative flex cursor-pointer select-none items-center gap-2.5 " +
          "rounded-(--radius-sm) px-2.5 py-1.5 text-(length:--text-body-sm) outline-none " +
          "transition-colors duration-(--duration-fast) " +
          "data-[highlighted]:bg-(--surface) " +
          "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        variant === "danger"
          ? "text-(--danger) data-[highlighted]:bg-(--danger-soft)"
          : "text-(--text)",
      )}
    >
      {icon ? (
        <span
          className={cn(
            "inline-flex size-4 shrink-0 items-center justify-center",
            variant === "danger" ? "text-(--danger)" : "text-(--text-muted)",
          )}
        >
          {icon}
        </span>
      ) : (
        <span className="inline-flex size-4 shrink-0" aria-hidden="true" />
      )}
      <span className="flex-1 truncate">{children}</span>
    </DropdownMenu.Item>
  );
}

/**
 * Action sheet shared between image / video cards. Tighter padding, leading
 * icons in a muted color, soft separators, themed danger row, and a polished
 * "Add to board" submenu with a creation hint when no boards exist.
 */
export function ActionMenuContent({
  favorited,
  boards,
  onRemix,
  onSaveAsAsset,
  onToggleFavorite,
  onAddToBoard,
  onOpenFileLocation,
  onDelete,
}: {
  favorited?: boolean;
  boards?: ReadonlyArray<GalleryItemCardBoardOption>;
  onRemix?: () => void;
  onSaveAsAsset?: () => void;
  onToggleFavorite?: () => void;
  onAddToBoard?: (boardId: string) => void;
  onOpenFileLocation?: () => void;
  onDelete?: () => void;
}) {
  const hasBoards = !!boards && boards.length > 0;
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        align="end"
        sideOffset={6}
        className={cn(
          "z-50 min-w-[208px] overflow-hidden rounded-(--radius-md) " +
            "border border-(--border) bg-(--bg) p-1 " +
            "shadow-[0_12px_32px_-12px_rgba(0,0,0,0.18),0_2px_6px_-2px_rgba(0,0,0,0.08)] " +
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 " +
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
        )}
      >
        <Item icon={<MagicWand weight="bold" className="size-4" />} onSelect={onRemix}>
          Remix
        </Item>
        <Item icon={<StackPlus weight="bold" className="size-4" />} onSelect={onSaveAsAsset}>
          Save as asset
        </Item>
        <Item
          icon={
            <Heart
              weight={favorited ? "fill" : "regular"}
              className={cn("size-4", favorited ? "text-(--danger)" : "")}
            />
          }
          onSelect={onToggleFavorite}
        >
          {favorited ? "Unfavorite" : "Favorite"}
        </Item>
        {hasBoards ? (
          <DropdownMenu.Sub>
            <DropdownMenu.SubTrigger
              className={cn(
                "group relative flex cursor-pointer select-none items-center gap-2.5 " +
                  "rounded-(--radius-sm) px-2.5 py-1.5 text-(length:--text-body-sm) outline-none " +
                  "text-(--text) transition-colors duration-(--duration-fast) " +
                  "data-[highlighted]:bg-(--surface) data-[state=open]:bg-(--surface)",
              )}
            >
              <span className="inline-flex size-4 shrink-0 items-center justify-center text-(--text-muted)">
                <Plus weight="bold" className="size-4" />
              </span>
              <span className="flex-1 truncate">Add to board</span>
              <CaretRight weight="bold" className="size-3 text-(--text-muted)" />
            </DropdownMenu.SubTrigger>
            <DropdownMenu.Portal>
              <DropdownMenu.SubContent
                sideOffset={8}
                className={cn(
                  "z-50 min-w-[200px] max-h-[320px] overflow-y-auto rounded-(--radius-md) " +
                    "border border-(--border) bg-(--bg) p-1 " +
                    "shadow-[0_12px_32px_-12px_rgba(0,0,0,0.18),0_2px_6px_-2px_rgba(0,0,0,0.08)] " +
                    "data-[state=open]:animate-in data-[state=open]:fade-in-0 " +
                    "data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
                )}
              >
                {boards.map((board) => (
                  <Item
                    key={board.id}
                    icon={<Folder weight="duotone" className="size-4" />}
                    onSelect={() => onAddToBoard?.(board.id)}
                  >
                    {board.name}
                  </Item>
                ))}
              </DropdownMenu.SubContent>
            </DropdownMenu.Portal>
          </DropdownMenu.Sub>
        ) : null}
        <DropdownMenu.Separator className="my-1 h-px bg-(--border-faint)" />
        <Item
          icon={<ArrowSquareOut weight="bold" className="size-4" />}
          onSelect={onOpenFileLocation}
        >
          Reveal in Finder
        </Item>
        <DropdownMenu.Separator className="my-1 h-px bg-(--border-faint)" />
        <Item
          icon={<Trash weight="bold" className="size-4" />}
          onSelect={onDelete}
          variant="danger"
        >
          Delete
        </Item>
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  );
}

export function CornerButton({
  children,
  onClick,
  ariaLabel,
  active,
  ref,
  ...rest
}: {
  children: ReactNode;
  onClick?: (e: MouseEvent) => void;
  ariaLabel: string;
  active?: boolean;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "aria-label" | "children" | "ref"> & {
    ref?: Ref<HTMLButtonElement>;
  }) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={cn(
        "inline-flex size-7 items-center justify-center rounded-(--radius-sm) " +
          "border border-(--border) bg-(--bg) text-(--text) " +
          "transition-colors duration-(--duration-fast) hover:bg-(--surface) " +
          "data-[state=open]:bg-(--surface) focus-visible:outline-none " +
          "focus-visible:ring-2 focus-visible:ring-(--focus-ring)",
        active ? "text-(--danger)" : "",
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function formatVideoDuration(durationMs: number): string {
  const totalSec = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
