import { z } from "zod";

/**
 * Secrets are keyed by **vendor**. ByteDance secrets unlock both image
 * (Seedream) and video (Seedance) ports under the single `bytedance`
 * provider id. xAI is OpenAI-API-compatible image-only at v1.
 *
 * Most well-known vendors (OpenAI / Google / Flux / xAI) carry a canonical
 * base URL hardcoded in the provider class; `baseUrl` here is an **optional
 * advanced override** for power users who want to point at a proxy or
 * self-hosted compatible endpoint (the desktop UI does not surface it —
 * edit `~/.imagine/secrets.json` by hand).
 *
 * Azure OpenAI and ByteDance break that pattern: both require an
 * `endpoint + apiKey` pair. Azure's endpoint encodes the user's resource
 * name; ByteDance's encodes the Ark region (`cn-beijing`,
 * `ap-southeast`, …). See architecture.md §7.1.
 */
export const ProviderSecretsSchema = z.object({
  openai: z
    .object({
      apiKey: z.string(),
      baseUrl: z.string().optional(),
    })
    .optional(),
  "azure-openai": z
    .object({
      endpoint: z.string(),
      apiKey: z.string(),
    })
    .optional(),
  google: z
    .object({
      apiKey: z.string(),
      baseUrl: z.string().optional(),
    })
    .optional(),
  "flux-bfl": z
    .object({
      apiKey: z.string(),
      baseUrl: z.string().optional(),
    })
    .optional(),
  bytedance: z
    .object({
      endpoint: z.string(),
      apiKey: z.string(),
    })
    .optional(),
  xai: z
    .object({
      apiKey: z.string(),
      baseUrl: z.string().optional(),
    })
    .optional(),
});
export type ProviderSecrets = z.infer<typeof ProviderSecretsSchema>;

/**
 * Preferences are keyed by **provider id** (= vendor). The catalog (in
 * `@imagine/providers`) is the canonical source of model definitions and
 * provider-facing model/deployment bindings — users no longer maintain
 * `models[]` in config.json.
 *
 * Each provider's slot is kept (as `z.object({}).default({})`) so future
 * provider-scoped knobs (e.g. concurrency overrides) have a stable home.
 * Azure OpenAI deployment names live in `~/.imagine/catalog.json` under
 * `providers.azure-openai.image[].id`, with `modelId` pointing at the
 * canonical model whose capabilities should be inherited.
 */
export const ProviderPreferencesSchema = z.object({
  openai: z.object({}).default({}),
  "azure-openai": z.object({}).default({}),
  google: z.object({}).default({}),
  "flux-bfl": z.object({}).default({}),
  bytedance: z.object({}).default({}),
  xai: z.object({}).default({}),
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
 * Defaults applied when config.json is missing or partial. Well-known
 * providers carry empty slots because catalog provider offerings are
 * consulted at runtime.
 */
export const DEFAULT_CONFIG: ConfigFile = {
  version: 1,
  app: AppPreferencesSchema.parse({}),
  providers: {
    openai: {},
    "azure-openai": {},
    google: {},
    "flux-bfl": {},
    bytedance: {},
    xai: {},
  },
};
