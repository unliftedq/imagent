import {
  AssetSchema,
  BoardSchema,
  GalleryItemSchema,
  GalleryQuerySchema,
  ImageModelCapsOverrideSchema,
  ImageModelDefSchema,
  ImageRequestSchema,
  JobSchema,
  JobsQuerySchema,
  VideoModelCapsOverrideSchema,
  VideoModelDefSchema,
  VideoRequestSchema,
} from "@imagent/core";
import { z } from "zod";

/**
 * Inline ModelCatalog schema. We deliberately define this here (rather than
 * importing from @imagent/providers) so the IPC package stays free of a
 * dependency on @imagent/providers — the renderer needs the contract types
 * to compile and the renderer must not pull in provider implementations.
 *
 * Shape mirrors `@imagent/providers#ModelCatalogSchema`.
 */
const IpcImageProviderModelSchema = z.object({
  id: z.string(),
  modelId: z.string(),
  displayName: z.string().optional(),
  capabilities: ImageModelCapsOverrideSchema.optional(),
  defaults: z.record(z.string(), z.unknown()).optional(),
});

const IpcVideoProviderModelSchema = z.object({
  id: z.string(),
  modelId: z.string(),
  displayName: z.string().optional(),
  capabilities: VideoModelCapsOverrideSchema.optional(),
  defaults: z.record(z.string(), z.unknown()).optional(),
});

const IpcModelCatalogSchema = z.object({
  version: z.literal(2),
  models: z.object({
    image: z.record(z.string(), ImageModelDefSchema),
    video: z.record(z.string(), VideoModelDefSchema),
  }),
  providers: z.record(
    z.string(),
    z.object({
      displayName: z.string().optional(),
      image: z.array(IpcImageProviderModelSchema).optional(),
      video: z.array(IpcVideoProviderModelSchema).optional(),
    }),
  ),
  comments: z.string().optional(),
});
export type ModelCatalogPayload = z.infer<typeof IpcModelCatalogSchema>;

/**
 * Structured error envelope returned across the IPC boundary. The renderer
 * never sees a thrown Error — it sees `{ ok: false, error }` and the client
 * Proxy unwraps that into a thrown `IpcError` for the caller.
 */
export const IpcErrorCodeSchema = z.enum([
  "validation_failed",
  "not_implemented",
  "provider_error",
  "internal",
  "not_found",
]);
export type IpcErrorCode = z.infer<typeof IpcErrorCodeSchema>;

export const IpcErrorSchema = z.object({
  code: IpcErrorCodeSchema,
  message: z.string(),
  details: z.record(z.string(), z.unknown()).optional(),
});
export type IpcError = z.infer<typeof IpcErrorSchema>;

/** Server → renderer envelope. Never thrown across IPC. */
export const IpcResponseSchema = <T extends z.ZodTypeAny>(out: T) =>
  z.discriminatedUnion("ok", [
    z.object({ ok: z.literal(true), value: out }),
    z.object({ ok: z.literal(false), error: IpcErrorSchema }),
  ]);

/**
 * Hand-rolled IPC contract — one zod object per method, no tRPC. The renderer
 * `client.ts` is a Proxy that calls `output.parse()` on every reply, which
 * gives us runtime guarantees with no decorators or codegen.
 *
 * Tags reference architecture.md §8 and the milestone where each route lands.
 */

// ---- shared payloads ---------------------------------------------------

export const ProviderIdSchema = z.string().regex(/^[a-z0-9][a-z0-9_-]*$/);
export type ProviderId = z.infer<typeof ProviderIdSchema>;

/**
 * Which generation kinds a provider participates in. ByteDance spans both
 * `image` and `video` because Seedream + Seedance share Ark credentials
 * under one provider id (architecture.md §4 vendor=provider).
 */
export const ProviderKindSchema = z.enum(["image", "video"]);
export type ProviderKind = z.infer<typeof ProviderKindSchema>;

