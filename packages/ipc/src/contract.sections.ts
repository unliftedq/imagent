import {
  AssetSchema,
  SpeechModelDefSchema,
  SpeechRequestSchema,
  BoardSchema,
  GalleryItemSchema,
  GalleryQuerySchema,
  ImageModelDefSchema,
  ImageRequestSchema,
  JobSchema,
  JobsQuerySchema,
  VideoModelDefSchema,
  VideoRequestSchema,
  VoiceInfoSchema,
} from "@imagent/core";
import { z } from "zod";

import {
  AppPreferencesPayloadSchema,
  AppVersionInfoSchema,
  StoragePathsSchema,
} from "./contract.app.js";
import { IpcModelCatalogSchema } from "./contract.catalog.js";
import {
  MaskedSecretsSchema,
  ProviderIdSchema,
  ProviderPreferencesPayloadSchema,
  ProviderSummarySchema,
  ProviderTestResultSchema,
  SecretsWriteSchema,
} from "./contract.providers.js";
import { UpdateCheckResultSchema, UpdateStatusPayloadSchema } from "./contract.updater.js";

export const KvKeySchema = z.string().min(1);
export const KvValueSchema = z.unknown();

const assetSlotsSchema = z
  .object({
    character: z.array(z.string()).optional(),
    object: z.array(z.string()).optional(),
    background: z.array(z.string()).optional(),
    style: z.array(z.string()).optional(),
  })
  .optional();

export const providerContract = {
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
} as const;

export const appContract = {
  // App preferences (theme, default provider, output dir, etc.)
  "app.preferences.get": { input: z.void(), output: AppPreferencesPayloadSchema },
  "app.preferences.set": {
    input: AppPreferencesPayloadSchema.partial(),
    output: AppPreferencesPayloadSchema,
  },
  "app.version": { input: z.void(), output: AppVersionInfoSchema },
  "app.storagePaths": { input: z.void(), output: StoragePathsSchema },
} as const;

export const updaterContract = {
  // Auto-updater. See UpdateCheckResultSchema for the full flow.
  "updater.check": { input: z.void(), output: UpdateCheckResultSchema },
  "updater.download": { input: z.void(), output: UpdateStatusPayloadSchema },
  "updater.cancel": { input: z.void(), output: UpdateStatusPayloadSchema },
  "updater.install": { input: z.void(), output: z.void() },
  "updater.status": { input: z.void(), output: UpdateStatusPayloadSchema },
} as const;

export const catalogContract = {
  // Catalog (Phase 2). The runtime catalog file lives at `~/.imagent/catalog.json`
  // and is user-editable. `catalog.get` returns the loaded snapshot;
  // `catalog.path` returns its absolute path so the UI / CLI can offer an
  // "open in editor" affordance.
  "catalog.get": { input: z.void(), output: IpcModelCatalogSchema },
  "catalog.set": { input: IpcModelCatalogSchema, output: IpcModelCatalogSchema },
  "catalog.path": { input: z.void(), output: z.object({ path: z.string() }) },
} as const;

export const systemContract = {
  // System (shell + dialogs)
  "system.openExternal": { input: z.object({ url: z.string() }), output: z.void() },
  "system.openPath": { input: z.object({ path: z.string() }), output: z.void() },
  /**
   * Copy an image file (dataDir-relative or absolute, but always resolved
   * and gated inside dataDir) into the system clipboard as a native image.
   */
  "system.copyImage": { input: z.object({ path: z.string() }), output: z.void() },
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
  /**
   * Best-effort system locale (e.g. `en-US`, `zh-CN`). Returns Electron's
   * `app.getLocale()` from the main process. The renderer combines this
   * with the user's `locale` preference to resolve the effective UI
   * language (see `i18n/` in the desktop renderer).
   */
  "system.locale": { input: z.void(), output: z.object({ locale: z.string() }) },
} as const;

export const generationContract = {
  // Image / Video
  "image.generate": {
    /**
     * Renderer-facing image.generate input. Extends `ImageRequest` with an
     * optional `assetSlots` map so the renderer can attach assets per kind.
     * The handler resolves slots into reference paths + style snippets +
     * `gallery_item_assets` rows before invoking JobRunner.
     */
    input: ImageRequestSchema.extend({ assetSlots: assetSlotsSchema }),
    output: GalleryItemSchema,
  },
  /**
   * Submit an image job and return as soon as the runner accepts it. Studio
   * uses this non-blocking route so the composer can be reused while jobs run.
   */
  "image.submit": {
    input: ImageRequestSchema.extend({ assetSlots: assetSlotsSchema }),
    output: z.object({ jobId: z.string() }),
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
      assetSlots: assetSlotsSchema,
      parentId: z.string().optional(),
    }),
    output: z.object({ jobId: z.string() }),
  },
  /**
   * Submit a TTS job. Like image.submit it returns `{ jobId }` immediately;
   * the renderer subscribes to job.* push events for completion.
   */
  "speech.submit": {
    input: SpeechRequestSchema.extend({ parentId: z.string().optional() }),
    output: z.object({ jobId: z.string() }),
  },
} as const;

export const modelsContract = {
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

  // Same shape, but for video providers (BytePlus / 火山引擎 Seedance,
  // Google Veo, xAI Grok Imagine Video). M7.
  "video.models": {
    input: z.object({ providerId: ProviderIdSchema }),
    output: z.object({
      providerId: ProviderIdSchema,
      defaultModel: z.string().nullable(),
      models: z.array(VideoModelDefSchema),
    }),
  },

  "speech.models": {
    input: z.object({ providerId: ProviderIdSchema }),
    output: z.object({
      providerId: ProviderIdSchema,
      defaultModel: z.string().nullable(),
      models: z.array(SpeechModelDefSchema),
    }),
  },

  "speech.voices": {
    input: z.object({ providerId: ProviderIdSchema, modelId: z.string().optional() }),
    output: z.object({ voices: z.array(VoiceInfoSchema) }),
  },

  /**
   * Unified, multi-provider catalog view for the Models page. One row per
   * logical model id — when several providers ship the same id (e.g.
   * `gpt-image-2` from both `openai` and `azure`), they're merged
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
      speech: z.array(
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
} as const;

export const jobsContract = {
  // Jobs
  "jobs.list": { input: JobsQuerySchema, output: z.array(JobSchema) },
  "jobs.cancel": { input: z.object({ id: z.string() }), output: z.void() },
} as const;

export const assetsContract = {
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
} as const;

export const boardsContract = {
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
} as const;

export const galleryContract = {
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
      z.object({ kind: z.literal("speech"), request: SpeechRequestSchema }),
    ]),
  },
  "gallery.toggleFavorite": {
    // `favorited` optional — when omitted, the handler toggles the current value.
    input: z.object({ id: z.string(), favorited: z.boolean().optional() }),
    output: z.void(),
  },
  "gallery.delete": { input: z.object({ id: z.string() }), output: z.void() },
} as const;

export const workspaceContract = {
  // Workspace KV (architecture.md §7)
  "workspace.kv.get": { input: z.object({ key: KvKeySchema }), output: KvValueSchema },
  "workspace.kv.set": {
    input: z.object({ key: KvKeySchema, value: KvValueSchema }),
    output: z.void(),
  },
  "workspace.kv.delete": { input: z.object({ key: KvKeySchema }), output: z.void() },
} as const;
