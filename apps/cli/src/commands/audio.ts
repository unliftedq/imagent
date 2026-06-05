import { promises as fs } from "node:fs";
import path from "node:path";

import type { AudioModelDef, AudioRequest, GenerationIntent, Job } from "@imagent/core";
import chalk from "chalk";
import type { Command } from "commander";

import { installCancelOnInterrupt } from "../support/job-control.js";
import { buildRunner, loadCliRuntime } from "../support/runtime.js";
import { createSpinner } from "../support/spinner.js";
import {
  coerceScalar,
  collect,
  parseKeyValueOptions,
  parsePositiveNumberOption,
} from "../support/util.js";

interface AudioGenerateOptions {
  provider?: string;
  model?: string;
  option?: string[];
  out?: string;
}

interface AudioVoicesOptions {
  provider?: string;
  model?: string;
  json?: boolean;
}

export function registerAudioCommand(program: Command): void {
  const audio = program
    .command("audio")
    .summary("Audio (text-to-speech) commands")
    .description(
      [
        "Generate speech audio from text.",
        "Use `imagent audio generate <text>` to synthesize speech.",
        "Use `imagent audio voices --provider <id>` to discover available voices.",
        "Run `imagent models --kind audio` to list providers/models and `imagent options --provider <id> --model <id> --kind audio` for the exact `--option key=value` pairs.",
      ].join("\n"),
    );

  audio
    .command("generate <text>")
    .summary("Synthesize speech from text")
    .description("Generate speech audio. Waits for completion and prints the result path.")
    .option("--provider <id>", "Provider id (elevenlabs | minimax). See `imagent doctor`.")
    .option("--model <id>", "Model/offering id (see `imagent models --kind audio --provider <id>`)")
    .option(
      "-o, --option <key=value>",
      "Repeatable model option. Common keys: voice, speed, outputFormat. Provider extras (stability, emotion, vol, pitch) are passed through.",
      collect,
      [],
    )
    .option("--out <dir>", "Copy the completed audio to this directory after success")
    .action(async (text: string, options: AudioGenerateOptions) => {
      try {
        await runAudioGenerate(text, options);
      } catch (err) {
        process.stderr.write(`${chalk.red("audio failed:")} ${(err as Error).message}\n`);
        process.exit(1);
      }
    });

  audio
    .command("voices")
    .summary("List voices for an audio provider/model")
    .description(
      "List voices from the provider's voice-list API when available, falling back to the model's static catalog voices.",
    )
    .requiredOption("--provider <id>", "Provider id (elevenlabs | minimax)")
    .option("--model <id>", "Model/offering id (defaults to the provider's first audio model)")
    .option("--json", "Emit JSON instead of a table", false)
    .action(async (options: AudioVoicesOptions) => {
      try {
        await runAudioVoices(options);
      } catch (err) {
        process.stderr.write(`${chalk.red("voices failed:")} ${(err as Error).message}\n`);
        process.exit(1);
      }
    });
}

