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
