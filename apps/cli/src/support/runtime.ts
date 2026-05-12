import {
  type ConfigFile,
  createEnvSecretsStore,
  createFileConfigStore,
  createFileSecretsStore,
  envProviderRoutingOverlay,
  mergeSecrets,
  type ProviderSecrets,
} from "@imagent/config";
import {
  createConsoleLogger,
  type FilesServicePort,
  type GalleryRepositoryPort,
  type ImageRegistry,
  type JobRepositoryPort,
  JobRunner,
  type Logger,
  type VideoRegistry,
} from "@imagent/core";
import {
  createPathResolver,
  type DatabaseType,
  ensureDataDir,
  GalleryRepository,
  JobRepository,
  openDatabase,
  type PathResolver,
} from "@imagent/persistence";
import {
  createImageRegistry,
  createVideoRegistry,
  loadCatalog,
  type ModelCatalog,
} from "@imagent/providers";

export interface CliRuntime {
  resolver: PathResolver;
  config: ConfigFile;
  secrets: ProviderSecrets;
  catalog: ModelCatalog;
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

  const configStore = createFileConfigStore(resolver.configFile());
  const secretsStore = createFileSecretsStore(resolver.secretsFile());
  const config = await configStore.loadConfig();

  const fileSecrets = await secretsStore.loadSecrets();
  const envSecrets = await createEnvSecretsStore(process.env).loadSecrets();
  const secrets = mergeSecrets(fileSecrets, envSecrets);

  // Catalog: bundled defaults are the base; ~/.imagent/catalog.json is an
  // optional user overlay for additions and overrides.
  const catalog = await loadCatalog({ path: resolver.catalogFile() });

  // Apply env-derived routing overlay last so AZURE_ENDPOINT etc.
  // win without touching disk.
  const effectivePrefs = envProviderRoutingOverlay(process.env, config.providers);

  const imageRegistry = createImageRegistry(secrets, effectivePrefs, catalog);
  const videoRegistry = createVideoRegistry(secrets, effectivePrefs, catalog);

  return {
    resolver,
    config: { ...config, providers: effectivePrefs },
    secrets,
    catalog,
    imageRegistry,
    videoRegistry,
  };
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
    logger: logger ?? createConsoleLogger("imagent"),
  });
  return { db, jobs, gallery, files, runner };
}
