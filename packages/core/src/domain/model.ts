import { z } from "zod";

export const ImageModelCapsSchema = z.object({
  sizes: z.array(z.string()).optional(),
  supportsArbitrarySize: z.boolean().optional(),
  minWidth: z.number().int().positive().optional(),
  maxWidth: z.number().int().positive().optional(),
  minHeight: z.number().int().positive().optional(),
  maxHeight: z.number().int().positive().optional(),
  maxPixels: z.number().int().positive().optional(),
  widthMultiple: z.number().int().positive().optional(),
  heightMultiple: z.number().int().positive().optional(),
  minAspectRatio: z.number().positive().optional(),
  maxAspectRatio: z.number().positive().optional(),
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
  maxReferenceSizeMb: z.number().positive().optional(),
  maxOutputs: z.number().int().min(1).default(1),
  supportsStyleRef: z.boolean().default(false),
});
export type ImageModelCaps = z.infer<typeof ImageModelCapsSchema>;

export const ImageModelCapsOverrideSchema = z.object({
  sizes: z.array(z.string()).optional(),
  supportsArbitrarySize: z.boolean().optional(),
  minWidth: z.number().int().positive().optional(),
  maxWidth: z.number().int().positive().optional(),
  minHeight: z.number().int().positive().optional(),
  maxHeight: z.number().int().positive().optional(),
  maxPixels: z.number().int().positive().optional(),
  widthMultiple: z.number().int().positive().optional(),
  heightMultiple: z.number().int().positive().optional(),
  minAspectRatio: z.number().positive().optional(),
  maxAspectRatio: z.number().positive().optional(),
  aspectRatios: z.array(z.string()).optional(),
  qualities: z.array(z.string()).optional(),
  outputFormats: z.array(z.string()).optional(),
  maxReferences: z.number().int().nonnegative().optional(),
  maxReferenceSizeMb: z.number().positive().optional(),
  maxOutputs: z.number().int().min(1).optional(),
  supportsStyleRef: z.boolean().optional(),
});
export type ImageModelCapsOverride = z.infer<typeof ImageModelCapsOverrideSchema>;

export const VideoModelCapsSchema = z.object({
  durationsSec: z.array(z.number()).optional(),
  maxDurationSec: z.number().optional(),
  fpsOptions: z.array(z.number()).optional(),
  resolutions: z.array(z.string()).optional(),
  aspectRatios: z.array(z.string()).optional(),
  maxReferences: z.number().int().nonnegative().optional(),
  maxReferenceSizeMb: z.number().positive().optional(),
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
  aspectRatios: z.array(z.string()).optional(),
  maxReferences: z.number().int().nonnegative().optional(),
  maxReferenceSizeMb: z.number().positive().optional(),
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

/**
 * Provider-facing offering. The same shape is used by:
 *   - `catalog.providers.<id>.image/video[]` (canonical, shipped/bundled)
 *   - `config.providers.<id>.image/video[]` (per-user overlay, e.g. Azure
 *     deployments, custom OpenAI-compatible providers)
 *
 * Resolution merges both lists at runtime: config overlays catalog, deduped by
 * `id`. `modelId` references a key in `catalog.models.image/video`, whose
 * capabilities and defaults the offering inherits and may override.
 */
export const ImageProviderModelSchema = z.object({
  id: z.string(),
  modelId: z.string(),
  displayName: z.string().optional(),
  capabilities: ImageModelCapsOverrideSchema.optional(),
  defaults: z.record(z.string(), z.unknown()).optional(),
});
export type ImageProviderModel = z.infer<typeof ImageProviderModelSchema>;

export const VideoProviderModelSchema = z.object({
  id: z.string(),
  modelId: z.string(),
  displayName: z.string().optional(),
  capabilities: VideoModelCapsOverrideSchema.optional(),
  defaults: z.record(z.string(), z.unknown()).optional(),
});
export type VideoProviderModel = z.infer<typeof VideoProviderModelSchema>;

// ---- Audio ----------------------------------------------------------------

export const VoiceInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Optional preview audio URL surfaced by the voice-list API. */
  previewUrl: z.string().optional(),
  /** Free-form provider labels (gender, accent, use case, ...). */
  labels: z.record(z.string(), z.string()).optional(),
});
export type VoiceInfo = z.infer<typeof VoiceInfoSchema>;

/** Declares an extra per-model knob (e.g. ElevenLabs stability). */
export const AudioKnobSchema = z.object({
  /** number ⇒ numeric range; enum ⇒ one of `values`. */
  type: z.enum(["number", "enum"]),
  min: z.number().optional(),
  max: z.number().optional(),
  values: z.array(z.string()).optional(),
});
export type AudioKnob = z.infer<typeof AudioKnobSchema>;

export const AudioModelCapsSchema = z.object({
  /** Static fallback voices when the provider has no list API. */
  voices: z.array(VoiceInfoSchema).optional(),
  /** Provider exposes a live voice-list endpoint. */
  supportsVoiceDiscovery: z.boolean().default(false),
  outputFormats: z.array(z.string()).optional(),
  speedRange: z.object({ min: z.number(), max: z.number() }).optional(),
  /** Extra knobs keyed by request `raw` key (e.g. stability, emotion). */
  extraKnobs: z.record(z.string(), AudioKnobSchema).optional(),
});
export type AudioModelCaps = z.infer<typeof AudioModelCapsSchema>;

export const AudioModelCapsOverrideSchema = z.object({
  voices: z.array(VoiceInfoSchema).optional(),
  supportsVoiceDiscovery: z.boolean().optional(),
  outputFormats: z.array(z.string()).optional(),
  speedRange: z.object({ min: z.number(), max: z.number() }).optional(),
  extraKnobs: z.record(z.string(), AudioKnobSchema).optional(),
});
export type AudioModelCapsOverride = z.infer<typeof AudioModelCapsOverrideSchema>;

export const AudioModelDefSchema = z.object({
  id: z.string(),
  baseModelId: z.string().optional(),
  displayName: z.string().optional(),
  capabilities: AudioModelCapsSchema.optional(),
  defaults: z.record(z.string(), z.unknown()).optional(),
});
export type AudioModelDef = z.infer<typeof AudioModelDefSchema>;

export const AudioProviderModelSchema = z.object({
  id: z.string(),
  modelId: z.string(),
  displayName: z.string().optional(),
  capabilities: AudioModelCapsOverrideSchema.optional(),
  defaults: z.record(z.string(), z.unknown()).optional(),
});
export type AudioProviderModel = z.infer<typeof AudioProviderModelSchema>;
