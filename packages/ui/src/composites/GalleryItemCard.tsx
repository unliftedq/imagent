import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useDraggable } from "@dnd-kit/core";
import { Heart, DotsThree } from "@phosphor-icons/react";
import { type ReactNode, useState } from "react";
import { cn } from "../lib/cn.js";

export type GalleryItemCardKind = "image" | "video";

export interface GalleryItemCardBoardOption {
  id: string;
  name: string;
}

export interface GalleryItemCardProps {
  /** Stable id used for selection, drag, and context-menu actions. */
  id: string;
  kind: GalleryItemCardKind;
  /** file:// URL or relative path the renderer can load. */
  src: string;
  /** Caption shown on hover; usually the prompt or its excerpt. */
  caption?: string;
  /** width / height for aspect-ratio-preserving layout. */
  width?: number | null;
  height?: number | null;
  favorited?: boolean;
  selected?: boolean;
  /** Boards available for the "Add to board" submenu. */
  boards?: ReadonlyArray<GalleryItemCardBoardOption>;
  onSelect?: () => void;
  onOpen?: () => void;
  onRemix?: () => void;
  onToggleFavorite?: () => void;
  onAddToBoard?: (boardId: string) => void;
  onOpenFileLocation?: () => void;
  onDelete?: () => void;
  /** When true, makes the card a drag source for the Boards sidebar. */
  draggable?: boolean;
  className?: string;
}

/**
 * Image-only Gallery card per design.md §10. Aspect-ratio-preserving image,
 * lazy load, no shadow, 1px hairline border. Selected = border-strong + accent
 * ring (no shadow). Hover surfaces favorite + more-actions buttons. Right-click
 * opens a Radix DropdownMenu context menu.
 *
 * The video branch is gated until M7 — passing `kind: "video"` throws.
 */
export function GalleryItemCard(props: GalleryItemCardProps) {
  if (props.kind === "video") {
    // TODO(M7): render a poster frame + duration overlay + playable drawer.
    throw new Error(
      "GalleryItemCard: video variant lands in M7 (filter to image at the page layer).",
    );
  }
  return <ImageVariant {...props} />;
}

