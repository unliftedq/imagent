import type {
  ImageCatalog,
  ImageModelDef,
  VideoCatalog,
  VideoModelDef,
} from "@imagine-studio/core";

/**
 * Seedream is the image side of Volcengine; capability shape mirrors the
 * documented Ark image API (sizes, single-output by default).
 */
export const SEEDREAM_IMAGE_MODELS: Record<string, ImageModelDef> = {
  "seedream-3.0": {
    id: "seedream-3.0",
    displayName: "Seedream 3.0",
    capabilities: {
      sizes: ["1024x1024", "864x1152", "1152x864", "768x1344", "1344x768"],
      maxReferences: 4,
      maxOutputs: 4,
      supportsNegativePrompt: true,
      supportsSeed: true,
      supportsStyleRef: true,
    },
    defaults: { size: "1024x1024", count: 1 },
  },
};

export const SEEDREAM_CATALOG: ImageCatalog = {
  seedream: SEEDREAM_IMAGE_MODELS,
};

/**
 * Seedance is the video side of Volcengine. 1–5 minute completion, async,
 * polling-based. Resolutions documented per the Ark video API.
 */
export const SEEDANCE_VIDEO_MODELS: Record<string, VideoModelDef> = {
  "seedance-1.0-pro": {
    id: "seedance-1.0-pro",
    displayName: "Seedance 1.0 Pro",
    capabilities: {
      durationsSec: [5, 10],
      maxDurationSec: 10,
      fpsOptions: [24],
      resolutions: ["480p", "720p", "1080p"],
      supportsFirstFrame: true,
      supportsLastFrame: true,
      supportsRefImages: true,
    },
    defaults: { durationSec: 5, fps: 24, resolution: "720p" },
  },
};

export const SEEDANCE_CATALOG: VideoCatalog = {
  seedance: SEEDANCE_VIDEO_MODELS,
};
