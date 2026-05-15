import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database, { type Database as DatabaseType } from "better-sqlite3";
import { registerFtsFunctions } from "./fts.js";

/**
 * Migration descriptor. Each migration runs in a single transaction and bumps
 * `PRAGMA user_version` on success. The runner is forward-only — there are no
 * `down` scripts at this point in the project's life.
 */
export interface Migration {
  readonly version: number;
  readonly name: string;
  readonly sql: string;
}

/** Default migrations baked into the package. */
export const BUILTIN_MIGRATIONS: readonly Migration[] = loadBuiltinMigrations();

export interface OpenDbOptions {
  /** Override the migration list (useful for tests). */
  migrations?: readonly Migration[];
  /** If false, skip migrate() on open. Defaults to true. */
  migrate?: boolean;
}

/**
 * Open a better-sqlite3 handle pointing at the given path, applying WAL,
 * busy_timeout, and (by default) running pending migrations. Synchronous —
 * matches the rest of the better-sqlite3 surface.
 */
export function openDatabase(filePath: string, options: OpenDbOptions = {}): DatabaseType {
  const db = new Database(filePath);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  db.pragma("foreign_keys = ON");
  registerFtsFunctions(db);
  if (options.migrate !== false) {
    migrate(db, options.migrations ?? BUILTIN_MIGRATIONS);
  }
  return db;
}

/**
 * Run pending migrations in order. Each migration bumps user_version inside
 * the same transaction so a partial apply never leaves the DB in a half-state.
 */
export function migrate(db: DatabaseType, migrations: readonly Migration[]): void {
  const current = (db.pragma("user_version", { simple: true }) as number) ?? 0;
  const pending = migrations.filter((m) => m.version > current).sort((a, b) => a.version - b.version);
  for (const m of pending) {
    db.transaction(() => {
      db.exec(m.sql);
      db.pragma(`user_version = ${m.version}`);
    })();
  }
}

/** Returns the highest migration version currently applied. */
export function currentVersion(db: DatabaseType): number {
  return (db.pragma("user_version", { simple: true }) as number) ?? 0;
}

/** Counts FTS5 virtual tables present — used by the doctor command. */
export function countFtsTables(db: DatabaseType): number {
  const row = db
    .prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name LIKE '%_fts'")
    .get() as { n: number };
  return row.n;
}

function loadBuiltinMigrations(): readonly Migration[] {
  // Node SEA path: when bundled into the `imagent` binary, migrations are
  // embedded as SEA assets via apps/cli/sea-config.json. We probe with a
  // lazy require so that *non-SEA* hosts (Bun, normal Node, Electron) don't
  // trip the experimental warning.
  const seaInit = readSeaAsset("001_init.sql");
  const seaFts = readSeaAsset("002_fts.sql");
  const seaJiebaFts = readSeaAsset("003_jieba_fts.sql");
  if (seaInit && seaFts && seaJiebaFts) {
    return [
      { version: 1, name: "001_init", sql: seaInit },
      { version: 2, name: "002_fts", sql: seaFts },
      { version: 3, name: "003_jieba_fts", sql: seaJiebaFts },
    ];
  }

  // CJS-bundled fallback: when esbuild bundles this for the CLI binary,
  // `import.meta.url` is replaced with `{}.url` (undefined). Skip the
  // filesystem probe in that case rather than crashing on fileURLToPath.
  const metaUrl =
    typeof import.meta?.url === "string" && import.meta.url
      ? import.meta.url
      : null;
  if (!metaUrl) return [];

  const here = path.dirname(fileURLToPath(metaUrl));
  // When loaded from src (bun --bun) `here` is .../packages/persistence/src;
  // when loaded from dist it's .../packages/persistence/dist. The migrations
  // directory lives next to the source file in both layouts because tsc
  // doesn't copy SQL — so we look up to one level for `migrations/`.
  const candidates = [
    path.join(here, "migrations"),
    path.join(here, "..", "src", "migrations"),
  ];
  let dir: string | undefined;
  for (const c of candidates) {
    if (existsSync(c)) {
      dir = c;
      break;
    }
  }
  if (!dir) return [];
  const init = readFileSync(path.join(dir, "001_init.sql"), "utf8");
  const fts = readFileSync(path.join(dir, "002_fts.sql"), "utf8");
  const jiebaFts = readFileSync(path.join(dir, "003_jieba_fts.sql"), "utf8");
  return [
    { version: 1, name: "001_init", sql: init },
    { version: 2, name: "002_fts", sql: fts },
    { version: 3, name: "003_jieba_fts", sql: jiebaFts },
  ];
}

/**
 * Best-effort load of a Node SEA asset. Returns `null` outside of SEA mode
 * (which is the common path: Bun, normal Node host, Electron all skip this).
 *
 * Uses `createRequire` because `node:sea` is only available in Node 20+ and
 * doesn't exist under Bun — a static `import "node:sea"` would crash the
 * persistence package on Bun-driven test runs.
 */
function readSeaAsset(name: string): string | null {
  try {
    // `import.meta.url` is undefined when this file is bundled into the CLI's
    // CJS bundle (Node SEA), so anchor createRequire on a known-good location
    // — `process.execPath` works everywhere SEA is supported (Node 20+).
    const base = typeof import.meta?.url === "string" && import.meta.url
      ? import.meta.url
      : process.execPath;
    const req = createRequire(base);
    const sea = req("node:sea") as {
      isSea?: () => boolean;
      getAsset?: (name: string, encoding: string) => string;
    };
    if (!sea?.isSea?.()) return null;
    return sea.getAsset?.(name, "utf8") ?? null;
  } catch {
    return null;
  }
}

export type { DatabaseType };
