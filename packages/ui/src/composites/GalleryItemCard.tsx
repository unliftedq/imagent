import { ImageVariant } from "./GalleryItemCardImageVariant.js";
import { RailVariant } from "./GalleryItemCardRailVariant.js";
import type { GalleryItemCardProps, GalleryItemCardSize } from "./GalleryItemCard.types.js";
import { VideoVariant } from "./GalleryItemCardVideoVariant.js";

export type {
  GalleryItemCardBoardOption,
  GalleryItemCardKind,
  GalleryItemCardProps,
  GalleryItemCardSize,
} from "./GalleryItemCard.types.js";

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
