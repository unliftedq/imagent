import {
  createEnvSecretsStore,
  createFileConfigStore,
  createFileSecretsStore,
  mergeSecrets,
} from "@imagine-studio/config";
import {
  type FilesServicePort,
  type GalleryRepositoryPort,
  type GenerationIntent,
  type Job,
  type JobRepositoryPort,
  JobRunner,
  createConsoleLogger,
} from "@imagine-studio/core";
import {
  GalleryRepository,
  JobRepository,
  createPathResolver,
  ensureDataDir,
  openDatabase,
} from "@imagine-studio/persistence";
import { createImageRegistry, createVideoRegistry } from "@imagine-studio/providers";
import chalk from "chalk";
import path from "node:path";
import type { Command } from "commander";

interface GenerateOptions {
  provider?: string;
  model?: string;
  count?: string;
  size?: string;
  ref?: string[];
  out?: string;
  board?: string;
  negative?: string;
  seed?: string;
  aspect?: string;
}

/**
 * `imagine generate <prompt>` — image-only at M2 (video lands in M3 spec but
 * the runner already supports it). Wires:
 *   secrets + config → registry → JobRunner → start image intent.
 *
 * Awaits 'job.completed' or 'job.failed'. On success prints the absolute file
 * path; on failure prints the error and exits 1. Asset / board / refs flags
 * are accepted but no-op for now (M3 wires them through gallery_item_assets).
 */
export function registerGenerateCommand(program: Command): void {
  program
    .command("generate <prompt>")
    .description("Generate one or more images from a prompt")
    .option("--provider <id>", "Provider id (openai|azure-openai|google|flux-bfl|seedream)")
    .option("--model <id>", "Model id within the chosen provider")
    .option("--count <n>", "Number of outputs", "1")
    .option("--size <WxH>", "Output size (provider-dependent)")
    .option("--aspect <ratio>", "Aspect ratio (e.g. 1:1, 16:9)")
    .option("--seed <n>", "Random seed")
    .option("--negative <prompt>", "Negative prompt (provider-dependent)")
    .option("--ref <path>", "Reference image path (repeatable)", collect, [])
    .option("--character <id>", "Attach a character asset (M3)")
    .option("--object <id>", "Attach an object asset (M3)")
    .option("--background <id>", "Attach a background asset (M3)")
    .option("--style <id>", "Attach a style asset (M3)")
    .option("--out <dir>", "Output directory override (M3)")
    .option("--board <id>", "Add result to a board (M3)")
    .action(async (prompt: string, options: GenerateOptions) => {
      try {
        await runGenerate(prompt, options);
      } catch (err) {
        process.stderr.write(`${chalk.red("generate failed:")} ${(err as Error).message}\n`);
        process.exit(1);
      }
    });
}

function collect(value: string, prev: string[]): string[] {
  return [...(prev ?? []), value];
}

async function runGenerate(prompt: string, options: GenerateOptions): Promise<void> {
  const resolver = createPathResolver();
  await ensureDataDir(resolver);

  const config = await createFileConfigStore(resolver.configFile()).loadConfig();
  const fileSecrets = await createFileSecretsStore(resolver.secretsFile()).loadSecrets();
  const envSecrets = await createEnvSecretsStore(process.env).loadSecrets();
  const secrets = mergeSecrets(fileSecrets, envSecrets);

  const providerId = options.provider ?? config.app.defaultProvider;

  const imageRegistry = createImageRegistry(secrets, config.providers);
  const videoRegistry = createVideoRegistry(secrets, config.providers);

  const provider = imageRegistry.get(providerId);
  if (!provider) {
    throw new Error(
      `provider '${providerId}' is not configured. Run \`imagine config set ${providerId.split("-")[0]}.apiKey ...\` first.`,
    );
  }

  const model = pickModel(providerId, options.model, config, provider.models);

  const db = openDatabase(resolver.dbFile());
  try {
    const jobsRepo = new JobRepository(db) satisfies JobRepositoryPort;
    const galleryRepo = new GalleryRepository(db) satisfies GalleryRepositoryPort;
    const filesService: FilesServicePort = {
      dataDir: resolver.dataDir,
      galleryDir: (date) => resolver.galleryDir(date),
      galleryItemFile: (id, ext, date) => resolver.galleryItemFile(id, ext, date),
    };

    const runner = new JobRunner({
      jobs: jobsRepo,
      gallery: galleryRepo,
      files: filesService,
      imageRegistry,
      videoRegistry,
      logger: createConsoleLogger("imagine"),
    });

    const intent: GenerationIntent = {
      kind: "image",
      request: {
        prompt,
        ...(options.negative ? { negativePrompt: options.negative } : {}),
        providerId,
        model,
        count: Number(options.count ?? 1),
        ...(options.size ? { size: options.size } : {}),
        ...(options.aspect ? { aspectRatio: options.aspect } : {}),
        ...(options.seed ? { seed: Number(options.seed) } : {}),
        references: (options.ref ?? []).map((p) => ({ path: p, role: "freeform" as const })),
        assetIds: [],
      },
    };

    const completed = new Promise<Job>((resolve, reject) => {
      runner.once("job.completed", (j: Job) => resolve(j));
      runner.once("job.failed", (j: Job) => {
        reject(new Error(j.errorMessage ?? "job failed"));
      });
    });

    process.stdout.write(`${chalk.dim("submitting:")} provider=${providerId} model=${model}\n`);
    const id = await runner.start(intent);
    process.stdout.write(`${chalk.dim("job:")} ${id}\n`);

    const job = await completed;
    if (!job.resultItemId) {
      throw new Error("job completed without resultItemId");
    }
    const item = galleryRepo.get(job.resultItemId);
    if (!item) {
      throw new Error("result item missing from gallery_items");
    }
    const abs = path.isAbsolute(item.relPath) ? item.relPath : path.join(resolver.dataDir, item.relPath);
    process.stdout.write(`${chalk.green("ok:")} ${abs}\n`);
  } finally {
    db.close();
  }
}

function pickModel(
  providerId: string,
  modelOverride: string | undefined,
  config: { providers: Record<string, unknown> },
  providerModels: ReadonlyMap<string, unknown>,
): string {
  if (modelOverride) return modelOverride;
  const block = config.providers[providerId] as { defaultModel?: string } | undefined;
  if (block?.defaultModel && providerModels.has(block.defaultModel)) {
    return block.defaultModel;
  }
  // Fallback to the first known model.
  const first = providerModels.keys().next().value;
  if (typeof first === "string") return first;
  throw new Error(`no model configured for provider '${providerId}'`);
}
