import type {
  ImageCatalog,
  ImageModelDef,
  VideoCatalog,
  VideoModelDef,
} from "@imagine/core";

/**
 * Volcengine (Ark) hosts two model families under one provider:
 *   - Seedream: image
 *   - Seedance: video
 * Both reach the same Ark base URL with the same Bearer key. The runtime
 * discriminator is the port type — `VolcengineImageProvider` vs
 * `VolcengineVideoProvider`. See architecture.md §4 (vendor=provider).
 */
export const VOLCENGINE_IMAGE_MODELS: Record<string, ImageModelDef> = {
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

export const VOLCENGINE_VIDEO_MODELS: Record<string, VideoModelDef> = {
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

/** Image catalog keyed by provider id (`volcengine`). */
export const VOLCENGINE_IMAGE_CATALOG: ImageCatalog = {
  volcengine: VOLCENGINE_IMAGE_MODELS,
};

/** Video catalog keyed by provider id (`volcengine`). */
export const VOLCENGINE_VIDEO_CATALOG: VideoCatalog = {
  volcengine: VOLCENGINE_VIDEO_MODELS,
};
