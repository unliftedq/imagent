import { useDraggable } from "@dnd-kit/core";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { DotsThree, FilmStrip, Heart, Play } from "@phosphor-icons/react";
import { useState } from "react";

import { cn } from "../lib/cn.js";
import { ActionMenuContent, CornerButton, formatVideoDuration } from "./GalleryItemCard.shared.js";
import type { GalleryItemCardProps } from "./GalleryItemCard.types.js";

export function VideoVariant({
  id,
  src,
  caption,
  width,
  height,
  durationMs,
  favorited,
  selected,
  boards,
  onSelect,
  onOpen,
  onRemix,
  onSaveAsAsset,
  onToggleFavorite,
  onAddToBoard,
  onOpenFileLocation,
  onDelete,
  draggable = true,
  className,
}: GalleryItemCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `gallery-item:${id}`,
    data: { itemId: id, kind: "video" as const },
    disabled: !draggable,
  });

  const ratio = width && height && width > 0 && height > 0 ? `${width} / ${height}` : "16 / 9";
  const hasThumb = typeof src === "string" && src.length > 0;

  return (
    <DropdownMenu.Root open={menuOpen} onOpenChange={setMenuOpen}>
      <div
        ref={setNodeRef}
        {...listeners}
        {...attributes}
        onClick={onSelect}
        onDoubleClick={onOpen}
        onContextMenu={(event) => {
          event.preventDefault();
          setMenuOpen(true);
        }}
        className={cn(
          "group relative break-inside-avoid mb-3 w-full cursor-pointer overflow-hidden " +
            "rounded-(--radius-md) border border-(--border) bg-(--bg) " +
            "transition-colors duration-(--duration-fast)",
          selected
            ? "border-(--text) outline outline-2 outline-(--accent) outline-offset-1"
            : "hover:border-(--text)",
          isDragging ? "opacity-50" : "",
          className,
        )}
        aria-label={`Video gallery item ${id}`}
      >
        <div style={{ aspectRatio: ratio }} className="relative bg-(--surface)">
          {hasThumb ? (
            <img
              src={src}
              alt={caption ?? "Video thumbnail"}
              loading="lazy"
              draggable={false}
              className="block h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-(--text-muted)">
              <FilmStrip weight="duotone" className="size-10" />
            </div>
          )}
          <div className="pointer-events-none absolute bottom-2 left-2 inline-flex size-7 items-center justify-center rounded-(--radius-pill) bg-black/55 text-white">
            <Play weight="fill" className="size-3.5" />
          </div>
          {typeof durationMs === "number" && durationMs > 0 ? (
            <div className="pointer-events-none absolute bottom-2 right-2 rounded-(--radius-pill) bg-black/55 px-2 py-0.5 text-(length:--text-caption) text-white [font-variant-numeric:tabular-nums]">
              {formatVideoDuration(durationMs)}
            </div>
          ) : null}
        </div>
        {caption ? (
          <div
            className={
              "absolute inset-x-0 top-0 flex items-start p-2 " +
              "bg-gradient-to-b from-black/55 via-black/15 to-transparent " +
              "opacity-0 transition-opacity duration-(--duration-fast) " +
              "group-hover:opacity-100"
            }
          >
            <span className="line-clamp-2 text-(length:--text-caption) text-white">{caption}</span>
          </div>
        ) : null}
        <div
          className={
            "absolute right-2 top-2 flex items-center gap-1 " +
            "opacity-0 transition-opacity duration-(--duration-fast) " +
            "group-hover:opacity-100 focus-within:opacity-100"
          }
        >
          <CornerButton
            ariaLabel={favorited ? "Unfavorite" : "Favorite"}
            onClick={(event) => {
              event.stopPropagation();
              onToggleFavorite?.();
            }}
            active={favorited}
          >
            <Heart weight={favorited ? "fill" : "regular"} className="size-4" />
          </CornerButton>
          <DropdownMenu.Trigger asChild>
            <CornerButton
              ariaLabel="More actions"
              onClick={(event) => {
                event.stopPropagation();
              }}
            >
              <DotsThree weight="bold" className="size-4" />
            </CornerButton>
          </DropdownMenu.Trigger>
        </div>
      </div>
      <ActionMenuContent
        favorited={favorited}
        boards={boards}
        onRemix={onRemix}
        onSaveAsAsset={onSaveAsAsset}
        onToggleFavorite={onToggleFavorite}
        onAddToBoard={onAddToBoard}
        onOpenFileLocation={onOpenFileLocation}
        onDelete={onDelete}
      />
    </DropdownMenu.Root>
  );
}
