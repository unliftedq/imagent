import type { ConfigFile, ProviderRouting, ProviderSecrets } from "@imagent/config";
import { ProviderSecretsSchema } from "@imagent/config";
import type { ImageProviderModel, VideoProviderModel } from "@imagent/core";
import { BUILT_IN_PROVIDER_IDS } from "../registry.js";
import type { ModelCatalog, ProviderCatalog } from "./schema.js";

export interface MigrationResult {
  catalog: ModelCatalog;
  config: ConfigFile;
  /** True iff the catalog or config was changed and should be persisted. */
  migrated: boolean;
  /** Per-provider summary of moved offering counts (for logging). */
  movedByProvider: Record<string, { image: number; video: number }>;
}

export interface SecretsMigrationResult {
  /** Validated, post-migration secrets. Always returned. */
  secrets: ProviderSecrets;
  /** Updated config — gains endpoint/baseUrl overlays migrated out of secrets. */
  config: ConfigFile;
  /** True iff the secrets file or config was changed and should be persisted. */
  migrated: boolean;
}

const ROUTING_KEYS_BUILT_IN: Record<string, ReadonlyArray<"endpoint" | "baseUrl">> = {
  openai: ["baseUrl"],
  "azure-openai": ["endpoint"],
  google: ["baseUrl"],
  "flux-bfl": ["baseUrl"],
  bytedance: ["endpoint"],
  xai: ["baseUrl"],
};

/**
 * One-time migration that moves per-user provider routing out of the catalog
 * and into the config file. Specifically:
 *
 *   - Any `azure-openai.image[]` / `azure-openai.video[]` offerings in the
 *     user's catalog are appended to `config.providers["azure-openai"]`
 *     (deduped by `id`) and removed from the catalog.
 *   - Any non–built-in provider ids in `catalog.providers` (i.e. custom
 *     OpenAI-compatible providers) have their offerings + displayName moved
 *     to `config.providers.customOpenAI.<id>` and removed from the catalog.
 *
 * Idempotent: re-running over an already-migrated state is a no-op. The
 * caller is responsible for persisting both files when `migrated === true`.
 */
export function migrateProviderRouting(catalog: ModelCatalog, config: ConfigFile): MigrationResult {
  const nextCatalog: ModelCatalog = {
    ...catalog,
    models: catalog.models,
    providers: { ...catalog.providers },
  };
  const nextConfigProviders = { ...config.providers };
  const customOpenAI: Record<string, ProviderRouting> = {
    ...(config.providers.customOpenAI ?? {}),
  };
  const movedByProvider: Record<string, { image: number; video: number }> = {};
  let migrated = false;

  // 1) Move Azure deployments. We always strip the catalog when it had any
  // offerings — even if the config already mirrored them — so the two files
  // don't drift. `movedByProvider` records the count of NEW additions.
  const azure = catalog.providers["azure-openai"];
  if (azure && (azure.image?.length || azure.video?.length)) {
    const existing = nextConfigProviders["azure-openai"] ?? {};
    const merged = mergeRoutingBlock(existing, azure);
    nextConfigProviders["azure-openai"] = merged.routing;
    movedByProvider["azure-openai"] = { image: merged.imageMoved, video: merged.videoMoved };
    nextCatalog.providers["azure-openai"] = stripOfferings(azure);
    migrated = true;
  }

  // 2) Move custom OpenAI-compatible providers.
  for (const [providerId, providerCatalog] of Object.entries(catalog.providers)) {
    if ((BUILT_IN_PROVIDER_IDS as readonly string[]).includes(providerId)) continue;
    if (!providerCatalog.image?.length && !providerCatalog.video?.length && !providerCatalog.displayName) {
      continue;
    }
    const existing = customOpenAI[providerId] ?? {};
    const merged = mergeRoutingBlock(existing, providerCatalog);
    customOpenAI[providerId] = merged.routing;
    movedByProvider[providerId] = { image: merged.imageMoved, video: merged.videoMoved };
    migrated = true;
    delete nextCatalog.providers[providerId];
  }

  if (Object.keys(customOpenAI).length > 0) {
    nextConfigProviders.customOpenAI = customOpenAI;
  }

  return {
    catalog: nextCatalog,
    config: { ...config, providers: nextConfigProviders },
    migrated,
    movedByProvider,
  };
}

