import { useDraggable } from "@dnd-kit/core";
import { DotsThree, Heart, Pause, Play, Waveform } from "@phosphor-icons/react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useRef, useState } from "react";

import { cn } from "../lib/cn.js";
import { ActionMenuContent, CornerButton, formatVideoDuration } from "./GalleryItemCard.shared.js";
import type { GalleryItemCardProps } from "./GalleryItemCard.types.js";

export function AudioVariant({
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
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [playing, setPlaying] = useState(false);

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `gallery-item:${id}`,
    data: { itemId: id, kind: "audio" as const },
    disabled: !draggable,
  });

  const ratio = width && height && width > 0 && height > 0 ? `${width} / ${height}` : "1 / 1";
  const hasSrc = typeof src === "string" && src.length > 0;

  const togglePlayback = (): void => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      el.pause();
    } else {
      void el.play();
    }
  };

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
        aria-label={`Audio gallery item ${id}`}
      >
        <div
          style={{ aspectRatio: ratio }}
          className="relative flex min-h-[156px] flex-col justify-between bg-(--surface) p-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="inline-flex size-11 shrink-0 items-center justify-center rounded-(--radius-md) bg-(--accent-soft) text-(--accent)">
              <Waveform weight="duotone" className="size-6" />
            </div>
            {typeof durationMs === "number" && durationMs > 0 ? (
              <div className="rounded-(--radius-pill) bg-black/55 px-2 py-0.5 text-(length:--text-caption) text-white [font-variant-numeric:tabular-nums]">
                {formatVideoDuration(durationMs)}
              </div>
            ) : null}
          </div>
          <div className="min-w-0">
            <p className="line-clamp-3 text-(length:--text-body-sm) font-medium leading-5 text-(--text)">
              {caption ?? "Audio"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={!hasSrc}
              aria-label={playing ? "Pause audio" : "Play audio"}
              onClick={(event) => {
                event.stopPropagation();
                togglePlayback();
              }}
              className={
                "inline-flex size-9 items-center justify-center rounded-(--radius-pill) " +
                "bg-(--text) text-(--bg) transition-colors duration-(--duration-fast) " +
                "hover:bg-(--text-muted) disabled:cursor-not-allowed disabled:opacity-50 " +
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--focus-ring)"
              }
            >
              {playing ? (
                <Pause weight="fill" className="size-4" />
              ) : (
                <Play weight="fill" className="size-4" />
              )}
            </button>
            <div className="h-1 flex-1 rounded-(--radius-pill) bg-(--border)" aria-hidden="true" />
          </div>
          <audio
            ref={audioRef}
            src={src}
            preload="metadata"
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
            className="hidden"
          />
        </div>
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
