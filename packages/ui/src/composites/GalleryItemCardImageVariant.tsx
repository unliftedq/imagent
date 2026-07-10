import { useDraggable } from "@dnd-kit/core";
import { DotsThree, Heart } from "@phosphor-icons/react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useState } from "react";

import { cn } from "../lib/cn.js";
import { ActionMenuContent, CornerButton } from "./GalleryItemCard.shared.js";
import type { GalleryItemCardProps } from "./GalleryItemCard.types.js";

export function ImageVariant({
  id,
  src,
  caption,
  width,
  height,
  favorited,
  selected,
  boards,
  onSelect,
  onOpen,
  onEdit,
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
    data: { itemId: id, kind: "image" as const },
    disabled: !draggable,
  });

  const ratio = width && height && width > 0 && height > 0 ? `${width} / ${height}` : "1 / 1";

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
        aria-label={`Gallery item ${id}`}
      >
        <div style={{ aspectRatio: ratio }} className="bg-(--surface)">
          <img
            src={src}
            alt={caption ?? "Gallery item"}
            loading="lazy"
            draggable={false}
            className="block h-full w-full object-cover"
          />
        </div>
        {caption ? (
          <div
            className={
              "absolute inset-x-0 bottom-0 flex items-end p-2 " +
              "bg-gradient-to-t from-black/55 via-black/15 to-transparent " +
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
        onEdit={onEdit}
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
