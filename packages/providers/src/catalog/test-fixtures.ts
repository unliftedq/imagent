import type { ImageModelDef, VideoModelDef } from "@imagent/core";
import type { ModelCatalog } from "./schema.js";

/**
 * Lightweight in-memory model fixtures used across provider tests. These do
 * NOT need to match the bundled `catalog.default.json` exactly — they exist
 * so per-vendor tests construct providers with a deterministic shape rather
 * than reaching into the JSON file. New entries added here are not affected
 * by user catalog edits in `~/.imagent/catalog.json`.
 */

export const OPENAI_IMAGE_MODELS: Record<string, ImageModelDef> = {
  "gpt-image-2": {
    id: "gpt-image-2",
    displayName: "GPT Image 2",
    capabilities: {
      sizes: ["1024x1024", "1024x1536", "1536x1024", "2048x2048", "2160x3840", "3840x2160"],
      qualities: ["low", "medium", "high", "auto"],
      maxReferences: 16,
      maxOutputs: 10,
      supportsStyleRef: true,
    },
    defaults: { size: "1024x1024", quality: "auto", count: 1 },
  },
  "gpt-image-1": {
    id: "gpt-image-1",
    displayName: "GPT Image 1",
    capabilities: {
      sizes: ["1024x1024", "1024x1536", "1536x1024"],
      qualities: ["low", "medium", "high", "auto"],
      maxReferences: 16,
      maxOutputs: 4,
      supportsStyleRef: true,
    },
    defaults: { size: "1024x1024", quality: "auto", count: 1 },
  },
};

export const AZURE_IMAGE_MODELS: Record<string, ImageModelDef> = {
  "azure-prod-gpt-image-2": {
    id: "azure-prod-gpt-image-2",
    baseModelId: "gpt-image-2",
    displayName: "azure-prod-gpt-image-2 (GPT Image 2)",
    capabilities: {
      sizes: ["1024x1024", "1024x1536", "1536x1024", "2048x2048", "2160x3840", "3840x2160"],
      qualities: ["low", "medium", "high", "auto"],
      maxReferences: 16,
      maxOutputs: 10,
      supportsStyleRef: true,
    },
    defaults: { size: "1024x1024", quality: "auto", count: 1 },
  },
  "azure-prod-mai-image-2": {
    id: "azure-prod-mai-image-2",
    baseModelId: "MAI-Image-2",
    displayName: "azure-prod-mai-image-2 (MAI Image 2)",
    capabilities: {
      sizes: ["1024x1024", "1024x768", "768x1024"],
      supportsArbitrarySize: true,
      outputFormats: ["png"],
      maxReferences: 0,
      maxOutputs: 1,
      supportsStyleRef: false,
    },
    defaults: { size: "1024x1024", outputFormat: "png", count: 1 },
  },
  "azure-prod-flux-2-pro": {
    id: "azure-prod-flux-2-pro",
    baseModelId: "flux-2-pro",
    displayName: "azure-prod-flux-2-pro (FLUX.2 [pro])",
    capabilities: {
      sizes: ["1024x1024", "1024x768", "768x1024", "1280x720", "720x1280", "1440x720", "720x1440"],
      supportsArbitrarySize: true,
      maxReferences: 8,
      maxOutputs: 1,
      supportsStyleRef: true,
    },
    defaults: { size: "1024x1024", count: 1 },
  },
};

export const GOOGLE_IMAGE_MODELS: Record<string, ImageModelDef> = {
  "gemini-2.5-flash-image": {
    id: "gemini-2.5-flash-image",
    displayName: "Nano Banana (Gemini 2.5 Flash Image)",
    capabilities: {
      aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"],
      maxReferences: 3,
      maxOutputs: 1,
      supportsStyleRef: true,
    },
    defaults: { aspectRatio: "1:1", count: 1 },
  },
  "gemini-3.1-flash-image-preview": {
    id: "gemini-3.1-flash-image-preview",
    displayName: "Nano Banana 2 (preview)",
    capabilities: {
      aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"],
      qualities: ["512", "1K", "2K", "4K"],
      maxReferences: 14,
      maxOutputs: 1,
      supportsStyleRef: true,
    },
    defaults: { aspectRatio: "1:1", quality: "1K", count: 1 },
  },
};

export const FLUX_IMAGE_MODELS: Record<string, ImageModelDef> = {
  "flux-2-pro": {
    id: "flux-2-pro",
    displayName: "FLUX.2 [pro]",
    capabilities: {
      sizes: ["1024x1024", "1024x768", "768x1024", "1280x720", "720x1280", "1440x720", "720x1440"],
      supportsArbitrarySize: true,
      maxReferences: 8,
      maxOutputs: 1,
      supportsStyleRef: true,
    },
    defaults: { size: "1024x1024", count: 1 },
  },
};

