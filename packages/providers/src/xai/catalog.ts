import type { ImageCatalog, ImageModelDef } from "@imagine-studio/core";

/**
 * Built-in xAI image models. xAI's image API is OpenAI-compatible against
 * `https://api.x.ai/v1/images/generations`. Capabilities here reflect the
 * documented `grok-2-image-1212` surface (no img2img, no seed/negative
 * prompt at v1).
 */
export const XAI_IMAGE_MODELS: Record<string, ImageModelDef> = {
  "grok-2-image-1212": {
    id: "grok-2-image-1212",
    displayName: "Grok 2 Image (Dec 12)",
    capabilities: {
      sizes: ["1024x1024", "1024x768", "768x1024"],
      maxReferences: 0,
      maxOutputs: 4,
      supportsSeed: false,
      supportsNegativePrompt: false,
      supportsStyleRef: false,
    },
    defaults: { size: "1024x1024", count: 1 },
  },
};

export const XAI_CATALOG: ImageCatalog = {
  xai: XAI_IMAGE_MODELS,
};
