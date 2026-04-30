import { z } from "zod";

export const ImageModelCapsSchema = z.object({
  sizes: z.array(z.string()).optional(),
  aspectRatios: z.array(z.string()).optional(),
  /**
   * Declares which `quality` values the model accepts (e.g. OpenAI's
   * `low | medium | high | auto`). When absent the model has no quality
   * knob — requests must not set `quality`. When present, requests with
   * `quality` set are validated against this list.
   */
  qualities: z.array(z.string()).optional(),
  /**
   * Declares which output image formats the model accepts as
   * `output_format` (e.g. `png | jpeg | webp`). The presence of this list
   * also signals that the model uses the newer `output_format` parameter
   * instead of the legacy `response_format` knob — providers route on it.
   * Absent ⇒ model has no format knob and we fall back to the legacy
   * `response_format: "b64_json"` shape.
   */
  outputFormats: z.array(z.string()).optional(),
  maxReferences: z.number().int().nonnegative().optional(),
  maxOutputs: z.number().int().min(1).default(1),
  supportsNegativePrompt: z.boolean().default(false),
  supportsSeed: z.boolean().default(false),
  supportsStyleRef: z.boolean().default(false),
});
export type ImageModelCaps = z.infer<typeof ImageModelCapsSchema>;

export const VideoModelCapsSchema = z.object({
  durationsSec: z.array(z.number()).optional(),
  maxDurationSec: z.number().optional(),
  fpsOptions: z.array(z.number()).optional(),
  resolutions: z.array(z.string()).optional(),
  supportsFirstFrame: z.boolean().default(false),
  supportsLastFrame: z.boolean().default(false),
  supportsRefImages: z.boolean().default(false),
});
export type VideoModelCaps = z.infer<typeof VideoModelCapsSchema>;

export const ImageModelDefSchema = z.object({
  id: z.string(),
  displayName: z.string().optional(),
  capabilities: ImageModelCapsSchema.optional(),
  defaults: z.record(z.string(), z.unknown()).optional(),
});
export type ImageModelDef = z.infer<typeof ImageModelDefSchema>;

export const VideoModelDefSchema = z.object({
  id: z.string(),
  displayName: z.string().optional(),
  capabilities: VideoModelCapsSchema.optional(),
  defaults: z.record(z.string(), z.unknown()).optional(),
});
export type VideoModelDef = z.infer<typeof VideoModelDefSchema>;

export const ImageModelEntrySchema = z.union([z.string(), ImageModelDefSchema]);
export type ImageModelEntry = z.infer<typeof ImageModelEntrySchema>;

export const VideoModelEntrySchema = z.union([z.string(), VideoModelDefSchema]);
export type VideoModelEntry = z.infer<typeof VideoModelEntrySchema>;

/**
 * Built-in catalog shape: providerId → modelId → ImageModelDef/VideoModelDef.
 * Concrete catalogs live in @imagine/providers.
 */
export type ImageCatalog = Record<string, Record<string, ImageModelDef>>;
export type VideoCatalog = Record<string, Record<string, VideoModelDef>>;

/**
 * Resolves a user-supplied entry against a built-in catalog. Strict mode:
 * an unknown short-form id throws — no silent fallback.
 *
 * Deep-merge order: built-in (base) ← user override (top), with capabilities
 * and defaults merged a level deeper.
 */
export function resolveImageModel(
  providerId: string,
  entry: ImageModelEntry,
  catalog: ImageCatalog,
): ImageModelDef {
  const id = typeof entry === "string" ? entry : entry.id;
  const builtin = catalog[providerId]?.[id];
  const override: Partial<ImageModelDef> = typeof entry === "string" ? {} : entry;
  if (!builtin && typeof entry === "string") {
    throw new Error(
      `Unknown model '${id}' for provider '${providerId}'. ` +
        "Supply capabilities inline or use a catalog id.",
    );
  }
  return ImageModelDefSchema.parse({
    id,
    displayName: override.displayName ?? builtin?.displayName,
    capabilities: {
      ...(builtin?.capabilities ?? {}),
      ...(override.capabilities ?? {}),
    },
    defaults: {
      ...(builtin?.defaults ?? {}),
      ...(override.defaults ?? {}),
    },
  });
}

export function resolveVideoModel(
  providerId: string,
  entry: VideoModelEntry,
  catalog: VideoCatalog,
): VideoModelDef {
  const id = typeof entry === "string" ? entry : entry.id;
  const builtin = catalog[providerId]?.[id];
  const override: Partial<VideoModelDef> = typeof entry === "string" ? {} : entry;
  if (!builtin && typeof entry === "string") {
    throw new Error(
      `Unknown video model '${id}' for provider '${providerId}'. ` +
        "Supply capabilities inline or use a catalog id.",
    );
  }
  return VideoModelDefSchema.parse({
    id,
    displayName: override.displayName ?? builtin?.displayName,
    capabilities: {
      ...(builtin?.capabilities ?? {}),
      ...(override.capabilities ?? {}),
    },
    defaults: {
      ...(builtin?.defaults ?? {}),
      ...(override.defaults ?? {}),
    },
  });
}
