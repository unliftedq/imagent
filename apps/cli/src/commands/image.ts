import { promises as fs } from "node:fs";
import path from "node:path";

import {
  capImageReferences,
  type GenerationIntent,
  type ImageModelDef,
  type ImageRequest,
  type Job,
} from "@imagent/core";
import type { DefaultModelPreference } from "@imagent/config";
import chalk from "chalk";
import type { Command } from "commander";

import { buildAssetSlots } from "../support/asset-slots.js";
import { installCancelOnInterrupt } from "../support/job-control.js";
import { buildRunner, loadCliRuntime } from "../support/runtime.js";
import { createSpinner } from "../support/spinner.js";
import {
  coerceScalar,
  collect,
  parseKeyValueOptions,
  parsePositiveIntegerOption,
} from "../support/util.js";

interface GenerateOptions {
  provider?: string;
  model?: string;
  option?: string[];
  ref?: string[];
  character?: string[];
  object?: string[];
  background?: string[];
  style?: string[];
  out?: string;
}

/**
 * `imagent image generate <prompt>` — image generation with asset slots.
 *
 * Wires:
 *   secrets + config → registry → JobRunner → start image intent.
 *
 * Awaits `job.completed` or `job.failed`, prints absolute path on success.
 * `--character/--object/--background/--style` (each repeatable) pull
 * reference images from assets identified by slug and (for style) optionally append
 * the asset's prompt_snippet. References are silently capped at the resolved
 * model's maxReferences with a stderr warning.
 */
