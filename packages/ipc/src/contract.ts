import {
  AssetSchema,
  BoardSchema,
  GalleryItemSchema,
  GalleryQuerySchema,
  ImageRequestSchema,
  JobSchema,
  JobsQuerySchema,
  VideoRequestSchema,
} from "@imagine-studio/core";
import { z } from "zod";

/**
 * Hand-rolled IPC contract — one zod object per method, no tRPC. The renderer
 * `client.ts` is a Proxy that calls `output.parse()` on every reply, which
 * gives us runtime guarantees with no decorators or codegen.
 *
 * Tags reference architecture.md §8 and the milestone where each route lands.
 */

// ---- shared payloads ---------------------------------------------------

export const ProviderIdSchema = z.enum([
  "openai",
  "azure-openai",
  "google",
  "flux-bfl",
  "seedream",
  "seedance",
]);
export type ProviderId = z.infer<typeof ProviderIdSchema>;

export const ProviderSummarySchema = z.object({
  id: ProviderIdSchema,
  displayName: z.string(),
  configured: z.boolean(),
  /** When `configured`, the resolved default model for this provider. */
  defaultModel: z.string().nullable(),
  modelIds: z.array(z.string()),
});
export type ProviderSummary = z.infer<typeof ProviderSummarySchema>;

export const ProviderTestResultSchema = z.object({
  ok: z.boolean(),
  latencyMs: z.number().int().nonnegative().optional(),
  errorMessage: z.string().optional(),
});
export type ProviderTestResult = z.infer<typeof ProviderTestResultSchema>;

/**
 * Combined provider config payload (preferences + secrets surface) used by
 * the Providers / Settings page.
 */
export const ProviderConfigSchema = z.object({
  /** Stringified config.json subset for the page. M4 will tighten this. */
  configJson: z.string(),
});
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

export const KvKeySchema = z.string().min(1);
export const KvValueSchema = z.unknown();

// ---- contract map ------------------------------------------------------

export const contract = {
  // Providers
  "providers.list": { input: z.void(), output: z.array(ProviderSummarySchema) },
  "providers.config.get": { input: z.void(), output: ProviderConfigSchema },
  "providers.config.set": { input: ProviderConfigSchema, output: z.void() },
  "providers.test": {
    input: z.object({ id: ProviderIdSchema }),
    output: ProviderTestResultSchema,
  },

  // Image / Video
  "image.generate": { input: ImageRequestSchema, output: GalleryItemSchema },
  "video.submit": { input: VideoRequestSchema, output: JobSchema },

  // Jobs
  "jobs.list": { input: JobsQuerySchema, output: z.array(JobSchema) },
  "jobs.cancel": { input: z.object({ id: z.string() }), output: z.void() },

  // Assets (M3 / M6)
  "assets.list": {
    input: z
      .object({
        kind: z.enum(["character", "object", "background", "style"]).optional(),
        includeArchived: z.boolean().optional(),
      })
      .optional(),
    output: z.array(AssetSchema),
  },
  "assets.create": { input: AssetSchema, output: AssetSchema },
  "assets.update": {
    input: z.object({ id: z.string(), patch: AssetSchema.partial() }),
    output: AssetSchema,
  },
  "assets.delete": { input: z.object({ id: z.string() }), output: z.void() },
  "assets.uploadFile": {
    input: z.object({
      assetId: z.string(),
      role: z.enum(["reference", "thumbnail"]),
      mimeType: z.string(),
      bytes: z.instanceof(Uint8Array),
    }),
    output: z.object({ fileId: z.string(), relPath: z.string() }),
  },

  // Boards (M3 / M5)
  "boards.list": { input: z.void(), output: z.array(BoardSchema) },
  "boards.create": { input: BoardSchema, output: BoardSchema },
  "boards.update": {
    input: z.object({ id: z.string(), patch: BoardSchema.partial() }),
    output: BoardSchema,
  },
  "boards.delete": { input: z.object({ id: z.string() }), output: z.void() },
  "boards.addItem": {
    input: z.object({ boardId: z.string(), itemId: z.string(), position: z.number().int() }),
    output: z.void(),
  },
  "boards.removeItem": {
    input: z.object({ boardId: z.string(), itemId: z.string() }),
    output: z.void(),
  },
  "boards.setCover": {
    input: z.object({ boardId: z.string(), itemId: z.string().nullable() }),
    output: z.void(),
  },

  // Gallery (M3 / M5)
  "gallery.query": {
    input: GalleryQuerySchema,
    output: z.object({ items: z.array(GalleryItemSchema), total: z.number().int() }),
  },
  "gallery.remix": {
    input: z.object({ itemId: z.string() }),
    output: ImageRequestSchema,
  },
  "gallery.toggleFavorite": {
    input: z.object({ id: z.string(), favorited: z.boolean() }),
    output: z.void(),
  },
  "gallery.delete": { input: z.object({ id: z.string() }), output: z.void() },

  // Workspace KV (architecture.md §7)
  "workspace.kv.get": { input: z.object({ key: KvKeySchema }), output: KvValueSchema },
  "workspace.kv.set": {
    input: z.object({ key: KvKeySchema, value: KvValueSchema }),
    output: z.void(),
  },
  "workspace.kv.delete": { input: z.object({ key: KvKeySchema }), output: z.void() },
} as const;

export type Contract = typeof contract;
export type ContractMethod = keyof Contract;
export type Input<M extends ContractMethod> = z.infer<Contract[M]["input"]>;
export type Output<M extends ContractMethod> = z.infer<Contract[M]["output"]>;
