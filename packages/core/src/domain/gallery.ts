import { z } from "zod";
import { MediaKindSchema } from "./media.js";

export const GalleryItemSchema = z.object({
  id: z.string(),
  kind: MediaKindSchema,
  parentId: z.string().nullable().optional(),
  prompt: z.string(),
  negativePrompt: z.string().nullable().optional(),
  providerId: z.string(),
  model: z.string(),
  /** JSON-encoded params (size, fps, duration, count, raw provider params). */
  paramsJson: z.string(),
  relPath: z.string(),
  thumbPath: z.string().nullable().optional(),
  durationMs: z.number().int().nullable().optional(),
  width: z.number().int().nullable().optional(),
  height: z.number().int().nullable().optional(),
  bytes: z.number().int().nonnegative(),
  jobId: z.string().nullable().optional(),
  favorited: z.boolean().default(false),
  createdAt: z.number().int(),
});
export type GalleryItem = z.infer<typeof GalleryItemSchema>;

export const GalleryQuerySchema = z.object({
  kind: MediaKindSchema.optional(),
  boardId: z.string().optional(),
  parentId: z.string().optional(),
  search: z.string().optional(),
  favoritedOnly: z.boolean().optional(),
  limit: z.number().int().positive().default(50),
  offset: z.number().int().nonnegative().default(0),
});
export type GalleryQuery = z.infer<typeof GalleryQuerySchema>;

export const GalleryItemAssetLinkSchema = z.object({
  itemId: z.string(),
  assetId: z.string(),
  /** Denormalised AssetKind for query speed. */
  role: z.string(),
});
export type GalleryItemAssetLink = z.infer<typeof GalleryItemAssetLinkSchema>;
