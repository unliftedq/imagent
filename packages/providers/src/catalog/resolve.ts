import {
  ImageModelDefSchema,
  VideoModelDefSchema,
  type ImageModelDef,
  type VideoModelDef,
} from "@imagent/core";
import type { ImageProviderModel, ModelCatalog, VideoProviderModel } from "./schema.js";

export function resolveImageProviderModels(
  catalog: ModelCatalog,
  providerId: string,
): ImageModelDef[] {
  return (catalog.providers[providerId]?.image ?? []).map((offering) =>
    resolveImageProviderModel(catalog, providerId, offering),
  );
}

export function resolveVideoProviderModels(
  catalog: ModelCatalog,
  providerId: string,
): VideoModelDef[] {
  return (catalog.providers[providerId]?.video ?? []).map((offering) =>
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
  return ImageModelDefSchema.parse({
    id: offering.id,
    baseModelId: offering.modelId,
    displayName: providerDisplayName(offering, base),
    capabilities: {
      ...(base.capabilities ?? {}),
      ...(offering.capabilities ?? {}),
    },
    defaults: {
      ...(base.defaults ?? {}),
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
  return VideoModelDefSchema.parse({
    id: offering.id,
    baseModelId: offering.modelId,
    displayName: providerDisplayName(offering, base),
    capabilities: {
      ...(base.capabilities ?? {}),
      ...(offering.capabilities ?? {}),
    },
    defaults: {
      ...(base.defaults ?? {}),
      ...(offering.defaults ?? {}),
    },
  });
}

function providerDisplayName(
  offering: { id: string; modelId: string; displayName?: string },
  base: { displayName?: string },
): string | undefined {
  if (offering.displayName) return offering.displayName;
  if (offering.id !== offering.modelId) {
    return base.displayName ? `${offering.id} (${base.displayName})` : offering.id;
  }
  return base.displayName;
}