async function runAudioGenerate(text: string, options: AudioGenerateOptions): Promise<void> {
  const runtime = await loadCliRuntime();
  const { providerId, model } = resolveAudioSelection(runtime, options.provider, options.model);
  const provider = runtime.audioRegistry.get(providerId);
  if (!provider) {
    throw new Error(
      `audio provider '${providerId}' is not configured. Run \`imagent config set ${providerId}.apiKey ...\` first.`,
    );
  }
  const resolved = provider.models.get(model);
  if (!resolved) throw new Error(`unknown model '${model}' for provider '${providerId}'`);
  const requestOptions = parseAudioOptions(options.option ?? [], resolved);

  const { db, jobs, gallery, runner } = buildRunner(runtime);
  try {
    const intent: GenerationIntent = {
      kind: "audio",
      request: {
        prompt: text,
        providerId,
        model,
        assetIds: [],
        ...requestOptions,
      } satisfies AudioRequest,
    };

    const completed = new Promise<Job>((resolve, reject) => {
      runner.once("job.completed", (j: Job) => resolve(j));
      runner.once("job.failed", (j: Job) => reject(new Error(j.errorMessage ?? "job failed")));
    });

    process.stdout.write(`${chalk.dim("submitting:")} provider=${providerId} model=${model}\n`);
    const id = await runner.start(intent);
    const cleanupCancel = installCancelOnInterrupt(runner, jobs, id);
    const spinner = createSpinner({ label: `synthesizing audio with ${providerId}/${model}` });
    spinner.start();
    const job = await completed.finally(() => {
      spinner.stop();
      cleanupCancel();
    });
    if (!job.resultItemId) throw new Error("job completed without resultItemId");
    const item = gallery.get(job.resultItemId);
    if (!item) throw new Error("result item missing from gallery_items");
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

async function runAudioVoices(options: AudioVoicesOptions): Promise<void> {
  const runtime = await loadCliRuntime();
  const providerId = options.provider as string;
  const provider = runtime.audioRegistry.get(providerId);
  if (!provider) throw new Error(`audio provider '${providerId}' is not configured`);
  const modelId = options.model ?? provider.models.keys().next().value;
  const model = modelId ? provider.models.get(modelId) : undefined;
  if (options.model && !model) {
    throw new Error(`unknown model '${options.model}' for provider '${providerId}'`);
  }

  let voices = model?.capabilities?.voices ?? [];
  if (provider.listVoices && model?.capabilities?.supportsVoiceDiscovery) {
    try {
      voices = await provider.listVoices();
    } catch (err) {
      process.stderr.write(
        `${chalk.yellow("warn:")} voice discovery failed (${(err as Error).message}); showing catalog voices\n`,
      );
    }
  }

  if (options.json) {
    process.stdout.write(`${JSON.stringify(voices, null, 2)}\n`);
    return;
  }
  if (voices.length === 0) {
    process.stdout.write("no voices available\n");
    return;
  }
  for (const v of voices) {
    const label = v.labels ? ` ${chalk.dim(JSON.stringify(v.labels))}` : "";
    process.stdout.write(`${chalk.cyan(v.id)}  ${v.name}${label}\n`);
  }
}

export function resolveAudioSelection(
  runtime: Awaited<ReturnType<typeof loadCliRuntime>>,
  providerOverride: string | undefined,
  modelOverride: string | undefined,
): { providerId: string; model: string } {
  const registry = runtime.audioRegistry;
  const def = runtime.config.app.defaultAudioModel;
  if (providerOverride) {
    const provider = registry.get(providerOverride);
    const model = modelOverride ?? provider?.models.keys().next().value;
    if (!model) throw new Error(`no audio model configured for provider '${providerOverride}'`);
    return { providerId: providerOverride, model };
  }
  if (modelOverride) {
    for (const [pid, provider] of registry) {
      if (provider.models.has(modelOverride)) return { providerId: pid, model: modelOverride };
    }
    throw new Error(`unknown audio model '${modelOverride}' for configured audio providers`);
  }
  if (def && registry.get(def.providerId)?.models.has(def.modelId)) {
    return { providerId: def.providerId, model: def.modelId };
  }
  const first = registry.entries().next().value;
  if (first) {
    const [pid, provider] = first;
    const model = modelOverride ?? provider.models.keys().next().value;
    if (model) return { providerId: pid, model };
  }
  throw new Error(
    "no audio providers configured. Run `imagent config set elevenlabs.apiKey ...` first.",
  );
}

export function parseAudioOptions(
  values: readonly string[],
  model: AudioModelDef,
): Partial<AudioRequest> {
  const pairs = parseKeyValueOptions(values);
  const out: Partial<AudioRequest> = {};
  const raw: Record<string, unknown> = {};
  const knobKeys = new Set(Object.keys(model.capabilities?.extraKnobs ?? {}));
  for (const [key, value] of Object.entries(pairs)) {
    switch (key) {
      case "voice":
        out.voice = value;
        break;
      case "speed":
        out.speed = parsePositiveNumberOption("audio", key, value);
        break;
      case "outputFormat":
      case "format":
        out.outputFormat = value;
        break;
      default:
        if (knobKeys.has(key)) {
          raw[key] = coerceScalar(value);
        } else {
          throw new Error(
            `unknown audio option '${key}'. Supported: voice, speed, outputFormat${
              knobKeys.size ? `, ${[...knobKeys].join(", ")}` : ""
            }`,
          );
        }
    }
  }
  if (Object.keys(raw).length > 0) out.raw = raw;
  return out;
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
