import type { ProviderPreferences, ProviderSecrets } from "@imagent/config";
import type { ImageProvider, VideoModelDef, VideoProvider } from "@imagent/core";
import { AzureOpenAIImageProvider } from "./azure/image.js";
import { ByteDanceImageProvider } from "./bytedance/image.js";
import { ByteDanceVideoProvider } from "./bytedance/video.js";
import { resolveImageProviderModels, resolveVideoProviderModels } from "./catalog/resolve.js";
import type { ModelCatalog } from "./catalog/schema.js";
import { FluxImageProvider } from "./flux/image.js";
import { GoogleImageProvider } from "./google/image.js";
import { GoogleVideoProvider } from "./google/video.js";
import { OpenAIImageProvider } from "./openai/image.js";
import { XaiImageProvider } from "./xai/image.js";
import { XaiVideoProvider } from "./xai/video.js";

export type ImageRegistry = ReadonlyMap<string, ImageProvider>;
export type VideoRegistry = ReadonlyMap<string, VideoProvider>;

/**
 * Build the image-provider registry. The catalog separates canonical model
 * definitions from provider-facing offerings; the registry resolves each
 * provider's offerings into the concrete model map its implementation needs.
 *
 * Each provider is **its own class** with its own SDK client (Phase 3b):
 *   - OpenAI / Azure / xAI / ByteDance image → `openai` SDK.
 *   - Google image / video → `@google/genai` SDK.
 *   - Flux + ByteDance Seedance + xAI video → raw HTTP (no usable SDK).
 *
 * Providers without configured secrets are skipped silently — `imagent
 * doctor` reports the gap.
 *
 * Keys: `"openai" | "azure-openai" | "google" | "flux-bfl" | "bytedance" | "xai"`.
 */
export function createImageRegistry(
  secrets: ProviderSecrets,
  _prefs: ProviderPreferences,
  catalog: ModelCatalog,
): ImageRegistry {
  const out = new Map<string, ImageProvider>();

  if (secrets.openai) {
    const openaiOpts: ConstructorParameters<typeof OpenAIImageProvider>[0] = {
      apiKey: secrets.openai.apiKey,
      models: mapFromList(resolveImageProviderModels(catalog, "openai")),
    };
    if (secrets.openai.baseUrl) openaiOpts.baseUrl = secrets.openai.baseUrl;
    out.set("openai", new OpenAIImageProvider(openaiOpts));
  }

  if (secrets["azure-openai"]) {
    out.set(
      "azure-openai",
      new AzureOpenAIImageProvider({
        endpoint: secrets["azure-openai"].endpoint,
        apiKey: secrets["azure-openai"].apiKey,
        models: mapFromList(resolveImageProviderModels(catalog, "azure-openai")),
      }),
    );
  }

  if (secrets.google) {
    const googleOpts: ConstructorParameters<typeof GoogleImageProvider>[0] = {
      apiKey: secrets.google.apiKey,
      models: mapFromList(resolveImageProviderModels(catalog, "google")),
    };
    if (secrets.google.baseUrl) googleOpts.baseUrl = secrets.google.baseUrl;
    out.set("google", new GoogleImageProvider(googleOpts));
  }

  if (secrets["flux-bfl"]) {
    const fluxOpts: ConstructorParameters<typeof FluxImageProvider>[0] = {
      apiKey: secrets["flux-bfl"].apiKey,
      models: mapFromList(resolveImageProviderModels(catalog, "flux-bfl")),
    };
    if (secrets["flux-bfl"].baseUrl) fluxOpts.baseUrl = secrets["flux-bfl"].baseUrl;
    out.set("flux-bfl", new FluxImageProvider(fluxOpts));
  }

  if (secrets.bytedance) {
    const bdOpts: ConstructorParameters<typeof ByteDanceImageProvider>[0] = {
      apiKey: secrets.bytedance.apiKey,
      endpoint: secrets.bytedance.endpoint,
      models: mapFromList(resolveImageProviderModels(catalog, "bytedance")),
    };
    out.set("bytedance", new ByteDanceImageProvider(bdOpts));
  }

  if (secrets.xai) {
    const xaiOpts: ConstructorParameters<typeof XaiImageProvider>[0] = {
      apiKey: secrets.xai.apiKey,
      models: mapFromList(resolveImageProviderModels(catalog, "xai")),
    };
    if (secrets.xai.baseUrl) xaiOpts.baseUrl = secrets.xai.baseUrl;
    out.set("xai", new XaiImageProvider(xaiOpts));
  }

  for (const [providerId, customSecrets] of Object.entries(secrets.customOpenAI ?? {})) {
    if (out.has(providerId)) continue;
    const models = resolveImageProviderModels(catalog, providerId);
    if (models.length === 0) continue;
    out.set(
      providerId,
      new OpenAIImageProvider({
        providerId,
        displayName: catalog.providers[providerId]?.displayName ?? providerId,
        apiKey: customSecrets.apiKey ?? "imagent-no-api-key",
        baseUrl: customSecrets.baseUrl,
        models: mapFromList(models),
      }),
    );
  }

  return out;
}