function ImageVariant({
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
  onRemix,
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

  // Aspect ratio. Default to a 1:1 placeholder while the image loads.
  const ratio =
    width && height && width > 0 && height > 0 ? `${width} / ${height}` : "1 / 1";

  return (
    <DropdownMenu.Root open={menuOpen} onOpenChange={setMenuOpen}>
      <DropdownMenu.Trigger asChild>
        {/* The trigger acts as the right-click anchor; we forward the event. */}
        <div
          ref={setNodeRef}
          {...listeners}
          {...attributes}
          onClick={onSelect}
          onDoubleClick={onOpen}
          onContextMenu={(e) => {
            e.preventDefault();
            setMenuOpen(true);
          }}
          className={cn(
            "group relative break-inside-avoid mb-3 w-full cursor-pointer overflow-hidden " +
              "rounded-(--radius-md) border border-(--color-hairline) bg-(--color-canvas) " +
              "transition-colors duration-(--duration-fast)",
            selected
              ? "border-(--color-ink) outline outline-2 outline-(--color-accent) outline-offset-1"
              : "hover:border-(--color-ink)",
            isDragging ? "opacity-50" : "",
            className,
          )}
          aria-label={`Gallery item ${id}`}
        >
          <div style={{ aspectRatio: ratio }} className="bg-(--color-surface-soft)">
            <img
              src={src}
              alt={caption ?? "Gallery item"}
              loading="lazy"
              draggable={false}
              className="block h-full w-full object-cover"
            />
          </div>
          {/* Caption — hidden by default; visible on hover for context. */}
          {caption ? (
            <div
              className={
                "absolute inset-x-0 bottom-0 flex items-end p-2 " +
                "bg-gradient-to-t from-black/55 via-black/15 to-transparent " +
                "opacity-0 transition-opacity duration-(--duration-fast) " +
                "group-hover:opacity-100"
              }
            >
              <span className="line-clamp-2 text-(length:--text-caption) text-white">
                {caption}
              </span>
            </div>
          ) : null}
          {/* Top-right hover actions. */}
          <div
            className={
              "absolute right-2 top-2 flex items-center gap-1 " +
              "opacity-0 transition-opacity duration-(--duration-fast) " +
              "group-hover:opacity-100 focus-within:opacity-100"
            }
          >
            <CornerButton
              ariaLabel={favorited ? "Unfavorite" : "Favorite"}
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavorite?.();
              }}
              active={favorited}
            >
              <Heart
                weight={favorited ? "fill" : "regular"}
                className="size-4"
              />
            </CornerButton>
            <CornerButton
              ariaLabel="More actions"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(true);
              }}
            >
              <DotsThree weight="bold" className="size-4" />
            </CornerButton>
          </div>
        </div>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={4}
          className={cn(
            "z-50 min-w-[200px] overflow-hidden rounded-(--radius-md) " +
              "border border-(--color-hairline) bg-(--color-canvas) p-1 " +
              "shadow-[0_4px_24px_-8px_rgba(0,0,0,0.08)]",
          )}
        >
          <Item onSelect={onOpen}>Open in drawer</Item>
          <Item onSelect={onRemix}>Remix</Item>
          <Item onSelect={onToggleFavorite}>
            {favorited ? "Unfavorite" : "Favorite"}
          </Item>
          {boards && boards.length > 0 ? (
            <DropdownMenu.Sub>
              <DropdownMenu.SubTrigger
                className={
                  "relative flex cursor-pointer select-none items-center justify-between " +
                  "rounded-(--radius-sm) px-3 py-2 text-(length:--text-body-sm) " +
                  "data-[highlighted]:bg-(--color-surface-soft) outline-none"
                }
              >
                Add to board
                <span className="ml-2 text-(--color-muted)">›</span>
              </DropdownMenu.SubTrigger>
              <DropdownMenu.Portal>
                <DropdownMenu.SubContent
                  className={cn(
                    "z-50 min-w-[180px] overflow-hidden rounded-(--radius-md) " +
                      "border border-(--color-hairline) bg-(--color-canvas) p-1 " +
                      "shadow-[0_4px_24px_-8px_rgba(0,0,0,0.08)]",
                  )}
                >
                  {boards.map((b) => (
                    <Item
                      key={b.id}
                      onSelect={() => onAddToBoard?.(b.id)}
                    >
                      {b.name}
                    </Item>
                  ))}
                </DropdownMenu.SubContent>
              </DropdownMenu.Portal>
            </DropdownMenu.Sub>
          ) : null}
          <DropdownMenu.Separator className="my-1 h-px bg-(--color-hairline-soft)" />
          <Item onSelect={onOpenFileLocation}>Open file location</Item>
          <Item onSelect={onDelete} variant="danger">
            Delete
          </Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function Item({
  children,
  onSelect,
  variant,
}: {
  children: ReactNode;
  onSelect?: () => void;
  variant?: "danger";
}) {
  return (
    <DropdownMenu.Item
      disabled={!onSelect}
      onSelect={() => onSelect?.()}
      className={cn(
        "relative flex cursor-pointer select-none items-center " +
          "rounded-(--radius-sm) px-3 py-2 text-(length:--text-body-sm) outline-none " +
          "data-[highlighted]:bg-(--color-surface-soft) " +
          "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        variant === "danger" ? "text-(--color-error)" : "text-(--color-ink)",
      )}
    >
      {children}
    </DropdownMenu.Item>
  );
}

function CornerButton({
  children,
  onClick,
  ariaLabel,
  active,
}: {
  children: ReactNode;
  onClick: (e: React.MouseEvent) => void;
  ariaLabel: string;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={cn(
        "inline-flex size-7 items-center justify-center rounded-(--radius-sm) " +
          "border border-(--color-hairline) bg-(--color-canvas) text-(--color-ink) " +
          "transition-colors duration-(--duration-fast) hover:bg-(--color-surface-soft)",
        active ? "text-(--color-error)" : "",
      )}
    >
      {children}
    </button>
  );
}
