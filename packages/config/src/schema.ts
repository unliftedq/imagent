import { ImageModelEntrySchema, VideoModelEntrySchema } from "@imagine/core";
import { z } from "zod";

/**
 * Secrets are keyed by **vendor**. Volcengine secrets unlock both image
 * (Seedream) and video (Seedance) ports under the single `volcengine`
 * provider id. xAI is OpenAI-API-compatible image-only at v1.
 * See architecture.md §7.1.
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
  xai: z.object({ apiKey: z.string() }).optional(),
});
export type ProviderSecrets = z.infer<typeof ProviderSecretsSchema>;

/**
 * Preferences are keyed by **provider id** (= vendor). Volcengine carries
 * both image and video model lists under one block because Seedream and
 * Seedance share Ark credentials.
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
  volcengine: z.object({
    baseUrl: z.string().default("https://ark.cn-beijing.volces.com/api/v3"),
    imageModels: z.array(ImageModelEntrySchema),
    videoModels: z.array(VideoModelEntrySchema),
    defaultImageModel: z.string(),
    defaultVideoModel: z.string(),
    videoDefaults: z.record(z.unknown()).optional(),
  }),
  xai: z.object({
    baseUrl: z.string().default("https://api.x.ai/v1"),
    models: z.array(ImageModelEntrySchema),
    defaultModel: z.string(),
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
    volcengine: {
      baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
      imageModels: [],
      videoModels: [],
      defaultImageModel: "seedream-3.0",
      defaultVideoModel: "seedance-1.0-pro",
    },
    xai: {
      baseUrl: "https://api.x.ai/v1",
      models: [],
      defaultModel: "grok-2-image-1212",
    },
  },
};
