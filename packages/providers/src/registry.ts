import type {
  ImageCatalog,
  ImageModelDef,
  ImageProvider,
  VideoCatalog,
  VideoModelDef,
  VideoProvider,
} from "@imagine-studio/core";
import { resolveImageModel, resolveVideoModel } from "@imagine-studio/core";
import type { ProviderPreferences, ProviderSecrets } from "@imagine-studio/config";

import { OPENAI_CATALOG } from "./openai/catalog.js";
import { OpenAIImageProvider } from "./openai/image.js";
import { AZURE_OPENAI_CATALOG } from "./azure/catalog.js";
import { AzureOpenAIImageProvider } from "./azure/image.js";
import { GOOGLE_CATALOG } from "./google/catalog.js";
import { GoogleImageProvider } from "./google/image.js";
import { FLUX_CATALOG } from "./flux/catalog.js";
import { FluxImageProvider } from "./flux/image.js";
import {
  VOLCENGINE_IMAGE_CATALOG,
  VOLCENGINE_IMAGE_MODELS,
  VOLCENGINE_VIDEO_CATALOG,
  VOLCENGINE_VIDEO_MODELS,
} from "./volcengine/catalog.js";
import { VolcengineImageProvider } from "./volcengine/image.js";
import { VolcengineVideoProvider } from "./volcengine/video.js";
import { XAI_CATALOG, XAI_IMAGE_MODELS } from "./xai/catalog.js";
import { XaiImageProvider } from "./xai/image.js";

/** Aggregate built-in image catalog merged across vendors. */
export const BUILTIN_IMAGE_CATALOG: ImageCatalog = {
  ...OPENAI_CATALOG,
  ...AZURE_OPENAI_CATALOG,
  ...GOOGLE_CATALOG,
  ...FLUX_CATALOG,
  ...VOLCENGINE_IMAGE_CATALOG,
  ...XAI_CATALOG,
};

/** Aggregate built-in video catalog. */
export const BUILTIN_VIDEO_CATALOG: VideoCatalog = {
  ...VOLCENGINE_VIDEO_CATALOG,
};

export type ImageRegistry = ReadonlyMap<string, ImageProvider>;
export type VideoRegistry = ReadonlyMap<string, VideoProvider>;

/**
 * Build the image-provider registry. Providers without configured secrets
 * are skipped silently — `imagine doctor` reports the gap to the user.
 *
 * Keys: `"openai" | "azure-openai" | "google" | "flux-bfl" | "volcengine" | "xai"`.
 */
export function createImageRegistry(
  secrets: ProviderSecrets,
  prefs: ProviderPreferences,
  catalog: ImageCatalog = BUILTIN_IMAGE_CATALOG,
): ImageRegistry {
  const out = new Map<string, ImageProvider>();

  if (secrets.openai) {
    const entries = ensureDefaultModel(prefs.openai.models, prefs.openai.defaultModel);
    const models = resolveModelMap("openai", entries, catalog);
    out.set(
      "openai",
      new OpenAIImageProvider({
        apiKey: secrets.openai.apiKey,
        baseUrl: prefs.openai.baseUrl,
        models,
      }),
    );
  }

  if (secrets["azure-openai"]) {
    // Azure resolves deployments rather than catalog ids; we look up
    // `image-default` capabilities as a baseline shared across deployments.
    const models = resolveAzureDeployments(prefs["azure-openai"].deployments);
    out.set(
      "azure-openai",
      new AzureOpenAIImageProvider({
        endpoint: secrets["azure-openai"].endpoint,
        apiKey: secrets["azure-openai"].apiKey,
        apiVersion: secrets["azure-openai"].apiVersion,
        models,
      }),
    );
  }

  if (secrets.google) {
    const entries = ensureDefaultModel(prefs.google.models, prefs.google.defaultModel);
    const models = resolveModelMap("google", entries, catalog);
    out.set("google", new GoogleImageProvider({ apiKey: secrets.google.apiKey, models }));
  }

  if (secrets["flux-bfl"]) {
    const entries = ensureDefaultModel(prefs["flux-bfl"].models, prefs["flux-bfl"].defaultModel);
    const models = resolveModelMap("flux-bfl", entries, catalog);
    out.set(
      "flux-bfl",
      new FluxImageProvider({
        apiKey: secrets["flux-bfl"].apiKey,
        baseUrl: prefs["flux-bfl"].baseUrl,
        models,
      }),
    );
  }

  // Volcengine consolidates Seedream (image) under one provider id.
  if (secrets.volcengine) {
    const entries = ensureDefaultModel(
      prefs.volcengine.imageModels,
      prefs.volcengine.defaultImageModel,
    );
    const models = resolveModelMap("volcengine", entries, catalog, {
      volcengine: VOLCENGINE_IMAGE_MODELS,
    });
    out.set(
      "volcengine",
      new VolcengineImageProvider({
        apiKey: secrets.volcengine.apiKey,
        baseUrl: prefs.volcengine.baseUrl,
        region: secrets.volcengine.region,
        models,
      }),
    );
  }

  if (secrets.xai) {
    const entries = ensureDefaultModel(prefs.xai.models, prefs.xai.defaultModel);
    const models = resolveModelMap("xai", entries, catalog, {
      xai: XAI_IMAGE_MODELS,
    });
    out.set(
      "xai",
      new XaiImageProvider({
        apiKey: secrets.xai.apiKey,
        baseUrl: prefs.xai.baseUrl,
        models,
      }),
    );
  }

  return out;
}

