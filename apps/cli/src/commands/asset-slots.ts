import path from "node:path";

import {
  type AssetSlotInputs as CoreAssetSlotInputs,
  type AssetSlotResolution,
  capReferencePaths,
  resolveAssetSlots,
} from "@imagine/core";
import {
  AssetRepository,
  type DatabaseType,
  type PathResolver,
} from "@imagine/persistence";

/** CLI-shaped slot input (plural keys mirror the repeatable CLI flags). */
export interface AssetSlotInputs {
  characters?: string[];
  objects?: string[];
  backgrounds?: string[];
  styles?: string[];
}

export type AssetSlotResult = AssetSlotResolution;

interface AssetSlotsOptions {
  alwaysAppendStyleSnippets?: boolean;
  preferStyleRefOverSnippet?: boolean;
  /** Whether the resolved model supports reference images. Defaults to true. */
  supportsReferences?: boolean;
}

/**
 * Resolve CLI-shaped asset slots into the shared resolver's output. Looks
 * up assets through the AssetRepository and converts the rel paths into
 * absolutes via the data root.
 */
export async function buildAssetSlots(
  resolver: PathResolver,
  db: DatabaseType,
  inputs: AssetSlotInputs,
  options: AssetSlotsOptions = {},
): Promise<AssetSlotResult> {
  const repo = new AssetRepository(db);
  const coreInputs: CoreAssetSlotInputs = {
    ...(inputs.characters ? { character: inputs.characters } : {}),
    ...(inputs.objects ? { object: inputs.objects } : {}),
    ...(inputs.backgrounds ? { background: inputs.backgrounds } : {}),
    ...(inputs.styles ? { style: inputs.styles } : {}),
  };
  return resolveAssetSlots(
    coreInputs,
    (id) => repo.get(id),
    (rel) =>
      path.isAbsolute(rel) ? rel : path.join(resolver.dataDir, rel),
    {
      ...(options.supportsReferences !== undefined
        ? { supportsReferences: options.supportsReferences }
        : {}),
      ...(options.alwaysAppendStyleSnippets !== undefined
        ? { alwaysAppendStyleSnippets: options.alwaysAppendStyleSnippets }
        : {}),
      ...(options.preferStyleRefOverSnippet !== undefined
        ? { preferStyleRefOverSnippet: options.preferStyleRefOverSnippet }
        : {}),
    },
  );
}

/**
 * Re-export of `capReferencePaths` under the previous name for the CLI's
 * existing call sites. The implementation lives in core now.
 */
export function capReferences(
  paths: string[],
  maxReferences: number | undefined,
): { references: string[]; capped?: number } {
  return capReferencePaths(paths, maxReferences);
}