export function registerImageCommand(program: Command): void {
  const image = program
    .command("image")
    .summary("Image generation commands")
    .description(
      [
        "Generate one or more images from a text prompt.",
        "Use `imagent image generate <prompt>` to generate images.",
        "Run `imagent models --kind image` to list providers/models and `imagent options --provider <id> --model <id>` to see the exact `--option key=value` pairs the chosen model accepts.",
        "Without --provider/--model the CLI falls back to the configured image default model (`config get image.defaultModel` to inspect).",
      ].join("\n"),
    );

  image
    .command("generate <prompt>")
    .summary("Generate one or more images from a text prompt")
    .description(
      [
        "Generate one or more images from a text prompt.",
        "The command waits until generation finishes. If it is interrupted, the in-flight job is cancelled.",
      ].join("\n"),
    )
    .option(
      "--provider <id>",
      "Provider id (openai | azure | google | flux-bfl | byteplus | volcengine | xai). See `imagent doctor` for what is configured.",
    )
    .option(
      "--model <id>",
      "Model/offering id within the chosen provider (see `imagent models --provider <id>`)",
    )
    .option(
      "-o, --option <key=value>",
      "Repeatable model capability option. Common keys: size, aspectRatio, quality, outputFormat, count. Run `imagent options --provider <id> --model <id>` for the exact list.",
      collect,
      [],
    )
    .option("--ref <path>", "Freeform reference image path (repeatable)", collect, [])
    .option(
      "--character <slug>",
      "Attach a saved character asset by slug (repeatable; see `imagent asset list --kind character`)",
      collect,
      [],
    )
    .option("--object <slug>", "Attach a saved object asset by slug (repeatable)", collect, [])
    .option(
      "--background <slug>",
      "Attach a saved background asset by slug (repeatable)",
      collect,
      [],
    )
    .option(
      "--style <slug>",
      "Attach a saved style asset by slug (repeatable; the asset's prompt_snippet is appended to the prompt)",
      collect,
      [],
    )
    .option(
      "--out <dir>",
      "Copy the completed result to this directory after success (the gallery copy is always retained)",
    )
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
  const { providerId, model } = resolveImageSelection(
    runtime.config.app.defaultImageModel,
    runtime.imageRegistry,
    options.provider,
    options.model,
  );
  const provider = runtime.imageRegistry.get(providerId);
  if (!provider) {
    throw new Error(
      `provider '${providerId}' is not configured. Run \`imagent config set ${providerId.split("-")[0]}.apiKey ...\` first.`,
    );
  }
  const resolved = provider.models.get(model);
  if (!resolved) {
    throw new Error(`unknown model '${model}' for provider '${providerId}'`);
  }
  const requestOptions = parseImageOptions(options.option ?? [], resolved);
  const maxRefs = resolved?.capabilities?.maxReferences;

  const { db, jobs, gallery, runner } = buildRunner(runtime);
  try {
    // Asset slots → references + style-snippet additions.
    const slots = await buildAssetSlots(runtime.resolver, db, {
      characters: options.character ?? [],
      objects: options.object ?? [],
      backgrounds: options.background ?? [],
      styles: options.style ?? [],
    });

    const allRefs = [
      ...(options.ref ?? []).map((p) => ({ path: p, role: "freeform" as const })),
      ...slots.references,
    ];
    const { references: cappedRefs, capped } = capImageReferences(allRefs, maxRefs);
    if (capped !== undefined) {
      process.stderr.write(
        `${chalk.yellow("warn:")} capped at ${capped} references for model '${model}' (had ${allRefs.length})\n`,
      );
    }
    const promptWithStyle = slots.stylePromptSnippets.length
      ? `${prompt} ${slots.stylePromptSnippets.join(" ")}`
      : prompt;

    const intent: GenerationIntent = {
      kind: "image",
      request: {
        prompt: promptWithStyle,
        providerId,
        model,
        count: requestOptions.count ?? 1,
        ...requestOptions,
        references: cappedRefs,
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
    const cleanupCancel = installCancelOnInterrupt(runner, jobs, id);

    const spinner = createSpinner({
      label: `generating image with ${providerId}/${model}`,
    });
    spinner.start();
    const job = await completed.finally(() => {
      spinner.stop();
      cleanupCancel();
    });
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
    if (options.out) {
      try {
        const copied = await copyResultToDir(abs, options.out);
        process.stdout.write(`${chalk.green("copied to:")} ${copied}\n`);
      } catch (err) {
        process.stderr.write(`${chalk.yellow("warn:")} ${(err as Error).message}\n`);
        process.exitCode = 1;
      }
    }
  } finally {
    db.close();
  }
}

async function copyResultToDir(sourcePath: string, outDir: string): Promise<string> {
  const targetDir = path.resolve(outDir);
  const targetPath = path.join(targetDir, path.basename(sourcePath));
  try {
    await fs.mkdir(targetDir, { recursive: true });
    await fs.copyFile(sourcePath, targetPath);
    return targetPath;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    const hint =
      code === "ENOENT"
        ? "output directory path is invalid or inaccessible"
        : code === "EACCES" || code === "EPERM"
          ? "permission denied"
          : code === "ENOSPC"
            ? "not enough disk space"
            : (err as Error).message;
    throw new Error(
      `generation succeeded, but --out copy from '${sourcePath}' to '${targetPath}' failed: ${hint}`,
    );
  }
}

function parseImageOptions(values: readonly string[], model: ImageModelDef): Partial<ImageRequest> {
  const pairs = parseKeyValueOptions(values);
  const out: Partial<ImageRequest> = {};
  const raw: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(pairs)) {
    const canonical = imageOptionAliases[key] ?? key;
    if (canonical.startsWith("raw.")) {
      const rawKey = canonical.slice(4);
      if (!rawKey) throw new Error(`invalid image option '${key}'`);
      raw[rawKey] = coerceScalar(value);
      continue;
    }
    assertImageOptionSupported(canonical, model);
    switch (canonical) {
      case "size":
        out.size = value;
        break;
      case "aspectRatio":
        out.aspectRatio = value;
        break;
      case "quality":
        out.quality = value;
        break;
      case "outputFormat":
        out.outputFormat = value;
        break;
      case "count":
        out.count = parsePositiveIntegerOption("image", canonical, value);
        break;
      default:
        throw new Error(
          `unknown image option '${key}'. Supported for ${model.id}: ${supportedImageOptions(model).join(", ")}`,
        );
    }
  }

  if (Object.keys(raw).length > 0) out.raw = raw;
  return out;
}

const imageOptionAliases: Record<string, string> = {
  aspect: "aspectRatio",
  format: "outputFormat",
};

function assertImageOptionSupported(key: string, model: ImageModelDef): void {
  if (supportedImageOptions(model).includes(key)) return;
  throw new Error(
    `model '${model.id}' does not advertise image option '${key}'. Supported: ${supportedImageOptions(model).join(", ")}`,
  );
}

function supportedImageOptions(model: ImageModelDef): string[] {
  const caps = model.capabilities;
  if (!caps) {
    // Unknown capabilities means the catalog cannot provide dynamic guidance,
    // so keep the model-option request surface available and let providers validate.
    return ["size", "aspectRatio", "quality", "outputFormat", "count"];
  }
  const keys = ["count"];
  if ((caps.sizes && caps.sizes.length > 0) || caps.supportsArbitrarySize) keys.push("size");
  if (caps.aspectRatios && caps.aspectRatios.length > 0) keys.push("aspectRatio");
  if (caps.qualities && caps.qualities.length > 0) keys.push("quality");
  if (caps.outputFormats && caps.outputFormats.length > 0) keys.push("outputFormat");
  return keys;
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

function resolveImageSelection(
  configuredDefault: DefaultModelPreference | null,
  registry: ReadonlyMap<string, { models: ReadonlyMap<string, unknown> }>,
  providerOverride: string | undefined,
  modelOverride: string | undefined,
): { providerId: string; model: string } {
  if (providerOverride) {
    const provider = registry.get(providerOverride);
    if (!provider) return { providerId: providerOverride, model: modelOverride ?? "" };
    return {
      providerId: providerOverride,
      model: pickModel(providerOverride, modelOverride, provider.models),
    };
  }

  if (modelOverride) {
    for (const [providerId, provider] of registry) {
      if (provider.models.has(modelOverride)) return { providerId, model: modelOverride };
    }
  }

  if (
    !modelOverride &&
    configuredDefault &&
    registry.get(configuredDefault.providerId)?.models.has(configuredDefault.modelId)
  ) {
    return {
      providerId: configuredDefault.providerId,
      model: configuredDefault.modelId,
    };
  }

  const first = registry.entries().next().value;
  if (first) {
    const [providerId, provider] = first;
    return { providerId, model: pickModel(providerId, modelOverride, provider.models) };
  }
  throw new Error(
    "no image providers configured. Run `imagent config set <vendor>.apiKey ...` first.",
  );
}
