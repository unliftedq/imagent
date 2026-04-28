import { z } from "zod";

export const ImageReferenceSchema = z.object({
  /** Local path or pre-uploaded data URI. Provider-specific shape comes later. */
  path: z.string(),
  role: z.enum(["character", "object", "background", "style", "freeform"]).default("freeform"),
});
export type ImageReference = z.infer<typeof ImageReferenceSchema>;

export const ImageRequestSchema = z.object({
  prompt: z.string().min(1),
  negativePrompt: z.string().optional(),
  providerId: z.string(),
  model: z.string(),
  size: z.string().optional(),
  aspectRatio: z.string().optional(),
  count: z.number().int().min(1).default(1),
  seed: z.number().int().optional(),
  references: z.array(ImageReferenceSchema).default([]),
  /** Asset ids to record on the resulting gallery_item via gallery_item_assets. */
  assetIds: z.array(z.string()).default([]),
  /** Optional board to add the resulting item to immediately. */
  boardId: z.string().optional(),
  /** Provider-specific raw params passthrough (will land in params_json). */
  raw: z.record(z.unknown()).optional(),
});
export type ImageRequest = z.infer<typeof ImageRequestSchema>;

export const VideoRequestSchema = z.object({
  prompt: z.string().min(1),
  negativePrompt: z.string().optional(),
  providerId: z.string(),
  model: z.string(),
  durationSec: z.number().positive().optional(),
  fps: z.number().positive().optional(),
  resolution: z.string().optional(),
  aspectRatio: z.string().optional(),
  firstFrame: z.string().optional(),
  lastFrame: z.string().optional(),
  references: z.array(ImageReferenceSchema).default([]),
  assetIds: z.array(z.string()).default([]),
  boardId: z.string().optional(),
  raw: z.record(z.unknown()).optional(),
});
export type VideoRequest = z.infer<typeof VideoRequestSchema>;

export const GenerationIntentSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("image"), request: ImageRequestSchema }),
  z.object({ kind: z.literal("video"), request: VideoRequestSchema }),
]);
export type GenerationIntent = z.infer<typeof GenerationIntentSchema>;
