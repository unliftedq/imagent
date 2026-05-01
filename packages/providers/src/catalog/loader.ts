import { promises as fs } from "node:fs";
import path from "node:path";
import { ModelCatalogSchema, type ModelCatalog } from "./schema.js";
// Bundled default catalog. Imported via JSON ESM so it ships in the package
// `dist/` and is reachable from both desktop and CLI.
import bundledDefault from "../catalog.default.json" with { type: "json" };

export interface CatalogLoaderOptions {
  /** Path to user catalog file. Default: `<dataDir>/catalog.json`. */
  path?: string;
  /** Override the bundled fallback (test seam). */
  bundled?: ModelCatalog;
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

/**
 * Load the runtime catalog. v2 semantics: USER FILE IS AUTHORITATIVE — no
 * merge with bundled. On first run (file missing), the bundled default is
 * written to the user path and returned. On parse failure (corrupt JSON or
 * schema mismatch), warn + fall back to bundled IN-MEMORY without
 * overwriting the user's broken file (so they can hand-fix it).
 *
 * Always returns a parsed `ModelCatalog`; never throws on missing/invalid
 * user files.
 */
export async function loadCatalog(opts: CatalogLoaderOptions = {}): Promise<ModelCatalog> {
  const bundled = validatedBundled(opts.bundled);
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
      // First run — seed the user path with the bundled default.
      try {
        await fs.mkdir(path.dirname(userPath), { recursive: true });
        await writeAtomic(userPath, JSON.stringify(bundled, null, 2));
        logger?.info(`[catalog] seeded default to ${userPath}`);
      } catch (writeErr) {
        logger?.warn(`[catalog] failed to seed default to ${userPath}: ${String(writeErr)}`);
      }
      return bundled;
    }
    logger?.warn(`[catalog] could not read ${userPath}: ${String(err)} — using bundled in memory`);
    return bundled;
  }

  try {
    const parsed = JSON.parse(raw);
    return ModelCatalogSchema.parse(parsed);
  } catch (err) {
    logger?.warn(
      `[catalog] invalid JSON or schema at ${userPath}: ${String(err)} — using bundled in memory; user file preserved`,
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
