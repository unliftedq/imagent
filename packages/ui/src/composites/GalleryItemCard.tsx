import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useDraggable } from "@dnd-kit/core";
import {
  ArrowSquareOut,
  CaretRight,
  DotsThree,
  FilmStrip,
  Folder,
  Heart,
  MagicWand,
  Play,
  Plus,
  StackPlus,
  Trash,
} from "@phosphor-icons/react";
import { type ReactNode, useState } from "react";
import { cn } from "../lib/cn.js";

export type GalleryItemCardKind = "image" | "video";
/**
 * `masonry` — full Gallery page card (preserves aspect ratio, hover caption +
 *   actions, right-click menu).
 * `rail` / `sm` — compact square thumbnail used by the Studio right rail.
 *   No caption underneath, no kebab; clicking the card invokes onSelect (the
 *   Studio canvas listens for it). Drag, context menu and boards menu are
 *   suppressed in this variant.
 */
export type GalleryItemCardSize = "masonry" | "rail" | "sm";

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
  /** Video variant: ms duration → rendered as a "00:05" badge in the corner. */
  durationMs?: number | null;
  favorited?: boolean;
  selected?: boolean;
  /** Boards available for the "Add to board" submenu. */
  boards?: ReadonlyArray<GalleryItemCardBoardOption>;
  onSelect?: () => void;
  onOpen?: () => void;
  onRemix?: () => void;
  onSaveAsAsset?: () => void;
  onToggleFavorite?: () => void;
  onAddToBoard?: (boardId: string) => void;
  onOpenFileLocation?: () => void;
  onDelete?: () => void;
  /** When true, makes the card a drag source for the Boards sidebar. */
  draggable?: boolean;
  /** Visual variant — see GalleryItemCardSize. Defaults to `masonry`. */
  size?: GalleryItemCardSize;
  className?: string;
}

/**
 * Image-only Gallery card per design.md §10. Aspect-ratio-preserving image,
 * lazy load, no shadow, 1px hairline border. Selected = border-strong + accent
 * ring (no shadow). Hover surfaces favorite + more-actions buttons. Right-click
 * opens a Radix DropdownMenu context menu.
 *
 * Video variant (M7) renders a thumbnail (or FilmStrip fallback) with a
 * play triangle + duration badge overlay. Both variants share the same
 * DnD source id + Radix DropdownMenu actions.
 */
export function GalleryItemCard(props: GalleryItemCardProps) {
  const size: GalleryItemCardSize = props.size ?? "masonry";
  if (size === "rail" || size === "sm") {
    return <RailVariant {...props} />;
  }
  if (props.kind === "video") {
    return <VideoVariant {...props} />;
  }
  return <ImageVariant {...props} />;
}

/**
 * Compact rail variant — square thumb, no kebab, no boards menu, no
 * right-click. Click loads the item into the parent's canvas; double-click
 * still routes through `onOpen`.
 */
function RailVariant({
  id,
  kind,
  src,
  caption,
  favorited,
  selected,
  onSelect,
  onOpen,
  className,
}: GalleryItemCardProps) {
  const hasSrc = typeof src === "string" && src.length > 0;
  return (
    <button
      type="button"
      onClick={onSelect}
      onDoubleClick={onOpen}
      title={caption ?? ""}
      aria-label={caption ?? `Gallery item ${id}`}
      className={cn(
        "group relative block aspect-square w-full overflow-hidden rounded-(--radius-sm) " +
          "border bg-(--surface-sunken) transition-colors duration-(--motion-fast) " +
          "ease-(--ease-out) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--focus-ring)",
        selected
          ? "border-(--border-strong) outline outline-2 outline-(--accent) outline-offset-0"
          : "border-(--border) hover:border-(--border-strong)",
        className,
      )}
    >
      {hasSrc ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          draggable={false}
          className="block h-full w-full object-cover"
        />
      ) : (
        <span aria-hidden="true" className="block h-full w-full" />
      )}
      {kind === "video" ? (
        <span
          aria-hidden="true"
          className={
            "pointer-events-none absolute bottom-1 left-1 inline-flex size-4 " +
            "items-center justify-center rounded-(--radius-pill) bg-black/55 text-white"
          }
        >
          <Play weight="fill" className="size-2.5" />
        </span>
      ) : null}
      {favorited ? (
        <span
          aria-hidden="true"
          className={
            "pointer-events-none absolute right-1 top-1 inline-flex size-4 " +
            "items-center justify-center rounded-(--radius-pill) bg-black/45 text-white"
          }
        >
          <Heart weight="fill" className="size-2.5" />
        </span>
      ) : null}
    </button>
  );
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

  // Aspect ratio. Default to a 1:1 placeholder while the image loads.
  const ratio =
    width && height && width > 0 && height > 0 ? `${width} / ${height}` : "1 / 1";

  return (
    <DropdownMenu.Root open={menuOpen} onOpenChange={setMenuOpen}>
      {/*
       * The card is NOT the dropdown trigger — clicking it must run
       * `onSelect` (open lightbox), not toggle the menu. The kebab button
       * below is the only Radix Trigger; right-click anywhere on the card
       * imperatively opens the menu, which Radix then anchors to that
       * kebab button.
       */}
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
          <DropdownMenu.Trigger asChild>
            <CornerButton
              ariaLabel="More actions"
              onClick={(e) => {
                e.stopPropagation();
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

function VideoVariant({
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

  const ratio =
    width && height && width > 0 && height > 0 ? `${width} / ${height}` : "16 / 9";

  const hasThumb = typeof src === "string" && src.length > 0;

  return (
    <DropdownMenu.Root open={menuOpen} onOpenChange={setMenuOpen}>
      {/* See ImageVariant: card click → onSelect, kebab is the trigger. */}
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
        <div
          style={{ aspectRatio: ratio }}
          className="relative bg-(--surface)"
        >
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
          {/* Bottom-left play triangle */}
          <div className="pointer-events-none absolute bottom-2 left-2 inline-flex size-7 items-center justify-center rounded-(--radius-pill) bg-black/55 text-white">
            <Play weight="fill" className="size-3.5" />
          </div>
          {/* Bottom-right duration badge */}
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
            <span className="line-clamp-2 text-(length:--text-caption) text-white">
              {caption}
            </span>
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
          <DropdownMenu.Trigger asChild>
            <CornerButton
              ariaLabel="More actions"
              onClick={(e) => {
                e.stopPropagation();
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

function formatVideoDuration(durationMs: number): string {
  const totalSec = Math.max(0, Math.round(durationMs / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

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
function ActionMenuContent({
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
                {boards.map((b) => (
                  <Item
                    key={b.id}
                    icon={<Folder weight="duotone" className="size-4" />}
                    onSelect={() => onAddToBoard?.(b.id)}
                  >
                    {b.name}
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

function CornerButton({
  children,
  onClick,
  ariaLabel,
  active,
  ref,
  ...rest
}: {
  children: ReactNode;
  onClick?: (e: React.MouseEvent) => void;
  ariaLabel: string;
  active?: boolean;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "aria-label" | "children" | "ref"> & {
  ref?: React.Ref<HTMLButtonElement>;
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