/** Video registry. v1 only Volcengine (Seedance). */
export function createVideoRegistry(
  secrets: ProviderSecrets,
  prefs: ProviderPreferences,
  catalog: VideoCatalog = BUILTIN_VIDEO_CATALOG,
): VideoRegistry {
  const out = new Map<string, VideoProvider>();

  if (secrets.volcengine) {
    const entries = ensureDefaultModel(
      prefs.volcengine.videoModels,
      prefs.volcengine.defaultVideoModel,
    );
    const models = resolveVideoModelMap("volcengine", entries, catalog, {
      volcengine: VOLCENGINE_VIDEO_MODELS,
    });
    out.set(
      "volcengine",
      new VolcengineVideoProvider({
        apiKey: secrets.volcengine.apiKey,
        baseUrl: prefs.volcengine.baseUrl,
        region: secrets.volcengine.region,
        models,
      }),
    );
  }

  return out;
}

/**
 * Distinct vendor-secret count. Configuring `volcengine.apiKey` increments
 * by 1 even though it unlocks both image + video; `xai.apiKey` increments
 * by 1 too. Used by `imagine doctor` to render "Providers: X / 6 configured".
 */
export function configuredProviderCount(secrets: ProviderSecrets): number {
  let n = 0;
  if (secrets.openai) n += 1;
  if (secrets["azure-openai"]) n += 1;
  if (secrets.google) n += 1;
  if (secrets["flux-bfl"]) n += 1;
  if (secrets.volcengine) n += 1;
  if (secrets.xai) n += 1;
  return n;
}

/** Total distinct vendor count across all registries. Six providers. */
export const TOTAL_PROVIDER_COUNT = 6;

// --- internal helpers ---------------------------------------------------

/**
 * Ensure the configured `defaultModel` (which doctor and `imagine generate`
 * fall back to) is present in the resolved models list. Users with empty
 * `models: []` still get a working registry against the catalog defaults.
 */
function ensureDefaultModel<T extends string | { id: string }>(
  entries: readonly T[],
  defaultModel: string | undefined,
): readonly (string | T)[] {
  if (!defaultModel) return entries;
  for (const e of entries) {
    const id = typeof e === "string" ? e : e.id;
    if (id === defaultModel) return entries;
  }
  return [defaultModel as string, ...entries];
}

function resolveModelMap(
  providerId: string,
  entries: readonly (string | ImageModelDef)[],
  catalog: ImageCatalog,
  extraCatalog: ImageCatalog = {},
): ReadonlyMap<string, ImageModelDef> {
  const out = new Map<string, ImageModelDef>();
  const merged: ImageCatalog = { ...catalog, ...extraCatalog };
  for (const entry of entries) {
    const resolved = resolveImageModel(providerId, entry, merged);
    out.set(resolved.id, resolved);
  }
  return out;
}

function resolveVideoModelMap(
  providerId: string,
  entries: readonly (string | VideoModelDef)[],
  catalog: VideoCatalog,
  extraCatalog: VideoCatalog = {},
): ReadonlyMap<string, VideoModelDef> {
  const out = new Map<string, VideoModelDef>();
  const merged: VideoCatalog = { ...catalog, ...extraCatalog };
  for (const entry of entries) {
    const resolved = resolveVideoModel(providerId, entry, merged);
    out.set(resolved.id, resolved);
  }
  return out;
}

function resolveAzureDeployments(
  deployments: { image: string; video: string | null },
): ReadonlyMap<string, ImageModelDef> {
  const out = new Map<string, ImageModelDef>();
  if (deployments.image) {
    // Borrow the canonical 'image-default' shape; users can override via the
    // `models` list once we surface that knob in the Azure prefs (M4).
    const baseline = AZURE_OPENAI_CATALOG["azure-openai"]?.["image-default"];
    if (baseline) {
      out.set(deployments.image, { ...baseline, id: deployments.image });
    } else {
      out.set(deployments.image, { id: deployments.image });
    }
  }
  return out;
}