/**
 * Video registry. Phase 3a wires real raw-HTTP implementations for all three
 * vendors:
 *   - ByteDance (Seedance) — Ark `contents/generations/tasks` long-poll.
 *   - Google (Veo) — Gemini `predictLongRunning` long operation.
 *   - xAI (Grok Imagine Video) — `/v1/videos/generations` + `/v1/videos/{id}`.
 *
 * A vendor is included only when its secret is configured in `secrets.*`.
 */
export function createVideoRegistry(
  secrets: ProviderSecrets,
  _prefs: ProviderPreferences,
  catalog: ModelCatalog,
): VideoRegistry {
  const out = new Map<string, VideoProvider>();

  if (secrets.bytedance) {
    const opts: ConstructorParameters<typeof ByteDanceVideoProvider>[0] = {
      apiKey: secrets.bytedance.apiKey,
      endpoint: secrets.bytedance.endpoint,
      models: mapFromList(resolveVideoProviderModels(catalog, "bytedance")),
    };
    out.set("bytedance", new ByteDanceVideoProvider(opts));
  }

  if (secrets.google) {
    const googleOpts: ConstructorParameters<typeof GoogleVideoProvider>[0] = {
      apiKey: secrets.google.apiKey,
      models: mapFromList(resolveVideoProviderModels(catalog, "google")),
    };
    if (secrets.google.baseUrl) googleOpts.baseUrl = secrets.google.baseUrl;
    out.set("google", new GoogleVideoProvider(googleOpts));
  }

  if (secrets.xai) {
    const xaiOpts: ConstructorParameters<typeof XaiVideoProvider>[0] = {
      apiKey: secrets.xai.apiKey,
      models: mapFromList(resolveVideoProviderModels(catalog, "xai")),
    };
    if (secrets.xai.baseUrl) xaiOpts.baseUrl = secrets.xai.baseUrl;
    out.set("xai", new XaiVideoProvider(xaiOpts));
  }

  return out;
}

/**
 * Distinct vendor-secret count. Configuring `bytedance.apiKey` increments
 * by 1 even though it unlocks both image + video; `xai.apiKey` increments
 * by 1 too. Used by `imagent doctor` to render "Providers: X / 6 configured".
 */
export function configuredProviderCount(secrets: ProviderSecrets): number {
  let n = 0;
  if (secrets.openai) n += 1;
  if (secrets["azure-openai"]) n += 1;
  if (secrets.google) n += 1;
  if (secrets["flux-bfl"]) n += 1;
  if (secrets.bytedance) n += 1;
  if (secrets.xai) n += 1;
  n += Object.keys(secrets.customOpenAI ?? {}).length;
  return n;
}

/** Total distinct vendor count across all registries. Six providers. */
export const TOTAL_PROVIDER_COUNT = 6;

// --- internal helpers ---------------------------------------------------

function mapFromList<T extends { id: string }>(list: readonly T[]): ReadonlyMap<string, T> {
  return new Map(list.map((item) => [item.id, item]));
}

export {
  type CatalogLoaderOptions,
  type CatalogSaveOptions,
  getBundledCatalog,
  loadCatalog,
  saveCatalog,
} from "./catalog/loader.js";
export {
  resolveImageProviderModel,
  resolveImageProviderModels,
  resolveVideoProviderModel,
  resolveVideoProviderModels,
} from "./catalog/resolve.js";
// Re-export the catalog types so consumers can import them via @imagent/providers.
export type { ModelCatalog } from "./catalog/schema.js";
export {
  type ImageProviderModel,
  ModelCatalogSchema,
  type ProviderCatalog,
  type VideoProviderModel,
} from "./catalog/schema.js";

// Re-export VideoModelDef helpers so other internal code can resolve types.
export type { VideoModelDef };
