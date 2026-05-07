import { promises as fs } from "node:fs";
import path from "node:path";
import type { ConfigFile, ConfigStore, SecretsStore } from "@imagent/config";
import { JobRunner, type Logger } from "@imagent/core";
import {
  BoardRepository,
  type DatabaseType,
  GalleryRepository,
  JobRepository,
  type PathResolver,
  videoThumbnailService,
} from "@imagent/persistence";
import {
  createImageRegistry,
  createVideoRegistry,
  type ImageRegistry,
  loadCatalog,
  type ModelCatalog,
  migrateLegacySecretsRouting,
  migrateProviderRouting,
  saveCatalog,
  type VideoRegistry,
} from "@imagent/providers";

/**
 * Bootstrap state mutated as config changes. The desktop main process holds
 * exactly one of these for its lifetime; rebuilds on `config.changed`.
 */
export interface RuntimeServices {
  imageRegistry: ImageRegistry;
  videoRegistry: VideoRegistry;
  jobRunner: JobRunner;
  /** Current resolved catalog snapshot. Refreshed on `refresh()`. */
  catalog: ModelCatalog;
  /** Absolute path to the on-disk runtime catalog file. */
  catalogPath: string;
  refresh(): Promise<void>;
  /**
   * Drain queued + running jobs from a previous session. Called *after*
   * the main window finishes its first paint so cold-start isn't blocked
   * by provider polling. (M8 cold-start optimisation.)
   */
  resumeRunningJobs(): Promise<void>;
}

export interface BootstrapDeps {
  db: DatabaseType;
  configStore: ConfigStore;
  secretsStore: SecretsStore;
  paths: PathResolver;
  logger: Logger;
}

/**
 * Build registries + JobRunner from the current configStore + secretsStore
 * snapshot. Calling `refresh()` re-reads both and swaps the registries on
 * the JobRunner under the hood (the runner's deps are mutable references).
 *
 * Image generation IPC routes shipped in M5; video routes shipped in M7.
 * `resumeRunningJobs()` runs immediately after construction so any leftover
 * Seedance jobs from a prior session keep polling.
 */
export async function bootstrapRuntime(deps: BootstrapDeps): Promise<RuntimeServices> {
  const { db, configStore, secretsStore, paths, logger } = deps;

  const galleryRepo = new GalleryRepository(db);
  const jobsRepo = new JobRepository(db);
  const boardsRepo = new BoardRepository(db);

  // Files port — JobRunner only needs galleryDir/galleryItemFile/dataDir.
  const filesPort = {
    galleryDir: (date?: Date) => paths.galleryDir(date),
    galleryItemFile: (id: string, ext: string, date?: Date) => paths.galleryItemFile(id, ext, date),
    dataDir: paths.dataDir,
  };

  // Live registries — mutable Maps shared with the JobRunner so a config
  // refresh can replace entries without re-instantiating the runner.
  const imageRegistry = new Map() as Map<string, never>;
  const videoRegistry = new Map() as Map<string, never>;

  // Load the JSON model catalog once. On `refresh()` we re-read from disk so
  // hand-edits to ~/.imagent/catalog.json take effect on the next IPC tick.
  const catalogPath = paths.catalogFile();
  let catalog = await loadCatalog({ path: catalogPath, logger });

  const repopulate = async (): Promise<void> => {
    catalog = await loadCatalog({ path: catalogPath, logger });
    let config = await configStore.loadConfig();
    config = await migrateLegacySecretsRoutingFromDisk(config, deps);

    // Idempotent migration: pull per-user provider routing (Azure
    // deployments, custom OpenAI providers) out of the catalog and into
    // config.providers. After it runs once, the user catalog has no Azure
    // offerings and re-runs are no-ops.
    const migration = migrateProviderRouting(catalog, config);
    let preferences = config.providers;
    if (migration.migrated) {
      catalog = migration.catalog;
      const saved = await configStore.saveConfig(migration.config);
      preferences = saved.providers;
      await saveCatalog(catalog, { path: catalogPath });
      logger.info("[runtime] migrated provider routing → config", {
        moved: migration.movedByProvider,
      });
    }

    const secrets = await secretsStore.loadSecrets();
    const nextImage = createImageRegistry(secrets, preferences, catalog);
    const nextVideo = createVideoRegistry(secrets, preferences, catalog);
    imageRegistry.clear();
    for (const [k, v] of nextImage) {
      (imageRegistry as Map<string, unknown>).set(k, v);
    }
    videoRegistry.clear();
    for (const [k, v] of nextVideo) {
      (videoRegistry as Map<string, unknown>).set(k, v);
    }
  };
  await repopulate();

  const runner = new JobRunner({
    jobs: jobsRepo,
    gallery: galleryRepo,
    boards: boardsRepo,
    files: filesPort,
    imageRegistry: imageRegistry as unknown as ImageRegistry,
    videoRegistry: videoRegistry as unknown as VideoRegistry,
    thumbnailService: videoThumbnailService,
    logger,
  });

  // M8: defer resume to after the first window paints. Resume can run
  // synchronous DB scans + provider calls; deferring shaves ~100ms off
  // cold-start. The scheduling caller (main.ts) drains resumeRunningJobs
  // once `mainWindow.show()` has fired its `did-finish-load`.
  const deferredResume = async (): Promise<void> => {
    try {
      await runner.resumeRunningJobs();
    } catch (err) {
      logger.warn("resumeRunningJobs failed", { err: String(err) });
    }
  };

  return {
    imageRegistry: imageRegistry as unknown as ImageRegistry,
    videoRegistry: videoRegistry as unknown as VideoRegistry,
    jobRunner: runner,
    // Read-through getter so callers see the latest catalog after refresh().
    get catalog() {
      return catalog;
    },
    catalogPath,
    async refresh() {
      await repopulate();
      logger.info("[runtime] registries refreshed", {
        image: [...imageRegistry.keys()],
        video: [...videoRegistry.keys()],
      });
    },
    resumeRunningJobs: deferredResume,
  } satisfies RuntimeServices;
}

async function migrateLegacySecretsRoutingFromDisk(
  config: ConfigFile,
  deps: BootstrapDeps,
): Promise<ConfigFile> {
  const secretsPath = deps.paths.secretsFile();
  let raw: string;
  try {
    raw = await fs.readFile(secretsPath, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return config;
    throw err;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`secrets.json at ${secretsPath} is not valid JSON: ${(err as Error).message}`);
  }

  const migration = migrateLegacySecretsRouting(parsed, config);
  if (!migration.migrated) return config;

  const savedConfig = await deps.configStore.saveConfig(migration.config);
  await writeCleanSecretsFile(secretsPath, migration.secrets, deps.logger);
  deps.logger.info("[runtime] migrated legacy secrets routing → config");
  return savedConfig;
}

async function writeCleanSecretsFile(
  filePath: string,
  secrets: Awaited<ReturnType<SecretsStore["loadSecrets"]>>,
  logger: Logger,
): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(secrets, null, 2), "utf8");
  try {
    await fs.chmod(filePath, 0o600);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "EPERM" && code !== "ENOSYS" && code !== "ENOTSUP") {
      throw err;
    }
    logger.warn("[runtime] could not chmod migrated secrets.json", { path: filePath, code });
  }
}
