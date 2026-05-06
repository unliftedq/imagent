import type { Asset, AssetKind } from "../domain/asset.js";
import type { ImageReference } from "../domain/request.js";

/**
 * Asset slots, keyed by kind. Each value is an array of asset ids the user
 * picked for that slot. The shape mirrors the CLI flags
 * (`--character`, `--object`, …) and the renderer's `AssetPicker` per-kind
 * selection.
 */
export interface AssetSlotInputs {
  character?: string[];
  object?: string[];
  background?: string[];
  style?: string[];
}

/**
 * Result of resolving slots into reference paths + style snippets + the set
 * of assets that contributed (for `gallery_item_assets`).
 */
export interface AssetSlotResolution {
  /** Absolute paths of reference images contributed by the slots, in slot order. */
  referencePaths: string[];
  /** Reference images contributed by the slots, with roles preserved in slot order. */
  references: Array<ImageReference & { role: AssetKind }>;
  /** Style asset prompt snippets that should be appended to `request.prompt`. */
  stylePromptSnippets: string[];
  /** All asset ids that contributed to this generation (one per asset). */
  assetIds: string[];
  /** `gallery_item_assets` rows — one per contributing asset. */
  attachments: Array<{ assetId: string; role: AssetKind }>;
}

export interface AssetSlotResolveOptions {
  /**
   * Whether the resolved model supports reference images. When false, style
   * assets always fall back to their `promptSnippet` (if present); other
   * kinds still record an attachment but contribute zero references.
   */
  supportsReferences?: boolean;
  /**
   * If a style asset has BOTH refs AND a snippet, AND the model supports
   * refs, drop the snippet (architecture.md §7 prefer-ref semantics).
   * Defaults to true.
   */
  preferStyleRefOverSnippet?: boolean;
  /**
   * If true, style assets always contribute their snippet (even when refs
   * are also used). Defaults to false.
   */
  alwaysAppendStyleSnippets?: boolean;
}

/**
 * Resolves an absolute path for an asset_file relative path. Provided by the
 * caller (CLI uses path resolver dataDir; IPC handler uses paths.dataDir).
 */
export type AssetFileAbsResolver = (relPath: string) => string;

/**
 * Reads an asset by id. Returns null when the asset is missing — caller
 * decides whether that's an error (CLI throws; IPC could surface a 404).
 */
export type AssetLookup = (id: string) => Asset | null | undefined;

/**
 * Pure function: resolve user-supplied asset slot ids into reference paths,
 * style snippets, and the attachment list for `gallery_item_assets`.
 *
 * Iteration order is fixed to match architecture.md §7's deterministic cap
 * behaviour: character → object → background → style.
 *
 * Style asset semantics (architecture.md §7):
 *   - if the asset has refs AND model supports refs → use the refs.
 *   - if the asset has only a snippet → append the snippet.
 *   - if the asset has refs AND a snippet AND
 *     `alwaysAppendStyleSnippets`=true AND `preferStyleRefOverSnippet`!=true,
 *     append the snippet too.
 *   - if the asset has refs but the model does NOT support refs → fall back
 *     to the snippet (if present), record the attachment but contribute no
 *     reference paths.
 */
export function resolveAssetSlots(
  inputs: AssetSlotInputs,
  lookup: AssetLookup,
  resolveAbs: AssetFileAbsResolver,
  options: AssetSlotResolveOptions = {},
): AssetSlotResolution {
  const referencePaths: string[] = [];
  const references: Array<ImageReference & { role: AssetKind }> = [];
  const stylePromptSnippets: string[] = [];
  const assetIds: string[] = [];
  const attachments: Array<{ assetId: string; role: AssetKind }> = [];

  const supportsRefs = options.supportsReferences !== false; // default true
  const preferRefOverSnippet = options.preferStyleRefOverSnippet !== false;
  const alwaysAppendSnippets = options.alwaysAppendStyleSnippets === true;

  const handle = (ids: string[] | undefined, role: AssetKind): void => {
    for (const id of ids ?? []) {
      const asset = lookup(id);
      if (!asset) {
        throw new Error(`asset '${id}' not found (slot=${role})`);
      }
      if (asset.kind !== role) {
        throw new Error(`asset '${id}' is kind=${asset.kind}, expected ${role}`);
      }
      const refs = (asset.files ?? []).filter((f) => f.role === "reference").slice(0, 1);

      let usedRefHere = false;
      if (supportsRefs) {
        for (const f of refs) {
          const refPath = resolveAbs(f.relPath);
          referencePaths.push(refPath);
          references.push({ path: refPath, role });
          usedRefHere = true;
        }
      }

      if (role === "style") {
        const snippet = asset.promptSnippet ?? null;
        if (snippet) {
          if (!usedRefHere) {
            // No refs used (either none on the asset, or model doesn't support
            // refs) — always append the snippet.
            stylePromptSnippets.push(snippet);
          } else if (alwaysAppendSnippets && !preferRefOverSnippet) {
            stylePromptSnippets.push(snippet);
          }
        }
      }

      assetIds.push(id);
      attachments.push({ assetId: id, role });
    }
  };

  // Order: character → object → background → style. Cap-at-max truncation
  // (downstream) keeps this order stable.
  handle(inputs.character, "character");
  handle(inputs.object, "object");
  handle(inputs.background, "background");
  handle(inputs.style, "style");

  return { referencePaths, references, stylePromptSnippets, assetIds, attachments };
}

/**
 * Apply the resolved model's `maxReferences` cap to a list of reference
 * paths. Truncation is deterministic (slice from the end). Returns the
 * truncated list and the cap value used (when truncation occurred).
 */
export function capReferencePaths(
  paths: readonly string[],
  maxReferences: number | undefined,
): { references: string[]; capped?: number } {
  if (maxReferences === undefined) {
    return { references: [...paths] };
  }
  if (paths.length <= maxReferences) {
    return { references: [...paths] };
  }
  return { references: paths.slice(0, maxReferences), capped: maxReferences };
}

/**
 * Apply the resolved model's `maxReferences` cap while preserving each
 * reference's role/path pairing. Truncation is deterministic (slice from the
 * beginning), matching `capReferencePaths`.
 */
export function capImageReferences(
  references: readonly ImageReference[],
  maxReferences: number | undefined,
): { references: ImageReference[]; capped?: number } {
  if (maxReferences === undefined) {
    return { references: [...references] };
  }
  if (references.length <= maxReferences) {
    return { references: [...references] };
  }
  return { references: references.slice(0, maxReferences), capped: maxReferences };
}

/**
 * Concatenate the original prompt with collected style snippets. Separator
 * is `, ` per architecture.md §7's expected style-snippet append behaviour.
 */
export function appendStylePromptSnippets(prompt: string, snippets: readonly string[]): string {
  if (snippets.length === 0) return prompt;
  const tail = snippets.join(", ");
  if (!prompt.trim()) return tail;
  return `${prompt}, ${tail}`;
}