export const ProviderSummarySchema = z.object({
  id: ProviderIdSchema,
  displayName: z.string(),
  configured: z.boolean(),
  /** Generation kinds this provider supports. */
  kinds: z.array(ProviderKindSchema),
  /** When `configured`, the resolved default model for this provider. */
  defaultModel: z.string().nullable(),
  modelIds: z.array(z.string()),
});
export type ProviderSummary = z.infer<typeof ProviderSummarySchema>;

export const ProviderTestResultSchema = z.union([
  z.object({
    ok: z.literal(true),
    latencyMs: z.number().int().nonnegative(),
    sampleModelId: z.string().optional(),
  }),
  z.object({
    ok: z.literal(false),
    reason: z.string(),
    status: z.number().int().optional(),
  }),
]);
export type ProviderTestResult = z.infer<typeof ProviderTestResultSchema>;

/**
 * Provider preferences block — non-secret per-provider config. After the
 * "users only fill in the minimum required to authenticate" reshape, the
 * catalog is the canonical model/provider-offering list for every well-known
 * provider; Azure deployment names live in the catalog provider offering layer.
 *
 * Each provider keeps an explicit slot (even when empty) so future settings
 * have a stable home. Mirrors `config.providers` in shape.
 */
export const ProviderPreferencesPayloadSchema = z.object({
  openai: z.object({}),
  "azure-openai": z.object({}),
  google: z.object({}),
  "flux-bfl": z.object({}),
  bytedance: z.object({}),
  xai: z.object({}),
});
export type ProviderPreferencesPayload = z.infer<typeof ProviderPreferencesPayloadSchema>;

/**
 * Secrets payload returned to the renderer is **always masked** (first 4 +
 * last 4 chars only). Writing accepts the plaintext; the renderer never
 * reads back its own writes.
 */
export const MaskedSecretsSchema = z.object({
  openai: z.object({ apiKey: z.string().nullable() }).optional(),
  "azure-openai": z
    .object({
      endpoint: z.string().nullable(),
      apiKey: z.string().nullable(),
    })
    .optional(),
  google: z.object({ apiKey: z.string().nullable() }).optional(),
  "flux-bfl": z.object({ apiKey: z.string().nullable() }).optional(),
  bytedance: z
    .object({
      endpoint: z.string().nullable(),
      apiKey: z.string().nullable(),
    })
    .optional(),
  xai: z.object({ apiKey: z.string().nullable() }).optional(),
  customOpenAI: z
    .record(
      ProviderIdSchema,
      z.object({
        baseUrl: z.string().nullable(),
        apiKey: z.string().nullable(),
      }),
    )
    .optional(),
});
export type MaskedSecrets = z.infer<typeof MaskedSecretsSchema>;

/** Plaintext secrets the renderer is allowed to write. */
export const SecretsWriteSchema = z.object({
  openai: z
    .object({ apiKey: z.string().min(1) })
    .partial()
    .optional(),
  "azure-openai": z
    .object({
      endpoint: z.string().min(1).optional(),
      apiKey: z.string().min(1).optional(),
    })
    .optional(),
  google: z
    .object({ apiKey: z.string().min(1) })
    .partial()
    .optional(),
  "flux-bfl": z
    .object({ apiKey: z.string().min(1) })
    .partial()
    .optional(),
  bytedance: z
    .object({
      endpoint: z.string().min(1).optional(),
      apiKey: z.string().min(1).optional(),
    })
    .optional(),
  xai: z
    .object({ apiKey: z.string().min(1) })
    .partial()
    .optional(),
  customOpenAI: z
    .record(
      ProviderIdSchema,
      z.object({
        baseUrl: z.string().min(1),
        apiKey: z.string().min(1).optional(),
      }),
    )
    .optional(),
});
export type SecretsWrite = z.infer<typeof SecretsWriteSchema>;

export const AppPreferencesPayloadSchema = z.object({
  theme: z.enum(["light", "dark", "system"]),
  defaultProvider: z.string(),
  defaultOutputDir: z.string().nullable(),
  generationConcurrency: z.number().int().min(1).max(8),
  keepPromptHistory: z.boolean(),
  openAfterGenerate: z.boolean(),
});
export type AppPreferencesPayload = z.infer<typeof AppPreferencesPayloadSchema>;

