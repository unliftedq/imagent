import { ImageModelEntrySchema, VideoModelEntrySchema } from "@imagine-studio/core";
import { z } from "zod";

/**
 * Secrets are keyed by **vendor**: volcengine secrets are shared between
 * seedream (image) and seedance (video). See architecture.md §7.
 */
export const ProviderSecretsSchema = z.object({
  openai: z.object({ apiKey: z.string() }).optional(),
  "azure-openai": z
    .object({
      endpoint: z.string(),
      apiKey: z.string(),
      apiVersion: z.string().default("2024-10-21"),
    })
    .optional(),
  google: z.object({ apiKey: z.string() }).optional(),
  "flux-bfl": z.object({ apiKey: z.string() }).optional(),
  volcengine: z
    .object({
      apiKey: z.string(),
      region: z.string().default("cn-beijing"),
    })
    .optional(),
});
export type ProviderSecrets = z.infer<typeof ProviderSecretsSchema>;

/**
 * Preferences are keyed by **provider id** — seedream and seedance are
 * separate, even though they share volcengine secrets. The asymmetry is
 * deliberate (architecture.md §7).
 */
export const ProviderPreferencesSchema = z.object({
  openai: z.object({
    baseUrl: z.string().nullable().default(null),
    models: z.array(ImageModelEntrySchema),
    defaultModel: z.string(),
  }),
  "azure-openai": z.object({
    deployments: z.object({
      image: z.string(),
      video: z.string().nullable().default(null),
    }),
    defaultDeployment: z.enum(["image", "video"]).default("image"),
  }),
  google: z.object({
    models: z.array(ImageModelEntrySchema),
    defaultModel: z.string(),
  }),
  "flux-bfl": z.object({
    baseUrl: z.string().default("https://api.bfl.ai"),
    models: z.array(ImageModelEntrySchema),
    defaultModel: z.string(),
  }),
  seedream: z.object({
    baseUrl: z.string(),
    models: z.array(ImageModelEntrySchema),
    defaultModel: z.string(),
  }),
  seedance: z.object({
    baseUrl: z.string(),
    models: z.array(VideoModelEntrySchema),
    defaultModel: z.string(),
    defaults: z.record(z.unknown()).optional(),
  }),
});
export type ProviderPreferences = z.infer<typeof ProviderPreferencesSchema>;

export const AppPreferencesSchema = z.object({
  theme: z.enum(["light", "dark", "system"]).default("system"),
  defaultProvider: z.string().default("openai"),
  defaultOutputDir: z.string().nullable().default(null),
  generationConcurrency: z.number().int().min(1).max(8).default(2),
  keepPromptHistory: z.boolean().default(true),
  openAfterGenerate: z.boolean().default(false),
});
export type AppPreferences = z.infer<typeof AppPreferencesSchema>;

export const ConfigFileSchema = z.object({
  version: z.literal(1),
  app: AppPreferencesSchema,
  providers: ProviderPreferencesSchema,
});
export type ConfigFile = z.infer<typeof ConfigFileSchema>;

/**
 * Defaults applied when config.json is missing or partial. Models lists are
 * empty by default — users opt in per provider via the catalog short-form
 * ids.
 */
export const DEFAULT_CONFIG: ConfigFile = {
  version: 1,
  app: AppPreferencesSchema.parse({}),
  providers: {
    openai: {
      baseUrl: null,
      models: [],
      defaultModel: "gpt-image-1",
    },
    "azure-openai": {
      deployments: {
        image: "",
        video: null,
      },
      defaultDeployment: "image",
    },
    google: {
      models: [],
      defaultModel: "imagen-3",
    },
    "flux-bfl": {
      baseUrl: "https://api.bfl.ai",
      models: [],
      defaultModel: "flux-pro-1.1",
    },
    seedream: {
      baseUrl: "https://ark.cn-beijing.volces.com",
      models: [],
      defaultModel: "seedream-3.0",
    },
    seedance: {
      baseUrl: "https://ark.cn-beijing.volces.com",
      models: [],
      defaultModel: "seedance-1.0-pro",
    },
  },
};
