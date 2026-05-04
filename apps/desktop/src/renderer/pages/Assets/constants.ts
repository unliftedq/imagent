import type { AssetKind } from "@imagine/core";

export const KINDS: AssetKind[] = ["character", "object", "background", "style"];
export const KIND_LABEL: Record<AssetKind, string> = {
  character: "Characters",
  object: "Objects",
  background: "Backgrounds",
  style: "Styles",
};
export const TRASH_TAB = "__trash__" as const;
export type AssetsTab = AssetKind | typeof TRASH_TAB;
export const ACTIVE_TAB_LS_KEY = "imagine.activeAssetTab.v1";
export const MAX_UPLOADS = 1;
