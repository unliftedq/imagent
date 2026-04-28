import type { ImageCatalog, ImageModelDef } from "@imagine-studio/core";

export const FLUX_IMAGE_MODELS: Record<string, ImageModelDef> = {
  "flux-pro-1.1": {
    id: "flux-pro-1.1",
    displayName: "FLUX 1.1 [pro]",
    capabilities: {
      aspectRatios: ["1:1", "16:9", "9:16", "21:9", "4:3", "3:4"],
      maxReferences: 0,
      maxOutputs: 1,
      supportsNegativePrompt: false,
      supportsSeed: true,
      supportsStyleRef: false,
    },
    defaults: { aspectRatio: "1:1", count: 1 },
  },
  "flux-pro-1.1-ultra": {
    id: "flux-pro-1.1-ultra",
    displayName: "FLUX 1.1 [pro] Ultra",
    capabilities: {
      aspectRatios: ["1:1", "16:9", "9:16", "21:9"],
      maxReferences: 0,
      maxOutputs: 1,
      supportsNegativePrompt: false,
      supportsSeed: true,
      supportsStyleRef: false,
    },
    defaults: { aspectRatio: "16:9", count: 1 },
  },
};

export const FLUX_CATALOG: ImageCatalog = {
  "flux-bfl": FLUX_IMAGE_MODELS,
};
