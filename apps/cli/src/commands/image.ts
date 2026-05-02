import path from "node:path";

import type { GenerationIntent, ImageRequest, Job } from "@imagine/core";
import chalk from "chalk";
import type { Command } from "commander";

import { buildAssetSlots, capReferences } from "./asset-slots.js";
import { buildRunner, loadCliRuntime } from "./runtime.js";
import { collect } from "./util.js";

interface GenerateOptions {
  provider?: string;
  model?: string;
  count?: string;
  size?: string;
  ref?: string[];
  out?: string;
  negative?: string;
  seed?: string;
  aspect?: string;
  character?: string[];
  object?: string[];
  background?: string[];
  style?: string[];
}

/**
 * `imagine image <prompt>` — image generation with asset slots (M3).
 *
 * Wires:
 *   secrets + config → registry → JobRunner → start image intent.
 *
 * Awaits `job.completed` or `job.failed`, prints absolute path on success.
 * `--character/--object/--background/--style` (each repeatable) pull
 * reference images from the slugged asset and (for style) optionally append
 * the asset's prompt_snippet. References are silently capped at the resolved
 * model's maxReferences with a stderr warning.
 */
export function registerImageCommand(program: Command): void {
  program
    .command("image <prompt>")
    .description("Generate one or more images from a prompt")
    .option("--provider <id>", "Provider id (openai|azure-openai|google|flux-bfl|bytedance|xai)")
    .option("--model <id>", "Model id within the chosen provider")
    .option("--count <n>", "Number of outputs", "1")
    .option("--size <WxH>", "Output size (provider-dependent)")
    .option("--aspect <ratio>", "Aspect ratio (e.g. 1:1, 16:9)")
    .option("--seed <n>", "Random seed")
    .option("--negative <prompt>", "Negative prompt (provider-dependent)")
    .option("--ref <path>", "Freeform reference image path (repeatable)", collect, [])
    .option("--character <slug>", "Attach a character asset (repeatable)", collect, [])
    .option("--object <slug>", "Attach an object asset (repeatable)", collect, [])
    .option("--background <slug>", "Attach a background asset (repeatable)", collect, [])
    .option("--style <slug>", "Attach a style asset (repeatable)", collect, [])
    .option("--out <dir>", "Output directory override")
    .action(async (prompt: string, options: GenerateOptions) => {
      try {
        await runGenerate(prompt, options);
      } catch (err) {
        process.stderr.write(`${chalk.red("image failed:")} ${(err as Error).message}\n`);
        process.exit(1);
      }
    });
}

async function runGenerate(prompt: string, options: GenerateOptions): Promise<void> {
  const runtime = await loadCliRuntime();
  const providerId = options.provider ?? runtime.config.app.defaultProvider;
  const provider = runtime.imageRegistry.get(providerId);
  if (!provider) {
    throw new Error(
      `provider '${providerId}' is not configured. Run \`imagine config set ${providerId.split("-")[0]}.apiKey ...\` first.`,
    );
  }
  const model = pickModel(providerId, options.model, provider.models);
  const resolved = provider.models.get(model);
  const maxRefs = resolved?.capabilities?.maxReferences;

  const { db, gallery, runner } = buildRunner(runtime);
  try {
    // Asset slots → references + style-snippet additions.
    const slots = await buildAssetSlots(runtime.resolver, db, {
      characters: options.character ?? [],
      objects: options.object ?? [],
      backgrounds: options.background ?? [],
      styles: options.style ?? [],
    });

    const allRefPaths = [...(options.ref ?? []), ...slots.referencePaths];
    const { references: cappedRefs, capped } = capReferences(allRefPaths, maxRefs);
    if (capped !== undefined) {
      process.stderr.write(
        `${chalk.yellow("warn:")} capped at ${capped} references for model '${model}' (had ${allRefPaths.length})\n`,
      );
    }
    const promptWithStyle = slots.stylePromptSnippets.length
      ? `${prompt} ${slots.stylePromptSnippets.join(" ")}`
      : prompt;

    const intent: GenerationIntent = {
      kind: "image",
      request: {
        prompt: promptWithStyle,
        ...(options.negative ? { negativePrompt: options.negative } : {}),
        providerId,
        model,
        count: Number(options.count ?? 1),
        ...(options.size ? { size: options.size } : {}),
        ...(options.aspect ? { aspectRatio: options.aspect } : {}),
        ...(options.seed ? { seed: Number(options.seed) } : {}),
        references: cappedRefs.map((p) => ({ path: p, role: "freeform" as const })),
        assetIds: slots.assetIds,
      } satisfies ImageRequest,
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

    // Record gallery_item_assets links for every contributing asset.
    for (const a of slots.attachments) {
      gallery.addAssetLink({
        itemId: job.resultItemId,
        assetId: a.assetId,
        role: a.role,
      });
    }

    const item = gallery.get(job.resultItemId);
    if (!item) {
      throw new Error("result item missing from gallery_items");
    }
    const abs = path.isAbsolute(item.relPath)
      ? item.relPath
      : path.join(runtime.resolver.dataDir, item.relPath);
    process.stdout.write(`${chalk.green("ok:")} ${abs}\n`);
  } finally {
    db.close();
  }
}

function pickModel(
  providerId: string,
  modelOverride: string | undefined,
  providerModels: ReadonlyMap<string, unknown>,
): string {
  if (modelOverride) return modelOverride;
  // Provider models are resolved from catalog provider offerings. For Azure,
  // these keys are deployment names; for other providers they are model ids.
  const first = providerModels.keys().next().value;
  if (typeof first === "string") return first;
  throw new Error(`no model configured for provider '${providerId}'`);
}