export const BYTEDANCE_IMAGE_MODELS: Record<string, ImageModelDef> = {
  "seedream-5-0-260128": {
    id: "seedream-5-0-260128",
    displayName: "Seedream 5.0",
    capabilities: {
      qualities: ["2k", "3k", "4k"],
      aspectRatios: [
        "auto",
        "1:1",
        "2:3",
        "3:2",
        "3:4",
        "4:3",
        "4:5",
        "5:4",
        "16:9",
        "9:16",
        "21:9",
      ],
      supportsArbitrarySize: true,
      minWidth: 256,
      maxWidth: 8192,
      minHeight: 256,
      maxHeight: 8192,
      maxPixels: 16_777_216,
      maxReferences: 10,
      maxOutputs: 15,
      supportsStyleRef: true,
    },
    defaults: { quality: "2k", aspectRatio: "auto", count: 1 },
  },
  "seedream-4-5-251128": {
    id: "seedream-4-5-251128",
    displayName: "Seedream 4.5",
    capabilities: {
      qualities: ["2k", "4k"],
      aspectRatios: [
        "auto",
        "1:1",
        "2:3",
        "3:2",
        "3:4",
        "4:3",
        "4:5",
        "5:4",
        "16:9",
        "9:16",
        "21:9",
      ],
      supportsArbitrarySize: true,
      minWidth: 256,
      maxWidth: 8192,
      minHeight: 256,
      maxHeight: 8192,
      maxPixels: 16_777_216,
      maxReferences: 10,
      maxOutputs: 15,
      supportsStyleRef: true,
    },
    defaults: { quality: "2k", aspectRatio: "auto", count: 1 },
  },
  "seedream-4-0-250828": {
    id: "seedream-4-0-250828",
    displayName: "Seedream 4.0",
    capabilities: {
      qualities: ["1k", "2k", "4k"],
      aspectRatios: [
        "auto",
        "1:1",
        "2:3",
        "3:2",
        "3:4",
        "4:3",
        "4:5",
        "5:4",
        "16:9",
        "9:16",
        "21:9",
      ],
      supportsArbitrarySize: true,
      minWidth: 256,
      maxWidth: 8192,
      minHeight: 256,
      maxHeight: 8192,
      maxPixels: 16_777_216,
      maxReferences: 10,
      maxOutputs: 15,
      supportsStyleRef: true,
    },
    defaults: { quality: "2k", aspectRatio: "auto", count: 1 },
  },
};

export const BYTEDANCE_VIDEO_MODELS: Record<string, VideoModelDef> = {
  "dreamina-seedance-2-0-260128": {
    id: "dreamina-seedance-2-0-260128",
    displayName: "Dreamina Seedance 2.0",
    capabilities: {
      durationsSec: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
      maxDurationSec: 15,
      fpsOptions: [24],
      resolutions: ["480p", "720p"],
      supportsFirstFrame: true,
      supportsLastFrame: true,
      supportsRefImages: true,
      maxReferences: 9,
    },
    defaults: { durationSec: 5, fps: 24, resolution: "720p" },
  },
};

export const GOOGLE_VIDEO_MODELS: Record<string, VideoModelDef> = {
  "veo-3.0-generate-001": {
    id: "veo-3.0-generate-001",
    displayName: "Veo 3",
    capabilities: {
      durationsSec: [4, 6, 8],
      maxDurationSec: 8,
      fpsOptions: [24],
      resolutions: ["720p", "1080p"],
      supportsFirstFrame: true,
      supportsLastFrame: true,
      supportsRefImages: true,
    },
    defaults: { durationSec: 8, fps: 24, resolution: "720p", aspectRatio: "16:9" },
  },
};

export const XAI_VIDEO_MODELS: Record<string, VideoModelDef> = {
  "grok-imagine-video": {
    id: "grok-imagine-video",
    displayName: "Grok Imagine Video",
    capabilities: {
      durationsSec: [5, 10, 15],
      maxDurationSec: 15,
      fpsOptions: [24],
      resolutions: ["480p", "720p"],
      supportsFirstFrame: true,
      supportsLastFrame: false,
      supportsRefImages: true,
    },
    defaults: { durationSec: 10, fps: 24, resolution: "720p", aspectRatio: "16:9" },
  },
};

export const XAI_IMAGE_MODELS: Record<string, ImageModelDef> = {
  "grok-imagine-image": {
    id: "grok-imagine-image",
    displayName: "Grok Imagine",
    capabilities: {
      aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"],
      qualities: ["1k", "2k"],
      maxReferences: 5,
      maxOutputs: 10,
      supportsStyleRef: true,
    },
    defaults: { aspectRatio: "1:1", quality: "1k", count: 1 },
  },
};

