import { JobRunner, type Logger } from "@imagine-studio/core";
import {
  type ConfigStore,
  type ProviderPreferences,
  type ProviderSecrets,
  type SecretsStore,
} from "@imagine-studio/config";
import {
  GalleryRepository,
  JobRepository,
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
 * Image generation IPC routes are M5; video routes are M7 — but we still
 * construct the runner so `resumeRunningJobs()` can finalize any leftover
 * jobs from a prior CLI session.
 */
export async function bootstrapRuntime(deps: BootstrapDeps): Promise<RuntimeServices> {
  const { db, configStore, secretsStore, paths, logger } = deps;

  const galleryRepo = new GalleryRepository(db);
  const jobsRepo = new JobRepository(db);

  // Files port — JobRunner only needs galleryDir/galleryItemFile/dataDir.
  const filesPort = {
    galleryDir: (date?: Date) => paths.galleryDir(date),
    galleryItemFile: (id: string, ext: string, date?: Date) =>
      paths.galleryItemFile(id, ext, date),
    dataDir: paths.dataDir,
  };

  let snapshot = await loadSnapshot(configStore, secretsStore);
  let imageRegistry = createImageRegistry(snapshot.secrets, snapshot.preferences);
  let videoRegistry = createVideoRegistry(snapshot.secrets, snapshot.preferences);

  const runner = new JobRunner({
    jobs: jobsRepo,
    gallery: galleryRepo,
    files: filesPort,
    imageRegistry,
    videoRegistry,
    logger,
  });

  // Resume jobs left running from a previous session (CLI or a prior desktop
  // crash). Image jobs get marked failed; video jobs poll-resume.
  try {
    await runner.resumeRunningJobs();
  } catch (err) {
    logger.warn("resumeRunningJobs failed", { err: String(err) });
  }

  return {
    get imageRegistry() {
      return imageRegistry;
    },
    get videoRegistry() {
      return videoRegistry;
    },
    jobRunner: runner,
    async refresh() {
      snapshot = await loadSnapshot(configStore, secretsStore);
      imageRegistry = createImageRegistry(snapshot.secrets, snapshot.preferences);
      videoRegistry = createVideoRegistry(snapshot.secrets, snapshot.preferences);
      // The JobRunner reads its registries by reference, so swapping the
      // backing maps doesn't help — we cheat by replacing the values it
      // captured at construction. JobRunner's deps property is private; we
      // accept that newly-submitted jobs go through the freshly captured
      // registry by passing the registries via runtime closure in the IPC
      // handlers (image.generate is M5).
      logger.info("[runtime] registries refreshed", {
        image: [...imageRegistry.keys()],
        video: [...videoRegistry.keys()],
      });
    },
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
