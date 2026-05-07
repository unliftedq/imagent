import type { ProviderPreferences, ProviderSecrets } from "@imagent/config";
import type { ImageProvider, VideoModelDef, VideoProvider } from "@imagent/core";
import { AzureImageProvider } from "./azure/image.js";
import { ByteDanceImageProvider } from "./bytedance/image.js";
import { ByteDanceVideoProvider } from "./bytedance/video.js";
import {
  effectiveProviderDisplayName,
  resolveImageProviderModels,
  resolveVideoProviderModels,
} from "./catalog/resolve.js";
import type { ModelCatalog } from "./catalog/schema.js";
import { FluxImageProvider } from "./flux/image.js";
import { GoogleImageProvider } from "./google/image.js";
import { GoogleVideoProvider } from "./google/video.js";
import { OpenAIImageProvider } from "./openai/image.js";
import { XaiImageProvider } from "./xai/image.js";
import { XaiVideoProvider } from "./xai/video.js";

export type ImageRegistry = ReadonlyMap<string, ImageProvider>;
export type VideoRegistry = ReadonlyMap<string, VideoProvider>;

const BUILT_IN_PROVIDER_IDS = [
  "openai",
  "azure",
  "google",
  "flux-bfl",
  "bytedance",
  "xai",
] as const;

/**
 * Build the image-provider registry. Effective offerings = catalog (canonical)
 * merged with `prefs.providers.<id>` (per-user overlay, e.g. Azure deployment
 * names, custom OpenAI-compatible model lists). Config wins on `id`
 * collisions; see `effectiveImageOfferings` for the merge semantics.
 *
 * Each provider is **its own class** with its own SDK client:
 *   - OpenAI / Azure / xAI / ByteDance image → `openai` SDK.
 *   - Google image / video → `@google/genai` SDK.
 *   - Flux + ByteDance Seedance + xAI video → raw HTTP (no usable SDK).
 *
 * Providers without configured secrets are skipped silently — `imagent
 * doctor` reports the gap.
 *
 * Built-in keys: `"openai" | "azure" | "google" | "flux-bfl" | "bytedance" | "xai"`.
 * Custom OpenAI-compatible providers are keyed by their declared id.
 */
export function createImageRegistry(
  secrets: ProviderSecrets,
  prefs: ProviderPreferences,
  catalog: ModelCatalog,
): ImageRegistry {
  const out = new Map<string, ImageProvider>();

  if (secrets.openai) {
    const openaiOpts: ConstructorParameters<typeof OpenAIImageProvider>[0] = {
      apiKey: secrets.openai.apiKey,
      models: mapFromList(resolveImageProviderModels(catalog, "openai", prefs)),
    };
    const baseUrl = prefs.openai?.baseUrl;
    if (baseUrl) openaiOpts.baseUrl = baseUrl;
    out.set("openai", new OpenAIImageProvider(openaiOpts));
  }

  const azureEndpoint = prefs.azure?.endpoint;
  if (secrets.azure?.apiKey && azureEndpoint) {
    out.set(
      "azure",
      new AzureImageProvider({
        endpoint: azureEndpoint,
        apiKey: secrets.azure.apiKey,
        models: mapFromList(resolveImageProviderModels(catalog, "azure", prefs)),
      }),
    );
  }

  if (secrets.google) {
    const googleOpts: ConstructorParameters<typeof GoogleImageProvider>[0] = {
      apiKey: secrets.google.apiKey,
      models: mapFromList(resolveImageProviderModels(catalog, "google", prefs)),
    };
    const baseUrl = prefs.google?.baseUrl;
    if (baseUrl) googleOpts.baseUrl = baseUrl;
    out.set("google", new GoogleImageProvider(googleOpts));
  }

  if (secrets["flux-bfl"]) {
    const fluxOpts: ConstructorParameters<typeof FluxImageProvider>[0] = {
      apiKey: secrets["flux-bfl"].apiKey,
      models: mapFromList(resolveImageProviderModels(catalog, "flux-bfl", prefs)),
    };
    const baseUrl = prefs["flux-bfl"]?.baseUrl;
    if (baseUrl) fluxOpts.baseUrl = baseUrl;
    out.set("flux-bfl", new FluxImageProvider(fluxOpts));
  }

  const bdEndpoint = prefs.bytedance?.endpoint;
  if (secrets.bytedance?.apiKey && bdEndpoint) {
    const bdOpts: ConstructorParameters<typeof ByteDanceImageProvider>[0] = {
      apiKey: secrets.bytedance.apiKey,
      endpoint: bdEndpoint,
      models: mapFromList(resolveImageProviderModels(catalog, "bytedance", prefs)),
    };
    out.set("bytedance", new ByteDanceImageProvider(bdOpts));
  }

  if (secrets.xai) {
    const xaiOpts: ConstructorParameters<typeof XaiImageProvider>[0] = {
      apiKey: secrets.xai.apiKey,
      models: mapFromList(resolveImageProviderModels(catalog, "xai", prefs)),
    };
    const baseUrl = prefs.xai?.baseUrl;
    if (baseUrl) xaiOpts.baseUrl = baseUrl;
    out.set("xai", new XaiImageProvider(xaiOpts));
  }

  // Custom OpenAI-compatible providers: routing in prefs (baseUrl required),
  // credentials in secrets. We skip entries that don't have both a baseUrl
  // and an offering list — without those there's nothing to dispatch to.
  const customRoutes = prefs.customOpenAI ?? {};
  for (const [providerId, routing] of Object.entries(customRoutes)) {
    if (out.has(providerId)) continue;
    const baseUrl = routing.baseUrl;
    if (!baseUrl) continue;
    const models = resolveImageProviderModels(catalog, providerId, prefs);
    if (models.length === 0) continue;
    const customSecrets = secrets.customOpenAI?.[providerId];
    out.set(
      providerId,
      new OpenAIImageProvider({
        providerId,
        displayName: effectiveProviderDisplayName(catalog, prefs, providerId),
        apiKey: customSecrets?.apiKey ?? "imagent-no-api-key",
        baseUrl,
        models: mapFromList(models),
      }),
    );
  }

  return out;
}

