import path from "node:path";

import type { AssetKind } from "@imagine-studio/core";
import {
  AssetRepository,
  type DatabaseType,
  type PathResolver,
} from "@imagine-studio/persistence";

export interface AssetSlotInputs {
  characters?: string[];
  objects?: string[];
  backgrounds?: string[];
  styles?: string[];
}

export interface AssetSlotResult {
  /** Absolute paths of reference images contributed by all slot assets. */
  referencePaths: string[];
  /** Prompt-snippet text from style assets that lacked refs (to be appended). */
  stylePromptSnippets: string[];
  /** All asset ids that contributed to this generation. */
  assetIds: string[];
  /** Final attachments to record on the gallery item. */
  attachments: Array<{ assetId: string; role: AssetKind }>;
}

interface AssetSlotsOptions {
  /**
   * If true, style assets always contribute their prompt snippet (even when
   * they also have ref images and refs were used). Default false to match
   * architecture.md §7's "prefer ref-image, fall back to prompt" semantics.
   */
  alwaysAppendStyleSnippets?: boolean;
  /**
   * If a style asset has refs AND a prompt snippet, AND the model supports
   * refs, set this true to drop the snippet. Defaults to true.
   */
  preferStyleRefOverSnippet?: boolean;
}

/**
 * Resolve asset slots into reference paths + prompt-snippet appendices.
 *
 * Style assets:
 *   - if the asset has refs and the model supports refs (caller decides
 *     before calling capReferences): the ref is used. Snippet is only
 *     appended if the asset has no refs OR the asset has both AND
 *     `alwaysAppendStyleSnippets` is true.
 *   - if the asset has only a prompt snippet: append it regardless.
 */
export async function buildAssetSlots(
  resolver: PathResolver,
  db: DatabaseType,
  inputs: AssetSlotInputs,
  options: AssetSlotsOptions = {},
): Promise<AssetSlotResult> {
  const repo = new AssetRepository(db);
  const referencePaths: string[] = [];
  const stylePromptSnippets: string[] = [];
  const assetIds: string[] = [];
  const attachments: Array<{ assetId: string; role: AssetKind }> = [];

  const handle = (assetIds_: string[] | undefined, role: AssetKind): void => {
    for (const id of assetIds_ ?? []) {
      const asset = repo.get(id);
      if (!asset) {
        throw new Error(`asset '${id}' not found (--${role})`);
      }
      if (asset.kind !== role) {
        throw new Error(
          `asset '${id}' is kind=${asset.kind}, expected ${role}. Use --${asset.kind} <id> instead.`,
        );
      }
      const refs = asset.files.filter((f) => f.role === "reference");
      let usedRef = false;
      for (const f of refs) {
        const abs = path.isAbsolute(f.relPath)
          ? f.relPath
          : path.join(resolver.dataDir, f.relPath);
        referencePaths.push(abs);
        usedRef = true;
      }
      if (role === "style") {
        if (!usedRef && asset.promptSnippet) {
          // Snippet-only style: always append.
          stylePromptSnippets.push(asset.promptSnippet);
        } else if (
          usedRef &&
          asset.promptSnippet &&
          options.alwaysAppendStyleSnippets &&
          options.preferStyleRefOverSnippet !== true
        ) {
          stylePromptSnippets.push(asset.promptSnippet);
        }
      }
      assetIds.push(id);
      attachments.push({ assetId: id, role });
    }
  };

  handle(inputs.characters, "character");
  handle(inputs.objects, "object");
  handle(inputs.backgrounds, "background");
  handle(inputs.styles, "style");

  return { referencePaths, stylePromptSnippets, assetIds, attachments };
}

/**
 * Apply the resolved model's `maxReferences` cap to the user-supplied list.
 * Returns the truncated list and the final cap used (if a truncation
 * occurred, returns the cap; else undefined).
 */
export function capReferences(
  paths: string[],
  maxReferences: number | undefined,
): { references: string[]; capped?: number } {
  if (maxReferences === undefined) {
    return { references: paths };
  }
  if (paths.length <= maxReferences) {
    return { references: paths };
  }
  return { references: paths.slice(0, maxReferences), capped: maxReferences };
}
