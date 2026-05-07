import { z } from "zod";
import { ImageProviderModelSchema, VideoProviderModelSchema } from "@imagent/core";

/**
 * Secrets are keyed by **vendor** and only carry the things you'd hate to
 * have leak — currently just `apiKey`. Routing data (endpoint URL, base URL
 * override, custom OpenAI provider URLs) is non-sensitive and lives in the
 * preferences file under `ProviderPreferencesSchema` instead.
 *
 * ByteDance secrets unlock both image (Seedream) and video (Seedance) ports
 * under the single `bytedance` provider id. xAI is OpenAI-API-compatible
 * image-only at v1.
 */
export const ProviderSecretsSchema = z.object({
  openai: z.object({ apiKey: z.string() }).optional(),
  "azure-openai": z.object({ apiKey: z.string() }).optional(),
  google: z.object({ apiKey: z.string() }).optional(),
  "flux-bfl": z.object({ apiKey: z.string() }).optional(),
  bytedance: z.object({ apiKey: z.string() }).optional(),
  xai: z.object({ apiKey: z.string() }).optional(),
  customOpenAI: z
    .record(
      z.string().regex(/^[a-z0-9][a-z0-9_-]*$/),
      z.object({ apiKey: z.string() }),
    )
    .optional(),
});
export type ProviderSecrets = z.infer<typeof ProviderSecretsSchema>;

/**
 * Per-user routing overlay for a provider. Carries everything non-sensitive:
 *
 *   - `endpoint` — Azure resource URL (`https://<resource>.openai.azure.com`)
 *     or ByteDance Ark region URL.
 *   - `baseUrl` — optional override for OpenAI-compatible vendors (proxy /
 *     self-hosted). Required for `customOpenAI.<id>` entries.
 *   - `image[]` / `video[]` — provider-facing offerings, same shape as
 *     `catalog.providers.<id>`. Config entries overlay catalog entries at
 *     runtime (deduped by `id`).
 *   - `displayName` — overrides the catalog display name (rare; mainly for
 *     custom OpenAI-compatible providers).
 *
 * Typical uses:
 *
 *   - Azure OpenAI deployments: `azure-openai.endpoint` plus
 *     `azure-openai.image[].id` deployment names mapped to canonical models.
 *   - Custom OpenAI-compatible providers (LM Studio, Together, vLLM, …):
 *     `customOpenAI.<id>.baseUrl` + `image[]/video[]`, with the apiKey in
 *     `ProviderSecrets.customOpenAI.<id>`.
 */
export const ProviderRoutingSchema = z.object({
  displayName: z.string().optional(),
  endpoint: z.string().optional(),
  baseUrl: z.string().optional(),
  image: z.array(ImageProviderModelSchema).optional(),
  video: z.array(VideoProviderModelSchema).optional(),
});
export type ProviderRouting = z.infer<typeof ProviderRoutingSchema>;

/**
 * Preferences are keyed by **provider id** (= vendor). Each provider's slot
 * carries optional per-user routing (deployments / model lists) and is the
 * canonical home for future provider-scoped knobs (e.g. concurrency
 * overrides). Custom OpenAI-compatible providers are nested under
 * `customOpenAI.<providerId>` and combined with credentials from
 * `ProviderSecrets.customOpenAI.<providerId>`.
 */
export const ProviderPreferencesSchema = z.object({
  openai: ProviderRoutingSchema.default({}),
  "azure-openai": ProviderRoutingSchema.default({}),
  google: ProviderRoutingSchema.default({}),
  "flux-bfl": ProviderRoutingSchema.default({}),
  bytedance: ProviderRoutingSchema.default({}),
  xai: ProviderRoutingSchema.default({}),
  customOpenAI: z
    .record(z.string().regex(/^[a-z0-9][a-z0-9_-]*$/), ProviderRoutingSchema)
    .default({}),
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
 * Defaults applied when config.json is missing or partial. Per-provider
 * routing slots start empty and are populated as users add Azure deployments
 * or custom OpenAI-compatible providers.
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
    customOpenAI: {},
  },
};
