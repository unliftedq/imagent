import { promises as fs } from "node:fs";

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
  migrateLegacySecretsRouting,
  migrateProviderRouting,
  type ModelCatalog,
  saveCatalog,
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
 *
 * Side effects (idempotent, run once):
 *   - Move per-user provider routing left in catalog.json (Azure deployments,
 *     custom OpenAI providers) to `config.providers.<id>`.
 *   - Move legacy `endpoint`/`baseUrl` fields living in secrets.json into
 *     `config.providers.<id>.endpoint/baseUrl`. Secrets afterwards only
 *     carries apiKey fields.
 *
 * Subsequent runs no-op.
 */
export async function loadCliRuntime(): Promise<CliRuntime> {
  const resolver = createPathResolver();
  await ensureDataDir(resolver);

  const configStore = createFileConfigStore(resolver.configFile());
  const secretsStore = createFileSecretsStore(resolver.secretsFile());
  let config = await configStore.loadConfig();

  // Read secrets as raw JSON so the migration can see legacy
  // endpoint/baseUrl fields before zod silently strips them.
  const rawSecrets = await readJsonFile(resolver.secretsFile());
  const secretsMigration = migrateLegacySecretsRouting(rawSecrets, config);
  let fileSecrets: ProviderSecrets = secretsMigration.secrets;
  if (secretsMigration.migrated) {
    config = await configStore.saveConfig(secretsMigration.config);
    // Persist the cleaned secrets file (apiKey-only).
    await secretsStore.saveSecrets(fileSecrets);
    if (process.env.IMAGENT_DEBUG_MIGRATION) {
      process.stderr.write(`[migration] moved endpoint/baseUrl secrets → config\n`);
    }
  } else {
    // Secrets file was already in the post-split shape; load through the
    // typed store so the result picks up any defaults / shape coercions.
    fileSecrets = await secretsStore.loadSecrets();
  }

  const envSecrets = await createEnvSecretsStore(process.env).loadSecrets();
  const secrets = mergeSecrets(fileSecrets, envSecrets);

  // Catalog: USER FILE IS AUTHORITATIVE. First run seeds bundled defaults to
  // ~/.imagent/catalog.json; subsequent runs read whatever the user edited.
  let catalog = await loadCatalog({ path: resolver.catalogFile() });

  // Idempotent migration: pull per-user provider routing out of the catalog
  // into config.providers.<id>. After it runs once both files reach the
  // post-split shape and re-runs become no-ops.
  const catalogMigration = migrateProviderRouting(catalog, config);
  if (catalogMigration.migrated) {
    catalog = catalogMigration.catalog;
    config = await configStore.saveConfig(catalogMigration.config);
    await saveCatalog(catalog, { path: resolver.catalogFile() });
    if (process.env.IMAGENT_DEBUG_MIGRATION) {
      const summary = Object.entries(catalogMigration.movedByProvider)
        .map(([id, c]) => `${id} (${c.image} image, ${c.video} video)`)
        .join(", ");
      process.stderr.write(`[migration] moved provider routing → config: ${summary}\n`);
    }
  }

  // Apply env-derived routing overlay last so AZURE_OPENAI_ENDPOINT etc.
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

async function readJsonFile(filePath: string): Promise<unknown> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT") return {};
    throw err;
  }
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
