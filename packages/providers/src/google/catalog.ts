import type { ImageCatalog, ImageModelDef } from "@imagine/core";

export const GOOGLE_IMAGE_MODELS: Record<string, ImageModelDef> = {
  "imagen-3": {
    id: "imagen-3",
    displayName: "Imagen 3",
    capabilities: {
      aspectRatios: ["1:1", "9:16", "16:9", "3:4", "4:3"],
      maxReferences: 0,
      maxOutputs: 4,
      supportsNegativePrompt: true,
      supportsSeed: true,
      supportsStyleRef: false,
    },
    defaults: { aspectRatio: "1:1", count: 1 },
  },
};

export const GOOGLE_CATALOG: ImageCatalog = {
  google: GOOGLE_IMAGE_MODELS,
};
