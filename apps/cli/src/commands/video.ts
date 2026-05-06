import path from "node:path";

import type {
  GenerationIntent,
  Job,
  JobProgressEvent,
  VideoModelDef,
  VideoRequest,
} from "@imagent/core";
import chalk from "chalk";
import type { Command } from "commander";

import { buildAssetSlots, capReferences } from "./asset-slots.js";
import { buildRunner, loadCliRuntime } from "./runtime.js";
import {
  coerceScalar,
  collect,
  isTty,
  parseKeyValueOptions,
  parsePositiveNumberOption,
} from "./util.js";

interface VideoOptions {
  provider?: string;
  model?: string;
  option?: string[];
  ref?: string[];
  character?: string[];
  object?: string[];
  background?: string[];
  style?: string[];
  wait?: boolean;
}

export function registerVideoCommand(program: Command): void {
  program
    .command("video <prompt>")
    .description("Submit a video generation job (default provider: bytedance)")
    .option("--provider <id>", "Provider id", "bytedance")
    .option("--model <id>", "Model id within the chosen provider")
    .option(
      "-o, --option <key=value>",
      "Model capability option (repeatable; e.g. durationSec=5, fps=24, resolution=720p, aspectRatio=16:9, firstFrame=path)",
      collect,
      [],
    )
    .option("--ref <path>", "Reference image path (repeatable)", collect, [])
    .option("--character <slug>", "Attach a character asset (repeatable)", collect, [])
    .option("--object <slug>", "Attach an object asset (repeatable)", collect, [])
    .option("--background <slug>", "Attach a background asset (repeatable)", collect, [])
    .option("--style <slug>", "Attach a style asset (repeatable)", collect, [])
    .option("--wait", "Block until job completes, printing live progress")
    .action(async (prompt: string, options: VideoOptions) => {
      try {
        await runVideo(prompt, options);
      } catch (err) {
        process.stderr.write(`${chalk.red("video failed:")} ${(err as Error).message}\n`);
        process.exit(1);
      }
    });
}

async function runVideo(prompt: string, options: VideoOptions): Promise<void> {
  const runtime = await loadCliRuntime();
  const providerId = options.provider ?? "bytedance";
  const provider = runtime.videoRegistry.get(providerId);
  if (!provider) {
    throw new Error(
      `video provider '${providerId}' is not configured. Run \`imagent config set bytedance.apiKey ...\` first.`,
    );
  }
  const model = pickVideoModel(providerId, options.model, provider.models);
  const resolved = provider.models.get(model);
  if (!resolved) {
    throw new Error(`unknown model '${model}' for video provider '${providerId}'`);
  }
  const requestOptions = parseVideoOptions(options.option ?? [], resolved);
  const supportsRefs = resolved?.capabilities?.supportsRefImages !== false;
  const maxRefs = supportsRefs ? undefined : 0;

  const { db, gallery, runner } = buildRunner(runtime);
  try {
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
        `${chalk.yellow("warn:")} capped at ${capped} references for model '${model}'\n`,
      );
    }
    const promptWithStyle = slots.stylePromptSnippets.length
      ? `${prompt} ${slots.stylePromptSnippets.join(" ")}`
      : prompt;

    const req: VideoRequest = {
      prompt: promptWithStyle,
      providerId,
      model,
      ...requestOptions,
      references: cappedRefs.map((p) => ({ path: p, role: "freeform" as const })),
      assetIds: slots.assetIds,
    };

    const intent: GenerationIntent = { kind: "video", request: req };

    if (!options.wait) {
      const id = await runner.start(intent);
      process.stdout.write(`${chalk.green("submitted:")} ${id}\n`);
      process.stdout.write(
        `${chalk.dim("note:")} polling stops when CLI exits; reattach with 'imagent job watch ${id}' from the same machine\n`,
      );
      // Don't await the polling loop; exiting is the documented behaviour.
      return;
    }

    // --wait: subscribe to events, render single-line progress, persist asset
    // links + lineage on completion.
    const tty = isTty();
    const printProgress = (e: JobProgressEvent): void => {
      const pct = Math.round((e.progress ?? 0) * 100);
      if (tty) {
        process.stdout.write(`\rprogress: ${pct}% (${e.state})    `);
      } else {
        process.stdout.write(`progress: ${pct}% (${e.state})\n`);
      }
    };
    runner.on("job.progress", printProgress);

    const completed = new Promise<Job>((resolve, reject) => {
      runner.once("job.completed", (j: Job) => resolve(j));
      runner.once("job.failed", (j: Job) =>
        reject(new Error(j.errorMessage ?? `job ended ${j.state}`)),
      );
    });

    process.stdout.write(`${chalk.dim("submitting:")} provider=${providerId} model=${model}\n`);
    const id = await runner.start(intent);
    process.stdout.write(`${chalk.dim("job:")} ${id}\n`);

    const job = await completed;
    runner.off("job.progress", printProgress);
    if (tty) process.stdout.write("\n");

    if (!job.resultItemId) {
      throw new Error("job completed without resultItemId");
    }
    for (const a of slots.attachments) {
      gallery.addAssetLink({
        itemId: job.resultItemId,
        assetId: a.assetId,
        role: a.role,
      });
    }
    const item = gallery.get(job.resultItemId);
    if (!item) throw new Error("result item missing from gallery_items");
    const abs = path.isAbsolute(item.relPath)
      ? item.relPath
      : path.join(runtime.resolver.dataDir, item.relPath);
    process.stdout.write(`${chalk.green("ok:")} ${abs}\n`);
  } finally {
    db.close();
  }
}

