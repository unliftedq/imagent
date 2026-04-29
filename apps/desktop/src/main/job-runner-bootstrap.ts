import { JobRunner, type Logger } from "@imagine-studio/core";
import {
  type ConfigStore,
  type ProviderPreferences,
  type ProviderSecrets,
  type SecretsStore,
} from "@imagine-studio/config";
import {
  BoardRepository,
  GalleryRepository,
  JobRepository,
  videoThumbnailService,
  type DatabaseType,
  type PathResolver,
} from "@imagine-studio/persistence";
import {
  createImageRegistry,
  createVideoRegistry,
  type ImageRegistry,
  type VideoRegistry,
} from "@imagine-studio/providers";

/**
 * Bootstrap state mutated as config changes. The desktop main process holds
 * exactly one of these for its lifetime; rebuilds on `config.changed`.
 */
export interface RuntimeServices {
  imageRegistry: ImageRegistry;
  videoRegistry: VideoRegistry;
  jobRunner: JobRunner;
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
    galleryItemFile: (id: string, ext: string, date?: Date) =>
      paths.galleryItemFile(id, ext, date),
    dataDir: paths.dataDir,
  };

  // Live registries — mutable Maps shared with the JobRunner so a config
  // refresh can replace entries without re-instantiating the runner.
  const imageRegistry = new Map() as Map<string, never>;
  const videoRegistry = new Map() as Map<string, never>;

  const repopulate = async (): Promise<void> => {
    const snap = await loadSnapshot(configStore, secretsStore);
    const nextImage = createImageRegistry(snap.secrets, snap.preferences);
    const nextVideo = createVideoRegistry(snap.secrets, snap.preferences);
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

async function loadSnapshot(
  configStore: ConfigStore,
  secretsStore: SecretsStore,
): Promise<{ preferences: ProviderPreferences; secrets: ProviderSecrets }> {
  const config = await configStore.loadConfig();
  const secrets = await secretsStore.loadSecrets();
  return { preferences: config.providers, secrets };
}
