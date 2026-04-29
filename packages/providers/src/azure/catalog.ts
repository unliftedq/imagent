import type { ImageCatalog, ImageModelDef } from "@imagine/core";

/**
 * Azure OpenAI deployments are user-named (`my-image-prod`), so the catalog
 * carries one example deployment slot. Real deployments are populated from
 * config.json's `azure-openai.deployments` map; this entry exists so
 * resolveModel can find a baseline shape if the user names their deployment
 * the canonical "image-default".
 */
export const AZURE_OPENAI_IMAGE_MODELS: Record<string, ImageModelDef> = {
  "image-default": {
    id: "image-default",
    displayName: "Azure OpenAI image deployment",
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
};

export const AZURE_OPENAI_CATALOG: ImageCatalog = {
  "azure-openai": AZURE_OPENAI_IMAGE_MODELS,
};
