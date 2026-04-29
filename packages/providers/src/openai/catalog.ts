import type { ImageCatalog, ImageModelDef } from "@imagine/core";

/** Built-in OpenAI image models. Source of truth for capabilities. */
export const OPENAI_IMAGE_MODELS: Record<string, ImageModelDef> = {
  "gpt-image-1": {
    id: "gpt-image-1",
    displayName: "GPT Image 1",
    capabilities: {
      sizes: ["1024x1024", "1024x1536", "1536x1024"],
      maxReferences: 16,
      maxOutputs: 4,
      supportsNegativePrompt: false,
      supportsSeed: false,
      supportsStyleRef: true,
    },
    defaults: { size: "1024x1024", count: 1 },
  },
  "dall-e-3": {
    id: "dall-e-3",
    displayName: "DALL-E 3",
    capabilities: {
      sizes: ["1024x1024", "1024x1792", "1792x1024"],
      maxReferences: 0,
      maxOutputs: 1,
      supportsNegativePrompt: false,
      supportsSeed: false,
      supportsStyleRef: false,
    },
    defaults: { size: "1024x1024", count: 1 },
  },
};

export const OPENAI_CATALOG: ImageCatalog = {
  openai: OPENAI_IMAGE_MODELS,
};