/**
 * Video registry. Wires raw-HTTP implementations for all video vendors:
 *   - ByteDance (Seedance) — Ark `contents/generations/tasks` long-poll.
 *   - Google (Veo) — Gemini `predictLongRunning` long operation.
 *   - xAI (Grok Imagine Video) — `/v1/videos/generations` + `/v1/videos/{id}`.
 *
 * A vendor is included only when its secret is configured in `secrets.*`.
 */
export function createVideoRegistry(
  secrets: ProviderSecrets,
  prefs: ProviderPreferences,
  catalog: ModelCatalog,
): VideoRegistry {
  const out = new Map<string, VideoProvider>();

  const bdEndpoint = prefs.bytedance?.endpoint;
  if (secrets.bytedance?.apiKey && bdEndpoint) {
    const opts: ConstructorParameters<typeof ByteDanceVideoProvider>[0] = {
      apiKey: secrets.bytedance.apiKey,
      endpoint: bdEndpoint,
      models: mapFromList(resolveVideoProviderModels(catalog, "bytedance", prefs)),
    };
    out.set("bytedance", new ByteDanceVideoProvider(opts));
  }

  if (secrets.google) {
    const googleOpts: ConstructorParameters<typeof GoogleVideoProvider>[0] = {
      apiKey: secrets.google.apiKey,
      models: mapFromList(resolveVideoProviderModels(catalog, "google", prefs)),
    };
    const baseUrl = prefs.google?.baseUrl;
    if (baseUrl) googleOpts.baseUrl = baseUrl;
    out.set("google", new GoogleVideoProvider(googleOpts));
  }

  if (secrets.xai) {
    const xaiOpts: ConstructorParameters<typeof XaiVideoProvider>[0] = {
      apiKey: secrets.xai.apiKey,
      models: mapFromList(resolveVideoProviderModels(catalog, "xai", prefs)),
    };
    const baseUrl = prefs.xai?.baseUrl;
    if (baseUrl) xaiOpts.baseUrl = baseUrl;
    out.set("xai", new XaiVideoProvider(xaiOpts));
  }

  return out;
}

/**
 * Distinct vendor count for `imagent doctor`'s "Providers: X / 6 configured"
 * line. A vendor is "configured" when it has both the credentials it needs
 * (apiKey from secrets) and any required routing (endpoint URL from prefs,
 * for vendors that demand one). Custom OpenAI-compatible providers count
 * once they have `prefs.customOpenAI.<id>.baseUrl` defined.
 */
export function configuredProviderCount(
  secrets: ProviderSecrets,
  prefs?: ProviderPreferences,
): number {
  let n = 0;
  if (secrets.openai) n += 1;
  if (secrets.azure?.apiKey && prefs?.azure?.endpoint) n += 1;
  if (secrets.google) n += 1;
  if (secrets["flux-bfl"]) n += 1;
  if (secrets.bytedance?.apiKey && prefs?.bytedance?.endpoint) n += 1;
  if (secrets.xai) n += 1;
  for (const routing of Object.values(prefs?.customOpenAI ?? {})) {
    if (routing.baseUrl) n += 1;
  }
  return n;
}

/** Total distinct vendor count across the built-in registries. */
export const TOTAL_PROVIDER_COUNT = BUILT_IN_PROVIDER_IDS.length;

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
  effectiveImageOfferings,
  effectiveProviderDisplayName,
  effectiveVideoOfferings,
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
export { BUILT_IN_PROVIDER_IDS };

// Re-export VideoModelDef helpers so other internal code can resolve types.
export type { VideoModelDef };