/**
 * One-time migration that pulls non-secret routing fields (`endpoint`,
 * `baseUrl`, customOpenAI baseUrls) out of the legacy secrets.json shape and
 * into `config.providers.<id>`. Pass the **raw** JSON read from disk — the
 * post-split `ProviderSecretsSchema` would silently strip those fields, so
 * we operate on the unparsed structure.
 *
 * Returns:
 *   - `secrets`: validated against the new schema, with apiKeys preserved.
 *   - `config`: gains the migrated routing fields (existing config values win).
 *   - `migrated`: true when at least one field moved.
 *
 * Idempotent: when the file is already in the post-split shape (only apiKey
 * fields), this returns `migrated === false` and untouched config.
 */
export function migrateLegacySecretsRouting(
  rawSecrets: unknown,
  config: ConfigFile,
): SecretsMigrationResult {
  const source = isPlainObject(rawSecrets) ? rawSecrets : {};
  const cleanSecrets: Record<string, unknown> = {};
  const nextProviders = { ...config.providers };
  const nextCustomOpenAI: Record<string, ProviderRouting> = {
    ...(config.providers.customOpenAI ?? {}),
  };
  let migrated = false;

  for (const [providerId, value] of Object.entries(source)) {
    if (providerId === "customOpenAI") continue;
    if (!isPlainObject(value)) continue;
    const block = value;
    const apiKey = typeof block.apiKey === "string" ? block.apiKey : undefined;
    if (apiKey) cleanSecrets[providerId] = { apiKey };

    const routingFields = ROUTING_KEYS_BUILT_IN[providerId] ?? ["endpoint", "baseUrl"];
    for (const key of routingFields) {
      const v = block[key];
      if (typeof v !== "string" || !v) continue;
      const existing = (nextProviders as unknown as Record<string, ProviderRouting>)[providerId] ?? {};
      if (existing[key]) {
        // Config already owns this field — drop the legacy copy without overwriting.
        migrated = true;
        continue;
      }
      (nextProviders as unknown as Record<string, ProviderRouting>)[providerId] = {
        ...existing,
        [key]: v,
      };
      migrated = true;
    }
  }

  const customSrc = isPlainObject(source.customOpenAI) ? source.customOpenAI : {};
  const cleanCustom: Record<string, { apiKey: string }> = {};
  for (const [id, value] of Object.entries(customSrc)) {
    if (!isPlainObject(value)) continue;
    const apiKey = typeof value.apiKey === "string" ? value.apiKey : undefined;
    if (apiKey) cleanCustom[id] = { apiKey };

    const baseUrl = typeof value.baseUrl === "string" ? value.baseUrl : undefined;
    if (!baseUrl) continue;
    const existing = nextCustomOpenAI[id] ?? {};
    if (existing.baseUrl) {
      migrated = true;
      continue;
    }
    nextCustomOpenAI[id] = { ...existing, baseUrl };
    migrated = true;
  }
  if (Object.keys(cleanCustom).length > 0) cleanSecrets.customOpenAI = cleanCustom;
  if (Object.keys(nextCustomOpenAI).length > 0) {
    nextProviders.customOpenAI = nextCustomOpenAI;
  }

  const secrets = ProviderSecretsSchema.parse(cleanSecrets);
  return {
    secrets,
    config: migrated ? { ...config, providers: nextProviders } : config,
    migrated,
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Strip image/video offerings from a provider-catalog block, keeping
 * displayName so the catalog still answers "what is this provider called".
 */
function stripOfferings(block: ProviderCatalog): ProviderCatalog {
  return block.displayName ? { displayName: block.displayName } : {};
}

interface MergeOutput {
  routing: ProviderRouting;
  imageMoved: number;
  videoMoved: number;
}

function mergeRoutingBlock(existing: ProviderRouting, source: ProviderCatalog): MergeOutput {
  const imageMerge = appendUnique<ImageProviderModel>(existing.image ?? [], source.image ?? []);
  const videoMerge = appendUnique<VideoProviderModel>(existing.video ?? [], source.video ?? []);
  const routing: ProviderRouting = {
    ...existing,
    ...(existing.displayName || source.displayName
      ? { displayName: existing.displayName ?? source.displayName }
      : {}),
    ...(imageMerge.list.length ? { image: imageMerge.list } : {}),
    ...(videoMerge.list.length ? { video: videoMerge.list } : {}),
  };
  return { routing, imageMoved: imageMerge.added, videoMoved: videoMerge.added };
}

function appendUnique<T extends { id: string }>(
  base: readonly T[],
  incoming: readonly T[],
): { list: T[]; added: number } {
  if (incoming.length === 0) return { list: [...base], added: 0 };
  const seen = new Set(base.map((entry) => entry.id));
  const list: T[] = [...base];
  let added = 0;
  for (const entry of incoming) {
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    list.push(entry);
    added += 1;
  }
  return { list, added };
}
