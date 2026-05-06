import { z } from "zod";

export const ImageReferenceSchema = z.object({
  /** Local path or pre-uploaded data URI. Provider-specific shape comes later. */
  path: z.string(),
  role: z.enum(["character", "object", "background", "style", "freeform"]).default("freeform"),
  /** Asset display name for asset-derived references, so prompts can refer to it by name. */
  assetName: z.string().optional(),
});
export type ImageReference = z.infer<typeof ImageReferenceSchema>;

export const ImageRequestSchema = z.object({
  prompt: z.string().min(1),
  negativePrompt: z.string().optional(),
  providerId: z.string(),
  model: z.string(),
  size: z.string().optional(),
  aspectRatio: z.string().optional(),
  /** Quality tier (e.g. OpenAI's `low | medium | high | auto`). Validated
   * against the resolved model's `capabilities.qualities` list when set. */
  quality: z.string().optional(),
  /** Output image format (e.g. `png | jpeg | webp`). Validated against the
   * resolved model's `capabilities.outputFormats` list. Required when the
   * provider uses the newer `output_format` parameter (gpt-image-*). */
  outputFormat: z.string().optional(),
  count: z.number().int().min(1).default(1),
  seed: z.number().int().optional(),
  references: z.array(ImageReferenceSchema).default([]),
  /** Asset ids to record on the resulting gallery_item via gallery_item_assets. */
  assetIds: z.array(z.string()).default([]),
  /** Optional board to add the resulting item to immediately. */
  boardId: z.string().optional(),
  /** Optional remix lineage — records gallery_items.parent_id on the result. */
  parentId: z.string().optional(),
  /** Provider-specific raw params passthrough (will land in params_json). */
  raw: z.record(z.string(), z.unknown()).optional(),
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
  raw: z.record(z.string(), z.unknown()).optional(),
});
export type VideoRequest = z.infer<typeof VideoRequestSchema>;

export const GenerationIntentSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("image"),
    request: ImageRequestSchema,
    /** Records `gallery_items.parent_id` on the resulting row (remix lineage). */
    parentId: z.string().optional(),
    /** When set, inserts a `board_items` row for the new gallery item. */
    boardId: z.string().optional(),
  }),
  z.object({
    kind: z.literal("video"),
    request: VideoRequestSchema,
    parentId: z.string().optional(),
    boardId: z.string().optional(),
  }),
]);
export type GenerationIntent = z.infer<typeof GenerationIntentSchema>;
