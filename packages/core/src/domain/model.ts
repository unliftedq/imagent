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

export const ImageModelCapsOverrideSchema = z.object({
  sizes: z.array(z.string()).optional(),
  aspectRatios: z.array(z.string()).optional(),
  qualities: z.array(z.string()).optional(),
  outputFormats: z.array(z.string()).optional(),
  maxReferences: z.number().int().nonnegative().optional(),
  maxOutputs: z.number().int().min(1).optional(),
  supportsNegativePrompt: z.boolean().optional(),
  supportsSeed: z.boolean().optional(),
  supportsStyleRef: z.boolean().optional(),
});
export type ImageModelCapsOverride = z.infer<typeof ImageModelCapsOverrideSchema>;

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

export const VideoModelCapsOverrideSchema = z.object({
  durationsSec: z.array(z.number()).optional(),
  maxDurationSec: z.number().optional(),
  fpsOptions: z.array(z.number()).optional(),
  resolutions: z.array(z.string()).optional(),
  supportsFirstFrame: z.boolean().optional(),
  supportsLastFrame: z.boolean().optional(),
  supportsRefImages: z.boolean().optional(),
});
export type VideoModelCapsOverride = z.infer<typeof VideoModelCapsOverrideSchema>;

export const ImageModelDefSchema = z.object({
  id: z.string(),
  /**
   * Canonical model this provider-facing id is backed by. For most providers
   * this equals `id`; for deployment-based providers such as Azure OpenAI,
   * `id` is the deployment name and `baseModelId` is the underlying model
   * whose capabilities/defaults should be inherited.
   */
  baseModelId: z.string().optional(),
  displayName: z.string().optional(),
  capabilities: ImageModelCapsSchema.optional(),
  defaults: z.record(z.string(), z.unknown()).optional(),
});
export type ImageModelDef = z.infer<typeof ImageModelDefSchema>;

export const VideoModelDefSchema = z.object({
  id: z.string(),
  /** See ImageModelDefSchema.baseModelId. */
  baseModelId: z.string().optional(),
  displayName: z.string().optional(),
  capabilities: VideoModelCapsSchema.optional(),
  defaults: z.record(z.string(), z.unknown()).optional(),
});
export type VideoModelDef = z.infer<typeof VideoModelDefSchema>;
