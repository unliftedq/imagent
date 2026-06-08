import { z } from "zod";
import {
  SpeechProviderModelSchema,
  ImageProviderModelSchema,
  VideoProviderModelSchema,
} from "@imagent/core";

/**
 * Rename the legacy `bytedance` provider key onto its replacement
 * `byteplus`. Both the secrets file (`secrets.json`) and the prefs file
 * (`config.json`) previously stored ByteDance credentials / routing under
 * `bytedance`; the provider was split into `byteplus` (international Ark)
 * and `volcengine` (火山引擎, mainland Ark) in May 2026.
 *
 * Existing user data loads cleanly thanks to this preprocess step — the
 * legacy block is moved onto `byteplus` (BytePlus inherits the original
 * un-prefixed Seedream / Seedance ids). The next time the file is written
 * by the schema-validated stores it round-trips under the new key, so the
 * legacy `bytedance` field naturally disappears on first save.
 *
 * If the user has BOTH keys for any reason, the new `byteplus` value wins.
 */
function renameLegacyByteDance<T extends Record<string, unknown>>(input: unknown): unknown {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return input;
  const next = { ...(input as T) } as Record<string, unknown>;
  if ("bytedance" in next) {
    if (next.byteplus === undefined) {
      next.byteplus = next.bytedance;
    }
    delete next.bytedance;
  }
  return next;
}

function renameLegacyAudioRouting<T extends Record<string, unknown>>(input: unknown): unknown {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return input;
  const next = { ...(input as T) } as Record<string, unknown>;
  if ("audio" in next) {
    if (next.speech === undefined) {
      next.speech = next.audio;
    }
    delete next.audio;
  }
  return next;
}

function renameLegacyDefaultAudioModel<T extends Record<string, unknown>>(input: unknown): unknown {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return input;
  const next = { ...(input as T) } as Record<string, unknown>;
  if ("defaultAudioModel" in next) {
    if (next.defaultSpeechModel === undefined) {
      next.defaultSpeechModel = next.defaultAudioModel;
    }
    delete next.defaultAudioModel;
  }
  return next;
}

/**
 * Secrets are keyed by **vendor** and only carry the things you'd hate to
 * have leak — currently just `apiKey`. Routing data (endpoint URL, base URL
 * override, custom OpenAI provider URLs) is non-sensitive and lives in the
 * preferences file under `ProviderPreferencesSchema` instead.
 *
 * BytePlus and 火山引擎 (Volcengine) secrets each unlock both image (Seedream)
 * and video (Seedance) ports under their respective provider id. The two
 * providers share the same Ark HTTP shape but require their own apiKey and
 * endpoint (international BytePlus vs mainland Volcengine). xAI is
 * OpenAI-API-compatible image-only at v1.
 */
export const ProviderSecretsSchema = z.preprocess(
  renameLegacyByteDance,
  z.object({
    openai: z.object({ apiKey: z.string() }).optional(),
    azure: z.object({ apiKey: z.string() }).optional(),
    google: z.object({ apiKey: z.string() }).optional(),
    "flux-bfl": z.object({ apiKey: z.string() }).optional(),
    byteplus: z.object({ apiKey: z.string() }).optional(),
    volcengine: z.object({ apiKey: z.string() }).optional(),
    xai: z.object({ apiKey: z.string() }).optional(),
    minimax: z.object({ apiKey: z.string() }).optional(),
    elevenlabs: z.object({ apiKey: z.string() }).optional(),
    customOpenAI: z
      .record(
        z.string().regex(/^[a-z0-9][a-z0-9_-]*$/),
        z.object({ apiKey: z.string() }),
      )
      .optional(),
  }),
);
export type ProviderSecrets = z.infer<typeof ProviderSecretsSchema>;

/**
 * Per-user routing overlay for a provider. Carries everything non-sensitive:
 *
 *   - `endpoint` — Azure resource URL (`https://<resource>.openai.azure.com`)
 *     or Ark region URL for BytePlus / 火山引擎.
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
 *   - Azure Foundry deployments: `azure.endpoint` plus
 *     `azure.image[].id` deployment names mapped to canonical models.
 *   - Custom OpenAI-compatible providers (LM Studio, Together, vLLM, …):
 *     `customOpenAI.<id>.baseUrl` + `image[]/video[]`, with the apiKey in
 *     `ProviderSecrets.customOpenAI.<id>`.
 */
export const ProviderRoutingSchema = z.preprocess(
  renameLegacyAudioRouting,
  z.object({
    displayName: z.string().optional(),
    endpoint: z.string().optional(),
    baseUrl: z.string().optional(),
    /** MiniMax T2A v2 GroupId — required only for MiniMax speech generation. */
    groupId: z.string().optional(),
    image: z.array(ImageProviderModelSchema).optional(),
    video: z.array(VideoProviderModelSchema).optional(),
    speech: z.array(SpeechProviderModelSchema).optional(),
  }),
);
export type ProviderRouting = z.infer<typeof ProviderRoutingSchema>;

/**
 * Preferences are keyed by **provider id** (= vendor). Each provider's slot
 * carries optional per-user routing (deployments / model lists) and is the
 * canonical home for future provider-scoped knobs (e.g. concurrency
 * overrides). Custom OpenAI-compatible providers are nested under
 * `customOpenAI.<providerId>` and combined with credentials from
 * `ProviderSecrets.customOpenAI.<providerId>`.
 */
export const ProviderPreferencesSchema = z.preprocess(
  renameLegacyByteDance,
  z.object({
    openai: ProviderRoutingSchema.default({}),
    azure: ProviderRoutingSchema.default({}),
    google: ProviderRoutingSchema.default({}),
    "flux-bfl": ProviderRoutingSchema.default({}),
    byteplus: ProviderRoutingSchema.default({}),
    volcengine: ProviderRoutingSchema.default({}),
    xai: ProviderRoutingSchema.default({}),
    minimax: ProviderRoutingSchema.default({}),
    elevenlabs: ProviderRoutingSchema.default({}),
    customOpenAI: z
      .record(z.string().regex(/^[a-z0-9][a-z0-9_-]*$/), ProviderRoutingSchema)
      .default({}),
  }),
);
export type ProviderPreferences = z.infer<typeof ProviderPreferencesSchema>;

export const DefaultModelPreferenceSchema = z.object({
  providerId: z.string(),
  modelId: z.string(),
});
export type DefaultModelPreference = z.infer<typeof DefaultModelPreferenceSchema>;

export const AppPreferencesSchema = z.preprocess(
  renameLegacyDefaultAudioModel,
  z.object({
    theme: z.enum(["light", "dark", "system"]).default("system"),
    /**
     * UI display language. `"system"` follows Electron's `app.getLocale()` —
     * any `zh-*` locale resolves to Chinese, everything else falls back to
     * English. Explicit `"en"`/`"zh"` overrides the system locale.
     */
    locale: z.enum(["system", "en", "zh"]).default("system"),
    defaultImageModel: DefaultModelPreferenceSchema.nullable().default(null),
    defaultVideoModel: DefaultModelPreferenceSchema.nullable().default(null),
    defaultSpeechModel: DefaultModelPreferenceSchema.nullable().default(null),
    defaultOutputDir: z.string().nullable().default(null),
    generationConcurrency: z.number().int().min(1).max(8).default(2),
    keepPromptHistory: z.boolean().default(true),
    openAfterGenerate: z.boolean().default(false),
  }),
);
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
    azure: {},
    google: {},
    "flux-bfl": {},
    byteplus: {},
    volcengine: {},
    xai: {},
    minimax: {},
    elevenlabs: {},
    customOpenAI: {},
  },
};
