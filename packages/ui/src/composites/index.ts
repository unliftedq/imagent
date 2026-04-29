/**
 * Barrel re-export for higher-order composites. Top-level `index.ts` keeps
 * the canonical public surface (named exports + types); this file exists as
 * a discoverability anchor for new composites.
 */
export { ProviderRow } from "./ProviderRow.js";
export type { ProviderRowProps, ProviderTestStatus } from "./ProviderRow.js";
export { ModelSelect } from "./ModelSelect.js";
export type {
  ModelSelectProps,
  ResolvedModelOption,
} from "./ModelSelect.js";
export { PromptComposer } from "./PromptComposer.js";
export type {
  PromptComposerProps,
  PromptComposerAssetSlot,
  PromptComposerAssetsBundle,
  PromptComposerSelectedAssetIds,
} from "./PromptComposer.js";
export { AssetCard } from "./AssetCard.js";
export type { AssetCardProps } from "./AssetCard.js";
export { AssetPicker } from "./AssetPicker.js";
export type { AssetPickerProps } from "./AssetPicker.js";
export { GalleryItemCard } from "./GalleryItemCard.js";
export type {
  GalleryItemCardProps,
  GalleryItemCardKind,
  GalleryItemCardBoardOption,
  GalleryItemCardSize,
} from "./GalleryItemCard.js";
export { BoardSidebarItem } from "./BoardSidebarItem.js";
export type { BoardSidebarItemProps } from "./BoardSidebarItem.js";
export { JobProgress } from "./JobProgress.js";
export type {
  JobProgressProps,
  JobProgressKind,
  JobProgressState,
} from "./JobProgress.js";
export { NavRail, NAV_RAIL_ROWS } from "./NavRail.js";
export type { NavRailProps, NavRoute } from "./NavRail.js";
export { GalleryRail } from "./GalleryRail.js";
export type {
  GalleryRailProps,
  GalleryRailFilter,
  GalleryRailItem,
} from "./GalleryRail.js";
