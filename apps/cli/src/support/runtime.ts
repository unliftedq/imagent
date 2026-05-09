import { randomUUID } from "node:crypto";

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
  type FilesServicePort,
  type GalleryRepositoryPort,
  type ImageRegistry,
  type JobRepositoryPort,
  JobRunner,
  type Logger,
  type VideoRegistry,
  createConsoleLogger,
} from "@imagent/core";
import {
  type DatabaseType,
  GalleryRepository,
  JobRepository,
  type PathResolver,
  createPathResolver,
  ensureDataDir,
  openDatabase,
} from "@imagent/persistence";
import {
  createImageRegistry,
  createVideoRegistry,
  loadCatalog,
  type ModelCatalog,
} from "@imagent/providers";
import { DETACHED_JOB_ID_ENV } from "./detached.js";

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

  // Catalog: USER FILE IS AUTHORITATIVE. First run seeds bundled defaults to
  // ~/.imagent/catalog.json; subsequent runs read whatever the user edited.
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
  const forcedJobId = process.env[DETACHED_JOB_ID_ENV];
  let usedForcedJobId = false;
  const runner = new JobRunner({
    jobs,
    gallery,
    files,
    imageRegistry: runtime.imageRegistry,
    videoRegistry: runtime.videoRegistry,
    logger: logger ?? createConsoleLogger("imagent"),
    ...(forcedJobId
      ? {
          idFactory: () => {
            if (!usedForcedJobId) {
              usedForcedJobId = true;
              return forcedJobId;
            }
            return randomUUID();
          },
        }
      : {}),
  });
  return { db, jobs, gallery, files, runner };
}
