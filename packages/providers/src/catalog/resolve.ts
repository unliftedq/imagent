import type { ProviderPreferences, ProviderRouting } from "@imagent/config";
import {
  ImageModelDefSchema,
  VideoModelDefSchema,
  type ImageModelDef,
  type ImageProviderModel,
  type VideoModelDef,
  type VideoProviderModel,
} from "@imagent/core";
import type { ModelCatalog } from "./schema.js";

/**
 * Compute the effective image offerings for a provider by merging the
 * canonical catalog list with the per-user config overlay. Config entries
 * **win** on `id` collisions (so a user can override a bundled offering's
 * displayName/capabilities without forking the whole catalog), and any
 * config-only entries are appended in their declared order.
 */
export function effectiveImageOfferings(
  catalog: ModelCatalog,
  prefs: ProviderPreferences | undefined,
  providerId: string,
): ImageProviderModel[] {
  const catalogList = catalog.providers[providerId]?.image ?? [];
  const configList = readRouting(prefs, providerId)?.image ?? [];
  return mergeOfferings(catalogList, configList);
}

export function effectiveVideoOfferings(
  catalog: ModelCatalog,
  prefs: ProviderPreferences | undefined,
  providerId: string,
): VideoProviderModel[] {
  const catalogList = catalog.providers[providerId]?.video ?? [];
  const configList = readRouting(prefs, providerId)?.video ?? [];
  return mergeOfferings(catalogList, configList);
}

/**
 * Effective display name: config overrides catalog, falling back to the
 * canonical catalog displayName then the provider id itself.
 */
export function effectiveProviderDisplayName(
  catalog: ModelCatalog,
  prefs: ProviderPreferences | undefined,
  providerId: string,
): string {
  const overlay = readRouting(prefs, providerId)?.displayName;
  if (overlay) return overlay;
  return catalog.providers[providerId]?.displayName ?? providerId;
}

/**
 * Resolve the merged offerings list into concrete provider model defs (with
 * canonical capabilities + defaults applied). The registry uses this — most
 * other callers should prefer `effectiveImageOfferings` and resolve only the
 * specific entries they need via {@link resolveImageProviderModel}.
 */
export function resolveImageProviderModels(
  catalog: ModelCatalog,
  providerId: string,
  prefs?: ProviderPreferences,
): ImageModelDef[] {
  return effectiveImageOfferings(catalog, prefs, providerId).map((offering) =>
    resolveImageProviderModel(catalog, providerId, offering),
  );
}

export function resolveVideoProviderModels(
  catalog: ModelCatalog,
  providerId: string,
  prefs?: ProviderPreferences,
): VideoModelDef[] {
  return effectiveVideoOfferings(catalog, prefs, providerId).map((offering) =>
    resolveVideoProviderModel(catalog, providerId, offering),
  );
}

export function resolveImageProviderModel(
  catalog: ModelCatalog,
  providerId: string,
  offering: ImageProviderModel,
): ImageModelDef {
  const base = catalog.models.image[offering.modelId];
  if (!base) {
    throw new Error(
      `Provider '${providerId}' image model '${offering.id}' references unknown canonical model '${offering.modelId}'`,
    );
  }
  const providerOverride = catalog.providers[providerId]?.modelOverrides?.[offering.modelId];
  return ImageModelDefSchema.parse({
    id: offering.id,
    baseModelId: offering.modelId,
    displayName: providerDisplayName(offering, base),
    capabilities: {
      ...(base.capabilities ?? {}),
      ...(providerOverride?.capabilities ?? {}),
      ...(offering.capabilities ?? {}),
    },
    defaults: {
      ...(base.defaults ?? {}),
      ...(providerOverride?.defaults ?? {}),
      ...(offering.defaults ?? {}),
    },
  });
}

export function resolveVideoProviderModel(
  catalog: ModelCatalog,
  providerId: string,
  offering: VideoProviderModel,
): VideoModelDef {
  const base = catalog.models.video[offering.modelId];
  if (!base) {
    throw new Error(
      `Provider '${providerId}' video model '${offering.id}' references unknown canonical model '${offering.modelId}'`,
    );
  }
  const providerOverride = catalog.providers[providerId]?.modelOverrides?.[offering.modelId];
  return VideoModelDefSchema.parse({
    id: offering.id,
    baseModelId: offering.modelId,
    displayName: providerDisplayName(offering, base),
    capabilities: {
      ...(base.capabilities ?? {}),
      ...(providerOverride?.capabilities ?? {}),
      ...(offering.capabilities ?? {}),
    },
    defaults: {
      ...(base.defaults ?? {}),
      ...(providerOverride?.defaults ?? {}),
      ...(offering.defaults ?? {}),
    },
  });
}

function readRouting(
  prefs: ProviderPreferences | undefined,
  providerId: string,
): ProviderRouting | undefined {
  if (!prefs) return undefined;
  // Built-in providers live as direct keys on prefs; custom providers live
  // under prefs.customOpenAI.<id>.
  if (providerId in prefs && providerId !== "customOpenAI") {
    return (prefs as unknown as Record<string, ProviderRouting>)[providerId];
  }
  return prefs.customOpenAI?.[providerId];
}

function mergeOfferings<T extends { id: string }>(
  catalogList: readonly T[],
  configList: readonly T[],
): T[] {
  if (configList.length === 0) return [...catalogList];
  const overrides = new Map(configList.map((entry) => [entry.id, entry]));
  const merged: T[] = [];
  const seen = new Set<string>();
  for (const entry of catalogList) {
    const overlay = overrides.get(entry.id);
    merged.push(overlay ?? entry);
    seen.add(entry.id);
  }
  for (const entry of configList) {
    if (!seen.has(entry.id)) merged.push(entry);
  }
  return merged;
}

function providerDisplayName(
  offering: { id: string; modelId: string; displayName?: string },
  base: { displayName?: string },
): string | undefined {
  if (offering.displayName) return offering.displayName;
  // When the offering id differs from the canonical model id (e.g. an Azure
  // deployment name), prefer the canonical model's display name so the UI
  // shows "GPT Image 2" rather than "my-deployment (GPT Image 2)".
  return base.displayName ?? (offering.id !== offering.modelId ? undefined : offering.id);
}
