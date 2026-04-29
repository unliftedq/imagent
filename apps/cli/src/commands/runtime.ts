import {
  type ConfigFile,
  createEnvSecretsStore,
  createFileConfigStore,
  createFileSecretsStore,
  mergeSecrets,
  type ProviderSecrets,
} from "@imagine/config";
import {
  type FilesServicePort,
  type GalleryRepositoryPort,
  type ImageRegistry,
  type JobRepositoryPort,
  JobRunner,
  type Logger,
  type VideoRegistry,
  createConsoleLogger,
} from "@imagine/core";
import {
  type DatabaseType,
  GalleryRepository,
  JobRepository,
  type PathResolver,
  createPathResolver,
  ensureDataDir,
  openDatabase,
} from "@imagine/persistence";
import { createImageRegistry, createVideoRegistry } from "@imagine/providers";

export interface CliRuntime {
  resolver: PathResolver;
  config: ConfigFile;
  secrets: ProviderSecrets;
  imageRegistry: ImageRegistry;
  videoRegistry: VideoRegistry;
}

/**
 * Resolve the on-disk paths, load config + merged secrets, instantiate the
 * registries. No DB handle here — callers open it themselves so they can
 * scope `db.close()` to their command.
 */
export async function loadCliRuntime(): Promise<CliRuntime> {
  const resolver = createPathResolver();
  await ensureDataDir(resolver);

  const config = await createFileConfigStore(resolver.configFile()).loadConfig();
  const fileSecrets = await createFileSecretsStore(resolver.secretsFile()).loadSecrets();
  const envSecrets = await createEnvSecretsStore(process.env).loadSecrets();
  const secrets = mergeSecrets(fileSecrets, envSecrets);

  const imageRegistry = createImageRegistry(secrets, config.providers);
  const videoRegistry = createVideoRegistry(secrets, config.providers);

  return { resolver, config, secrets, imageRegistry, videoRegistry };
}

export interface RunnerBundle {
  db: DatabaseType;
  jobs: JobRepository;
  gallery: GalleryRepository;
  files: FilesServicePort;
  runner: JobRunner;
}

/**
 * Open the DB and build a JobRunner with shared deps. Caller must close the
 * returned `db` handle when done.
 */
export function buildRunner(runtime: CliRuntime, logger?: Logger): RunnerBundle {
  const db = openDatabase(runtime.resolver.dbFile());
  const jobs = new JobRepository(db) satisfies JobRepositoryPort;
  const gallery = new GalleryRepository(db) satisfies GalleryRepositoryPort;
  const files: FilesServicePort = {
    dataDir: runtime.resolver.dataDir,
    galleryDir: (date) => runtime.resolver.galleryDir(date),
    galleryItemFile: (id, ext, date) => runtime.resolver.galleryItemFile(id, ext, date),
  };
  const runner = new JobRunner({
    jobs,
    gallery,
    files,
    imageRegistry: runtime.imageRegistry,
    videoRegistry: runtime.videoRegistry,
    logger: logger ?? createConsoleLogger("imagine"),
  });
  return { db, jobs, gallery, files, runner };
}
