import type { ImageModelDef, VideoModelDef } from "@imagent/core";
import type { ProviderId } from "@imagent/ipc";
import type { StudioMode } from "../../state/useUIStore.js";

export const ASSET_REFERENCE_KINDS = ["character", "object", "background", "style"] as const;
export const MODEL_FAVORITES_LS_KEY = "imagent.favoriteModels.v1";
export const IMAGE_FILE_FILTERS = [
  { name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif"] },
];

export type ModelFavoriteKey = `${StudioMode}:${string}:${string}`;

export interface UnifiedModelOption {
  providerId: ProviderId;
  providerName: string;
  modelId: string;
  displayName: string;
  capabilities?: ImageModelDef["capabilities"] | VideoModelDef["capabilities"];
}
