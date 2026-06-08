import { promises as fs } from "node:fs";
import path from "node:path";

import type { SpeechModelDef, SpeechRequest, GenerationIntent, Job, VoiceInfo } from "@imagent/core";
import { splitSpeechFormat } from "@imagent/core";
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

interface SpeechSynthesizeOptions {
  provider?: string;
  model?: string;
  option?: string[];
  out?: string;
}

interface SpeechVoicesOptions {
  provider?: string;
  model?: string;
  json?: boolean;
}

export function registerSpeechCommand(program: Command): void {
  const speech = program
    .command("speech")
    .summary("Speech (text-to-speech) commands")
    .description(
      [
        "Generate speech from text.",
        "Use `imagent speech synthesize <text>` to synthesize speech.",
        "Use `imagent speech voices --provider <id>` to discover available voices.",
        "Run `imagent models --kind speech` to list providers/models and `imagent options --provider <id> --model <id> --kind speech` for the exact `--option key=value` pairs.",
      ].join("\n"),
    );

  speech
    .command("synthesize <text>")
    .summary("Synthesize speech from text")
    .description("Synthesize text to speech. Waits for completion and prints the result path.")
    .option("--provider <id>", "Provider id (openai | google | elevenlabs | minimax). See `imagent doctor`.")
    .option("--model <id>", "Model/offering id (see `imagent models --kind speech --provider <id>`)")
    .option(
      "-o, --option <key=value>",
      "Repeatable model option. Common keys: voice, speed, outputFormat. Provider extras (stability, emotion, vol, pitch) are passed through.",
      collect,
      [],
    )
    .option("--out <dir>", "Copy the completed speech to this directory after success")
    .action(async (text: string, options: SpeechSynthesizeOptions) => {
      try {
        await runSpeechSynthesize(text, options);
      } catch (err) {
        process.stderr.write(`${chalk.red("speech failed:")} ${(err as Error).message}\n`);
        process.exit(1);
      }
    });

  speech
    .command("voices")
    .summary("List voices for a speech provider/model")
    .description(
      "List voices from the provider's voice-list API when available, falling back to the model's static catalog voices.",
    )
    .requiredOption("--provider <id>", "Provider id (openai | google | elevenlabs | minimax)")
    .option("--model <id>", "Model/offering id (defaults to the provider's first speech model)")
    .option("--json", "Emit JSON instead of a human-readable list", false)
    .action(async (options: SpeechVoicesOptions) => {
      try {
        await runSpeechVoices(options);
      } catch (err) {
        process.stderr.write(`${chalk.red("voices failed:")} ${(err as Error).message}\n`);
        process.exit(1);
      }
    });
}

