import { z } from "zod";

export const AppPreferencesPayloadSchema = z.object({
  theme: z.enum(["light", "dark", "system"]),
  locale: z.enum(["system", "en", "zh"]),
  defaultImageModel: z.object({ providerId: z.string(), modelId: z.string() }).nullable(),
  defaultVideoModel: z.object({ providerId: z.string(), modelId: z.string() }).nullable(),
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
