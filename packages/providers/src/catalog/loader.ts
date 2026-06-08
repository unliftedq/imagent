import { promises as fs } from "node:fs";
import path from "node:path";
// Bundled default catalog. Imported via JSON ESM so it ships in the package
// `dist/` and is reachable from both desktop and CLI.
import bundledDefault from "../catalog.default.json" with { type: "json" };
import {
  type ModelCatalog,
  type ModelCatalogOverlay,
  ModelCatalogOverlaySchema,
  ModelCatalogSchema,
} from "./schema.js";

export interface CatalogLoaderOptions {
  /** Path to user catalog file. Default: `<dataDir>/catalog.json`. */
  path?: string;
  /** Override the bundled fallback (test seam). */
  bundled?: ModelCatalog;
  /**
   * Optional external catalog file to use as the bundled fallback. When set,
   * read from disk in preference to the JSON inlined at module-load time; on
   * read failure, falls back to the inlined copy with a warning. Primarily a
   * test seam — production callers should rely on the inlined bundle that
   * ships with the `@imagent/providers` package.
   */
  bundledPath?: string;
  logger?: { info(msg: string): void; warn(msg: string): void };
}

export interface CatalogSaveOptions {
  /** Path to user catalog file. Required for `saveCatalog`. */
  path: string;
}

/**
 * Validate the bundled JSON at module-load time. If the bundled file is
 * malformed (developer mistake), fail loudly — the cost of a soft fallback
 * is users running with stale capabilities.
 */
function validatedBundled(override?: ModelCatalog): ModelCatalog {
  if (override) return ModelCatalogSchema.parse(override);
  return ModelCatalogSchema.parse(bundledDefault);
}

async function loadBundled(opts: CatalogLoaderOptions): Promise<ModelCatalog> {
  if (!opts.bundledPath) {
    return validatedBundled(opts.bundled);
  }

  try {
    const raw = await fs.readFile(opts.bundledPath, "utf8");
    return ModelCatalogSchema.parse(JSON.parse(raw));
  } catch (err) {
    opts.logger?.warn(
      `[catalog] could not read bundled catalog asset ${opts.bundledPath}: ${String(err)} — using package default`,
    );
    return validatedBundled(opts.bundled);
  }
}

/**
 * Load the runtime catalog. v2 semantics: bundled defaults are authoritative
 * base data; the user catalog, when present, is an overlay for additions or
 * overrides. Missing user files are not created. On parse/merge failure
 * (corrupt JSON or schema mismatch), warn + fall back to bundled IN-MEMORY
 * without overwriting the user's broken file (so they can hand-fix it).
 *
 * Always returns a parsed `ModelCatalog`; never throws on missing/invalid
 * user files.
 */
export async function loadCatalog(opts: CatalogLoaderOptions = {}): Promise<ModelCatalog> {
  const bundled = await loadBundled(opts);
  const userPath = opts.path;
  const logger = opts.logger;

  if (!userPath) {
    return bundled;
  }

  let raw: string | null = null;
  try {
    raw = await fs.readFile(userPath, "utf8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT") {
      return bundled;
    }
    logger?.warn(`[catalog] could not read ${userPath}: ${String(err)} — using bundled in memory`);
    return bundled;
  }

  try {
    const parsed = JSON.parse(raw);
    const overlay = ModelCatalogOverlaySchema.parse(parsed);
    return mergeCatalogs(bundled, overlay);
  } catch (err) {
    logger?.warn(
      `[catalog] invalid JSON, schema, or merged catalog at ${userPath}: ${String(err)} — using bundled in memory; user file preserved`,
    );
    return bundled;
  }
}

/**
 * Write the catalog atomically: write to a sibling tempfile then rename.
 * Avoids the renderer / CLI ever observing a half-written file.
 */
export async function saveCatalog(catalog: ModelCatalog, opts: CatalogSaveOptions): Promise<void> {
  // Validate before persisting — better to fail loud than write garbage.
  const validated = ModelCatalogSchema.parse(catalog);
  await fs.mkdir(path.dirname(opts.path), { recursive: true });
  await writeAtomic(opts.path, JSON.stringify(validated, null, 2));
}

/** Sync-write to a tempfile in the same directory then rename atomically. */
async function writeAtomic(target: string, contents: string): Promise<void> {
  const dir = path.dirname(target);
  const base = path.basename(target);
  const tmp = path.join(dir, `.${base}.${process.pid}.${Date.now()}.tmp`);
  await fs.writeFile(tmp, contents, "utf8");
  await fs.rename(tmp, target);
}

/** Returns the bundled default in-memory (no I/O). Useful for tests. */
export function getBundledCatalog(override?: ModelCatalog): ModelCatalog {
  return validatedBundled(override);
}

function mergeCatalogs(base: ModelCatalog, overlay: ModelCatalogOverlay): ModelCatalog {
  const merged = deepClone(base);

  if (overlay.comments !== undefined) {
    merged.comments = overlay.comments;
  }

  for (const [id, model] of Object.entries(overlay.models?.image ?? {})) {
    merged.models.image[id] = mergeRecord(merged.models.image[id], model);
  }
  for (const [id, model] of Object.entries(overlay.models?.video ?? {})) {
    merged.models.video[id] = mergeRecord(merged.models.video[id], model);
  }
  for (const [id, model] of Object.entries(overlay.models?.speech ?? {})) {
    merged.models.speech[id] = mergeRecord(merged.models.speech[id], model);
  }

  for (const [providerId, providerOverlay] of Object.entries(overlay.providers ?? {})) {
    const current = merged.providers[providerId] ?? {};
    merged.providers[providerId] = {
      ...current,
      ...providerOverlay,
      image:
        providerOverlay.image === undefined
          ? current.image
          : mergeOfferings(current.image, providerOverlay.image),
      video:
        providerOverlay.video === undefined
          ? current.video
          : mergeOfferings(current.video, providerOverlay.video),
      speech:
        providerOverlay.speech === undefined
          ? current.speech
          : mergeOfferings(current.speech, providerOverlay.speech),
      modelOverrides:
        providerOverlay.modelOverrides === undefined
          ? current.modelOverrides
          : mergeRecordsByKey(current.modelOverrides, providerOverlay.modelOverrides),
    };
  }

  return ModelCatalogSchema.parse(merged);
}

function mergeOfferings<T extends { id: string }>(base: T[] | undefined, overlay: T[]): T[] {
  const byId = new Map<string, T>();
  for (const offering of base ?? []) {
    byId.set(offering.id, deepClone(offering));
  }
  for (const offering of overlay) {
    byId.set(offering.id, mergeRecord(byId.get(offering.id), offering));
  }
  return [...byId.values()];
}

function mergeRecordsByKey<T extends object>(
  base: Record<string, T> | undefined,
  overlay: Record<string, T>,
): Record<string, T> {
  const merged: Record<string, T> = {};
  for (const [id, record] of Object.entries(base ?? {})) {
    merged[id] = deepClone(record);
  }
  for (const [id, record] of Object.entries(overlay)) {
    merged[id] = mergeRecord(merged[id], record);
  }
  return merged;
}

function mergeRecord<T extends object>(base: T | undefined, overlay: object): T {
  return deepMerge(
    base ? (deepClone(base) as Record<string, unknown>) : {},
    overlay as Record<string, unknown>,
  ) as T;
}

function deepMerge(
  base: Record<string, unknown>,
  overlay: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    const current = next[key];
    if (isPlainObject(current) && isPlainObject(value)) {
      next[key] = deepMerge(current, value);
    } else {
      next[key] = value;
    }
  }
  return next;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