export const MINIMAX_IMAGE_MODELS: Record<string, ImageModelDef> = {
  "minimax-image-01": {
    id: "minimax-image-01",
    displayName: "MiniMax Image 01",
    capabilities: {
      aspectRatios: ["1:1", "16:9", "4:3", "3:2", "2:3", "3:4", "9:16", "21:9"],
      supportsArbitrarySize: true,
      minWidth: 512,
      maxWidth: 2048,
      minHeight: 512,
      maxHeight: 2048,
      widthMultiple: 8,
      heightMultiple: 8,
      maxReferences: 1,
      maxOutputs: 9,
      supportsStyleRef: true,
    },
    defaults: { aspectRatio: "1:1", count: 1 },
  },
};

export const MINIMAX_VIDEO_MODELS: Record<string, VideoModelDef> = {
  "MiniMax-Hailuo-2.3": {
    id: "MiniMax-Hailuo-2.3",
    displayName: "MiniMax Hailuo 2.3",
    capabilities: {
      durationsSec: [6, 10],
      maxDurationSec: 10,
      resolutions: ["768P", "1080P"],
      supportsFirstFrame: true,
      supportsLastFrame: false,
      supportsRefImages: false,
    },
    defaults: { durationSec: 6, resolution: "1080P" },
  },
};

/** Build a small in-memory ModelCatalog from the fixtures above. */
export function buildTestCatalog(): ModelCatalog {
  return {
    version: 2,
    models: {
      image: {
        ...OPENAI_IMAGE_MODELS,
        ...GOOGLE_IMAGE_MODELS,
        ...FLUX_IMAGE_MODELS,
        ...BYTEDANCE_IMAGE_MODELS,
        ...XAI_IMAGE_MODELS,
        ...MINIMAX_IMAGE_MODELS,
      },
      video: {
        ...BYTEDANCE_VIDEO_MODELS,
        ...GOOGLE_VIDEO_MODELS,
        ...XAI_VIDEO_MODELS,
        ...MINIMAX_VIDEO_MODELS,
      },
    },
    providers: {
      openai: {
        displayName: "OpenAI",
        image: Object.keys(OPENAI_IMAGE_MODELS).map((id) => ({ id, modelId: id })),
      },
      azure: {
        displayName: "Azure",
        image: [{ id: "azure-prod-gpt-image-2", modelId: "gpt-image-2" }],
      },
      google: {
        displayName: "Google AI Studio",
        image: Object.keys(GOOGLE_IMAGE_MODELS).map((id) => ({ id, modelId: id })),
        video: Object.keys(GOOGLE_VIDEO_MODELS).map((id) => ({ id, modelId: id })),
      },
      "flux-bfl": {
        displayName: "Black Forest Labs",
        image: Object.keys(FLUX_IMAGE_MODELS).map((id) => ({ id, modelId: id })),
      },
      bytedance: {
        // Legacy entry kept only so older fixtures that reference
        // `bytedance` don't blow up; the registry only wires `byteplus` and
        // `volcengine` now.
        displayName: "ByteDance",
        image: Object.keys(BYTEDANCE_IMAGE_MODELS).map((id) => ({ id, modelId: id })),
        video: Object.keys(BYTEDANCE_VIDEO_MODELS).map((id) => ({ id, modelId: id })),
      },
      byteplus: {
        displayName: "BytePlus",
        image: Object.keys(BYTEDANCE_IMAGE_MODELS).map((id) => ({ id, modelId: id })),
        video: Object.keys(BYTEDANCE_VIDEO_MODELS).map((id) => ({ id, modelId: id })),
      },
      volcengine: {
        displayName: "Volcengine",
        image: Object.keys(BYTEDANCE_IMAGE_MODELS).map((id) => ({
          id: `doubao-${id}`,
          modelId: id,
        })),
        video: Object.keys(BYTEDANCE_VIDEO_MODELS).map((id) => ({
          id: `doubao-${id.replace(/^dreamina-/, "")}`,
          modelId: id,
        })),
      },
      xai: {
        displayName: "xAI",
        image: Object.keys(XAI_IMAGE_MODELS).map((id) => ({ id, modelId: id })),
        video: Object.keys(XAI_VIDEO_MODELS).map((id) => ({ id, modelId: id })),
      },
      minimax: {
        displayName: "MiniMax",
        image: Object.keys(MINIMAX_IMAGE_MODELS).map((id) => ({ id, modelId: id })),
        video: Object.keys(MINIMAX_VIDEO_MODELS).map((id) => ({ id, modelId: id })),
      },
    },
  };
}
