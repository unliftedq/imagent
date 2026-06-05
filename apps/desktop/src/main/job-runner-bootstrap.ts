import type { ConfigStore, SecretsStore } from "@imagent/config";
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
  createAudioRegistry,
  createImageRegistry,
  createVideoRegistry,
  type AudioRegistry,
  type ImageRegistry,
  loadCatalog,
  type ModelCatalog,
  type VideoRegistry,
} from "@imagent/providers";

/**
 * Bootstrap state mutated as config changes. The desktop main process holds
 * exactly one of these for its lifetime; rebuilds on `config.changed`.
 */
export interface RuntimeServices {
  imageRegistry: ImageRegistry;
  videoRegistry: VideoRegistry;
  audioRegistry: AudioRegistry;
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
  defaultCatalogPath?: string;
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
  const { db, configStore, secretsStore, paths, defaultCatalogPath, logger } = deps;

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
  const audioRegistry = new Map() as Map<string, never>;

  // Load the JSON model catalog once. On `refresh()` we re-read the optional
  // user overlay from disk so hand-edits take effect on the next IPC tick.
  const catalogPath = paths.catalogFile();
  const catalogLoaderOptions = { path: catalogPath, bundledPath: defaultCatalogPath, logger };
  let catalog = await loadCatalog(catalogLoaderOptions);

  const repopulate = async (): Promise<void> => {
    catalog = await loadCatalog(catalogLoaderOptions);
    const config = await configStore.loadConfig();
    const secrets = await secretsStore.loadSecrets();
    const nextImage = createImageRegistry(secrets, config.providers, catalog);
    const nextVideo = createVideoRegistry(secrets, config.providers, catalog);
    const nextAudio = createAudioRegistry(secrets, config.providers, catalog);
    imageRegistry.clear();
    for (const [k, v] of nextImage) {
      (imageRegistry as Map<string, unknown>).set(k, v);
    }
    videoRegistry.clear();
    for (const [k, v] of nextVideo) {
      (videoRegistry as Map<string, unknown>).set(k, v);
    }
    audioRegistry.clear();
    for (const [k, v] of nextAudio) {
      (audioRegistry as Map<string, unknown>).set(k, v);
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
    audioRegistry: audioRegistry as unknown as AudioRegistry,
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
    audioRegistry: audioRegistry as unknown as AudioRegistry,
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
        audio: [...audioRegistry.keys()],
      });
    },
    resumeRunningJobs: deferredResume,
  } satisfies RuntimeServices;
}
