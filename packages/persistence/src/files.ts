import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Resolves the on-disk paths described in architecture.md §6. The default
 * data root is `~/.imagine/`. Override with `dataDir` for tests.
 */
export interface PathResolver {
  readonly dataDir: string;
  configFile(): string;
  /** Path to the user-editable JSON model catalog (`~/.imagine/catalog.json`). */
  catalogFile(): string;
  secretsFile(): string;
  dbFile(): string;
  logsDir(): string;
  jobLogsDir(): string;
  assetsDir(assetId?: string): string;
  galleryDir(date?: Date): string;
  galleryItemFile(itemId: string, ext: string, date?: Date): string;
  galleryItemThumb(itemId: string, date?: Date): string;
  cacheProviderResponses(): string;
  cacheVideoTemp(): string;
}

export function createPathResolver(dataDir?: string): PathResolver {
  const root = dataDir ?? path.join(os.homedir(), ".imagine");
  return {
    dataDir: root,
    configFile: () => path.join(root, "config.json"),
    catalogFile: () => path.join(root, "catalog.json"),
    secretsFile: () => path.join(root, "secrets.json"),
    dbFile: () => path.join(root, "studio.db"),
    logsDir: () => path.join(root, "logs"),
    jobLogsDir: () => path.join(root, "logs", "jobs"),
    assetsDir: (assetId) =>
      assetId ? path.join(root, "assets", assetId) : path.join(root, "assets"),
    galleryDir: (date) => {
      const d = date ?? new Date();
      const yyyy = String(d.getUTCFullYear());
      const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
      return path.join(root, "gallery", yyyy, mm);
    },
    galleryItemFile(itemId, ext, date) {
      const cleanExt = ext.startsWith(".") ? ext.slice(1) : ext;
      return path.join(this.galleryDir(date), `${itemId}.${cleanExt}`);
    },
    galleryItemThumb(itemId, date) {
      return path.join(this.galleryDir(date), `${itemId}.thumb.webp`);
    },
    cacheProviderResponses: () => path.join(root, "cache", "provider-responses"),
    cacheVideoTemp: () => path.join(root, "cache", "video-temp"),
  };
}

export async function ensureDataDir(resolver: PathResolver): Promise<void> {
  await fs.mkdir(resolver.dataDir, { recursive: true });
  await fs.mkdir(resolver.logsDir(), { recursive: true });
  await fs.mkdir(resolver.jobLogsDir(), { recursive: true });
  await fs.mkdir(resolver.assetsDir(), { recursive: true });
  await fs.mkdir(path.join(resolver.dataDir, "gallery"), { recursive: true });
  await fs.mkdir(resolver.cacheProviderResponses(), { recursive: true });
  await fs.mkdir(resolver.cacheVideoTemp(), { recursive: true });
}
