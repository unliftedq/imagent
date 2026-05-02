import path from "node:path";

import {
  type Asset,
  type AssetKind,
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
    ...(inputs.characters
      ? { character: resolveAssetSlugs(repo, "character", inputs.characters) }
      : {}),
    ...(inputs.objects
      ? { object: resolveAssetSlugs(repo, "object", inputs.objects) }
      : {}),
    ...(inputs.backgrounds
      ? { background: resolveAssetSlugs(repo, "background", inputs.backgrounds) }
      : {}),
    ...(inputs.styles
      ? { style: resolveAssetSlugs(repo, "style", inputs.styles) }
      : {}),
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

export function assetSlug(name: string): string {
  const slug = name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "asset";
}

export function describeAssetSlug(asset: Pick<Asset, "name">): string {
  return assetSlug(asset.name);
}

function resolveAssetSlugs(
  repo: AssetRepository,
  kind: AssetKind,
  slugs: string[],
): string[] {
  return slugs.map((slug) => resolveAssetSlug(repo, kind, slug));
}

function resolveAssetSlug(
  repo: AssetRepository,
  kind: AssetKind,
  slug: string,
): string {
  const matches = repo
    .list({ kind })
    .filter((asset) => assetSlug(asset.name) === slug);
  if (matches.length === 1) return matches[0]!.id;
  if (matches.length > 1) {
    const names = matches.map((asset) => `'${asset.name}'`).join(", ");
    throw new Error(
      `asset slug '${slug}' is ambiguous for kind=${kind}; matching assets: ${names}`,
    );
  }

  const byId = repo.get(slug);
  if (byId && byId.kind === kind) return byId.id;

  throw new Error(`asset slug '${slug}' not found (slot=${kind})`);
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