function parseVideoOptions(values: readonly string[], model: VideoModelDef): Partial<VideoRequest> {
  const pairs = parseKeyValueOptions(values);
  const out: Partial<VideoRequest> = {};
  const raw: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(pairs)) {
    const canonical = videoOptionAliases[key] ?? key;
    if (canonical.startsWith("raw.")) {
      const rawKey = canonical.slice(4);
      if (!rawKey) throw new Error(`invalid video option '${key}'`);
      raw[rawKey] = coerceScalar(value);
      continue;
    }
    assertVideoOptionSupported(canonical, model);
    switch (canonical) {
      case "durationSec":
        out.durationSec = parsePositiveNumberOption("video", canonical, value);
        break;
      case "fps":
        out.fps = parsePositiveNumberOption("video", canonical, value);
        break;
      case "resolution":
        out.resolution = value;
        break;
      case "aspectRatio":
        out.aspectRatio = value;
        break;
      case "firstFrame":
        out.firstFrame = value;
        break;
      case "lastFrame":
        out.lastFrame = value;
        break;
      case "negativePrompt":
        out.negativePrompt = value;
        break;
      default:
        throw new Error(
          `unknown video option '${key}'. Supported for ${model.id}: ${supportedVideoOptions(model).join(", ")}`,
        );
    }
  }

  if (Object.keys(raw).length > 0) out.raw = raw;
  return out;
}

const videoOptionAliases: Record<string, string> = {
  duration: "durationSec",
  aspect: "aspectRatio",
  negative: "negativePrompt",
};

function assertVideoOptionSupported(key: string, model: VideoModelDef): void {
  if (supportedVideoOptions(model).includes(key)) return;
  throw new Error(
    `model '${model.id}' does not advertise video option '${key}'. Supported: ${supportedVideoOptions(model).join(", ")}`,
  );
}

function supportedVideoOptions(model: VideoModelDef): string[] {
  const caps = model.capabilities;
  if (!caps) {
    return [
      "durationSec",
      "fps",
      "resolution",
      "aspectRatio",
      "firstFrame",
      "lastFrame",
      "negativePrompt",
    ];
  }
  const keys = ["aspectRatio", "negativePrompt"];
  if (caps.durationsSec || caps.maxDurationSec) keys.push("durationSec");
  if (caps.fpsOptions && caps.fpsOptions.length > 0) keys.push("fps");
  if (caps.resolutions && caps.resolutions.length > 0) keys.push("resolution");
  if (caps.supportsFirstFrame) keys.push("firstFrame");
  if (caps.supportsLastFrame) keys.push("lastFrame");
  return keys;
}

function pickVideoModel(
  providerId: string,
  modelOverride: string | undefined,
  providerModels: ReadonlyMap<string, unknown>,
): string {
  if (modelOverride) return modelOverride;
  // Provider models are resolved from catalog provider offerings. Deployment
  // names and provider aliases are already represented as map keys here.
  const first = providerModels.keys().next().value;
  if (typeof first === "string") return first;
  throw new Error(`no model configured for video provider '${providerId}'`);
}