async function runSpeechSynthesize(text: string, options: SpeechSynthesizeOptions): Promise<void> {
  const runtime = await loadCliRuntime();
  const { providerId, model } = resolveSpeechSelection(runtime, options.provider, options.model);
  const provider = runtime.speechRegistry.get(providerId);
  if (!provider) {
    throw new Error(
      `speech provider '${providerId}' is not configured. Run \`imagent config set ${providerId}.apiKey ...\` first.`,
    );
  }
  const resolved = provider.models.get(model);
  if (!resolved) throw new Error(`unknown model '${model}' for provider '${providerId}'`);
  const requestOptions = parseSpeechOptions(options.option ?? [], resolved);

  const { db, jobs, gallery, runner } = buildRunner(runtime);
  try {
    const intent: GenerationIntent = {
      kind: "speech",
      request: {
        prompt: text,
        providerId,
        model,
        assetIds: [],
        ...requestOptions,
      } satisfies SpeechRequest,
    };

    const completed = new Promise<Job>((resolve, reject) => {
      runner.once("job.completed", (j: Job) => resolve(j));
      runner.once("job.failed", (j: Job) => reject(new Error(j.errorMessage ?? "job failed")));
    });

    process.stdout.write(`${chalk.dim("submitting:")} provider=${providerId} model=${model}\n`);
    const id = await runner.start(intent);
    const cleanupCancel = installCancelOnInterrupt(runner, jobs, id);
    const spinner = createSpinner({ label: `synthesizing speech with ${providerId}/${model}` });
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

async function runSpeechVoices(options: SpeechVoicesOptions): Promise<void> {
  const runtime = await loadCliRuntime();
  const providerId = options.provider as string;
  const provider = runtime.speechRegistry.get(providerId);
  if (!provider) throw new Error(`speech provider '${providerId}' is not configured`);
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
  renderVoices(voices, providerId, modelId);
}

/** Renders a friendly, multi-line listing for each normalized voice. */
function renderVoices(voices: readonly VoiceInfo[], providerId: string, modelId?: string): void {
  const target = modelId ? `${providerId}/${modelId}` : providerId;
  const noun = voices.length === 1 ? "voice" : "voices";
  process.stdout.write(`${chalk.bold(`${voices.length} ${noun}`)} ${chalk.dim(`· ${target}`)}\n\n`);

  const field = (label: string, value: string) => `  ${chalk.dim(label.padEnd(8))}${value}\n`;

  voices.forEach((v, index) => {
    const category = v.category ? chalk.dim(` (${v.category})`) : "";
    process.stdout.write(`${chalk.bold(v.name)}${category}\n`);
    process.stdout.write(field("id", chalk.cyan(v.id)));
    if (v.description) process.stdout.write(field("about", v.description));
    if (v.labels && Object.keys(v.labels).length > 0) {
      const tags = Object.entries(v.labels)
        .map(([key, value]) => `${key}=${value}`)
        .join("  ");
      process.stdout.write(field("tags", chalk.dim(tags)));
    }
    if (v.previewUrl) process.stdout.write(field("preview", chalk.dim(v.previewUrl)));
    if (index < voices.length - 1) process.stdout.write("\n");
  });

  process.stdout.write(`\n${chalk.dim("Use a voice with")} ${chalk.cyan("--option voice=<id>")}\n`);
}

export function resolveSpeechSelection(
  runtime: Awaited<ReturnType<typeof loadCliRuntime>>,
  providerOverride: string | undefined,
  modelOverride: string | undefined,
): { providerId: string; model: string } {
  const registry = runtime.speechRegistry;
  const def = runtime.config.app.defaultSpeechModel;
  if (providerOverride) {
    const provider = registry.get(providerOverride);
    const model = modelOverride ?? provider?.models.keys().next().value;
    if (!model) throw new Error(`no speech model configured for provider '${providerOverride}'`);
    return { providerId: providerOverride, model };
  }
  if (modelOverride) {
    for (const [pid, provider] of registry) {
      if (provider.models.has(modelOverride)) return { providerId: pid, model: modelOverride };
    }
    throw new Error(`unknown speech model '${modelOverride}' for configured speech providers`);
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
    "no speech providers configured. Run `imagent config set elevenlabs.apiKey ...` first.",
  );
}

export function parseSpeechOptions(
  values: readonly string[],
  model: SpeechModelDef,
): Partial<SpeechRequest> {
  const pairs = parseKeyValueOptions(values);
  const out: Partial<SpeechRequest> = {};
  const raw: Record<string, unknown> = {};
  const knobKeys = new Set(Object.keys(model.capabilities?.extraKnobs ?? {}));
  for (const [key, value] of Object.entries(pairs)) {
    switch (key) {
      case "voice":
        out.voice = value;
        break;
      case "speed":
        out.speed = parsePositiveNumberOption("speech", key, value);
        break;
      case "codec":
        out.codec = value;
        break;
      case "formatQuality":
        out.formatQuality = value;
        break;
      case "outputFormat":
      case "format": {
        const { codec, formatQuality } = splitSpeechFormat(value);
        out.codec = codec;
        if (formatQuality !== undefined) out.formatQuality = formatQuality;
        break;
      }
      default:
        if (knobKeys.has(key)) {
          raw[key] = coerceScalar(value);
        } else {
          throw new Error(
            `unknown speech option '${key}'. Supported: voice, speed, outputFormat${
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