export const AppVersionInfoSchema = z.object({
  app: z.string(),
  electron: z.string(),
  node: z.string(),
  chrome: z.string().optional(),
  platform: z.string(),
  arch: z.string(),
  dataDir: z.string(),
});
export type AppVersionInfo = z.infer<typeof AppVersionInfoSchema>;

export const StoragePathsSchema = z.object({
  dataDir: z.string(),
  configFile: z.string(),
  /** Path to the user-editable JSON model catalog (`~/.imagent/catalog.json`). */
  catalogFile: z.string(),
  secretsJson: z.string(),
  dbFile: z.string(),
  galleryDir: z.string(),
  assetsDir: z.string(),
  logsDir: z.string(),
});
export type StoragePaths = z.infer<typeof StoragePathsSchema>;

/**
 * Legacy combined provider config payload (kept for backward compat with the
 * M1 contract; nothing in M4 calls it). New code uses providers.preferences.*
 * + providers.secrets.* directly.
 */
export const ProviderConfigSchema = z.object({
  configJson: z.string(),
});
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

export const KvKeySchema = z.string().min(1);
export const KvValueSchema = z.unknown();

// ---- contract map ------------------------------------------------------

export const contract = {
  // Providers
  "providers.list": { input: z.void(), output: z.array(ProviderSummarySchema) },
  "providers.config.get": { input: z.void(), output: ProviderPreferencesPayloadSchema },
  "providers.config.set": {
    input: ProviderPreferencesPayloadSchema,
    output: ProviderPreferencesPayloadSchema,
  },
  "providers.secrets.get": { input: z.void(), output: MaskedSecretsSchema },
  "providers.secrets.set": { input: SecretsWriteSchema, output: MaskedSecretsSchema },
  "providers.test": {
    input: z.object({ id: ProviderIdSchema }),
    output: ProviderTestResultSchema,
  },

  // App preferences (theme, default provider, output dir, etc.)
  "app.preferences.get": { input: z.void(), output: AppPreferencesPayloadSchema },
  "app.preferences.set": {
    input: AppPreferencesPayloadSchema.partial(),
    output: AppPreferencesPayloadSchema,
  },
  "app.version": { input: z.void(), output: AppVersionInfoSchema },
  "app.storagePaths": { input: z.void(), output: StoragePathsSchema },

  // Catalog (Phase 2). The runtime catalog file lives at `~/.imagent/catalog.json`
  // and is user-editable. `catalog.get` returns the loaded snapshot;
  // `catalog.path` returns its absolute path so the UI / CLI can offer an
  // "open in editor" affordance.
  "catalog.get": { input: z.void(), output: IpcModelCatalogSchema },
  "catalog.set": { input: IpcModelCatalogSchema, output: IpcModelCatalogSchema },
  "catalog.path": { input: z.void(), output: z.object({ path: z.string() }) },

  // System (shell + dialogs)
  "system.openExternal": { input: z.object({ url: z.string() }), output: z.void() },
  "system.openPath": { input: z.object({ path: z.string() }), output: z.void() },
  "system.chooseDirectory": {
    input: z.object({ defaultPath: z.string().optional() }).optional(),
    output: z.object({ path: z.string().nullable() }),
  },
  "system.chooseFiles": {
    input: z
      .object({
        defaultPath: z.string().optional(),
        multiple: z.boolean().optional(),
        filters: z
          .array(
            z.object({
              name: z.string(),
              extensions: z.array(z.string()),
            }),
          )
          .optional(),
      })
      .optional(),
    output: z.object({ paths: z.array(z.string()) }),
  },
  "system.resetConfig": { input: z.void(), output: z.void() },

  // Image / Video
  "image.generate": {
    /**
     * Renderer-facing image.generate input. Extends `ImageRequest` with an
     * optional `assetSlots` map so the renderer can attach assets per kind.
     * The handler resolves slots into reference paths + style snippets +
     * `gallery_item_assets` rows before invoking JobRunner.
     */
    input: ImageRequestSchema.extend({
      assetSlots: z
        .object({
          character: z.array(z.string()).optional(),
          object: z.array(z.string()).optional(),
          background: z.array(z.string()).optional(),
          style: z.array(z.string()).optional(),
        })
        .optional(),
    }),
    output: GalleryItemSchema,
  },
  /**
   * M7: Submit a Seedance (or future) video job. Unlike `image.generate`
   * which blocks-and-awaits the gallery item, video submission returns
   * `{ jobId }` immediately — Seedance jobs run for minutes, so the
   * renderer subscribes to `job.progress`/`job.completed` push events
   * instead of awaiting the IPC reply.
   */
  "video.submit": {
    input: VideoRequestSchema.extend({
      assetSlots: z
        .object({
          character: z.array(z.string()).optional(),
          object: z.array(z.string()).optional(),
          background: z.array(z.string()).optional(),
          style: z.array(z.string()).optional(),
        })
        .optional(),
      parentId: z.string().optional(),
    }),
    output: z.object({ jobId: z.string() }),
  },

  // Model resolution — returns the deep-merged catalog ← user-override view
  // for an image provider, the same shape JobRunner & validators consume.
  "image.models": {
    input: z.object({ providerId: ProviderIdSchema }),
    output: z.object({
      providerId: ProviderIdSchema,
      defaultModel: z.string().nullable(),
      models: z.array(ImageModelDefSchema),
    }),
  },

  // Same shape, but for video providers (currently ByteDance / Seedance). M7.
  "video.models": {
    input: z.object({ providerId: ProviderIdSchema }),
    output: z.object({
      providerId: ProviderIdSchema,
      defaultModel: z.string().nullable(),
      models: z.array(VideoModelDefSchema),
    }),
  },

  /**
   * Unified, multi-provider catalog view for the Models page. One row per
   * logical model id — when several providers ship the same id (e.g.
   * `gpt-image-2` from both `openai` and `azure-openai`), they're merged
   * into a single entry with `providers[]` listing each routable source and
   * whether that source is currently configured (auth saved).
   */
  "models.list": {
    input: z.void(),
    output: z.object({
      image: z.array(
        z.object({
          id: z.string(),
          displayName: z.string().nullable(),
          providers: z.array(
            z.object({
              providerId: ProviderIdSchema,
              modelId: z.string(),
              displayName: z.string(),
              configured: z.boolean(),
            }),
          ),
        }),
      ),
      video: z.array(
        z.object({
          id: z.string(),
          displayName: z.string().nullable(),
          providers: z.array(
            z.object({
              providerId: ProviderIdSchema,
              modelId: z.string(),
              displayName: z.string(),
              configured: z.boolean(),
            }),
          ),
        }),
      ),
    }),
  },

  // Jobs
  "jobs.list": { input: JobsQuerySchema, output: z.array(JobSchema) },
  "jobs.cancel": { input: z.object({ id: z.string() }), output: z.void() },

  // Assets (M3 / M6 / M8)
  "assets.list": {
    input: z
      .object({
        kind: z.enum(["character", "object", "background", "style"]).optional(),
        includeArchived: z.boolean().optional(),
        /**
         * M8: When true, return ONLY archived assets — drives the Trash tab
         * on the Assets page. Mutually exclusive with `includeArchived`.
         */
        archivedOnly: z.boolean().optional(),
        search: z.string().optional(),
        limit: z.number().int().positive().optional(),
        offset: z.number().int().nonnegative().optional(),
      })
      .optional(),
    output: z.object({
      items: z.array(AssetSchema),
      total: z.number().int().nonnegative(),
    }),
  },
  "assets.show": {
    input: z.object({ id: z.string() }),
    output: AssetSchema,
  },
  "assets.create": {
    input: z.object({
      kind: z.enum(["character", "object", "background", "style"]),
      name: z.string().min(1),
      description: z.string().nullable().optional(),
      promptSnippet: z.string().nullable().optional(),
      fileUploads: z
        .array(
          z.object({
            bytes: z.instanceof(Uint8Array),
            originalName: z.string(),
            mimeType: z.string(),
          }),
        )
        .max(1)
        .default([]),
    }),
    output: AssetSchema,
  },
  "assets.createFromGalleryItem": {
    input: z.object({
      itemId: z.string(),
      kind: z.enum(["character", "object", "background", "style"]),
      name: z.string().min(1),
      description: z.string().nullable().optional(),
      promptSnippet: z.string().nullable().optional(),
    }),
    output: AssetSchema,
  },
  "assets.update": {
    input: z.object({
      id: z.string(),
      patch: z.object({
        name: z.string().min(1).optional(),
        description: z.string().nullable().optional(),
        promptSnippet: z.string().nullable().optional(),
      }),
    }),
    output: AssetSchema,
  },
  /**
   * `assets.delete` is **permanent** — the row + on-disk files are removed and
   * cannot be recovered. The Assets page UI surfaces archive-first; this
   * route is the second-step "Delete permanently" action plus the Trash tab's
   * row-level "Delete permanently" / "Empty trash" actions. (M8)
   */
  "assets.delete": { input: z.object({ id: z.string() }), output: z.void() },
  /**
   * Soft-delete an asset (M8). Stamps `archived_at`; reversible. Files on
   * disk are untouched. AssetPicker filters archived assets out so the user
   * doesn't see them when picking refs in Studio / Video Studio.
   */
  "assets.archive": { input: z.object({ id: z.string() }), output: z.void() },
  /**
   * Reverse of `assets.archive` (M8). Idempotent — restoring a live asset is
   * a no-op.
   */
  "assets.restore": { input: z.object({ id: z.string() }), output: z.void() },
  "assets.uploadFile": {
    input: z.object({
      assetId: z.string(),
      role: z.enum(["reference", "thumbnail"]).default("reference"),
      bytes: z.instanceof(Uint8Array),
      originalName: z.string(),
      mimeType: z.string(),
    }),
    output: z.object({ fileId: z.string(), relPath: z.string() }),
  },
  "assets.removeFile": {
    input: z.object({ fileId: z.string() }),
    output: z.void(),
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
    // Position is optional — when omitted, the handler appends at max+1.
    // Idempotent: a no-op if (boardId, itemId) is already linked.
    input: z.object({
      boardId: z.string(),
      itemId: z.string(),
      position: z.number().int().optional(),
    }),
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
  "gallery.show": {
    input: z.object({ id: z.string() }),
    output: z.object({
      item: GalleryItemSchema,
      parent: GalleryItemSchema.nullable(),
      children: z.array(GalleryItemSchema),
      siblings: z.array(GalleryItemSchema),
      /**
       * `gallery_item_assets` rows joined with the asset name + kind for the
       * lineage drawer's "Used assets" block (M6).
       */
      assets: z
        .array(
          z.object({
            assetId: z.string(),
            role: z.string(),
            name: z.string().nullable(),
            kind: z.enum(["character", "object", "background", "style"]).nullable(),
          }),
        )
        .default([]),
    }),
  },
  /**
   * Reconstruct a fresh request from an existing gallery item. Output is a
   * discriminated union — image parents return an `ImageRequest`, video
   * parents return a `VideoRequest` (M7). The renderer routes to /studio or
   * /video respectively based on `kind`.
   */
  "gallery.remix": {
    input: z.object({ itemId: z.string() }),
    output: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("image"), request: ImageRequestSchema }),
      z.object({ kind: z.literal("video"), request: VideoRequestSchema }),
    ]),
  },
  "gallery.toggleFavorite": {
    // `favorited` optional — when omitted, the handler toggles the current value.
    input: z.object({ id: z.string(), favorited: z.boolean().optional() }),
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
