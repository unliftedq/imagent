import path from "node:path";

import type {
  GenerationIntent,
  Job,
  JobProgressEvent,
  VideoRequest,
} from "@imagine-studio/core";
import chalk from "chalk";
import type { Command } from "commander";

import { buildAssetSlots, capReferences } from "./asset-slots.js";
import { buildRunner, loadCliRuntime } from "./runtime.js";
import { collect, isTty } from "./util.js";

interface VideoOptions {
  provider?: string;
  model?: string;
  duration?: string;
  fps?: string;
  resolution?: string;
  aspect?: string;
  ref?: string[];
  character?: string[];
  object?: string[];
  background?: string[];
  style?: string[];
  wait?: boolean;
  out?: string;
  board?: string;
}

export function registerVideoCommand(program: Command): void {
  program
    .command("video <prompt>")
    .description("Submit a video generation job (default provider: seedance)")
    .option("--provider <id>", "Provider id", "seedance")
    .option("--model <id>", "Model id within the chosen provider")
    .option("--duration <sec>", "Clip duration in seconds")
    .option("--fps <n>", "Frames per second")
    .option("--resolution <r>", "Resolution (e.g. 720p, 1080p)")
    .option("--aspect <ratio>", "Aspect ratio (e.g. 16:9, 9:16)")
    .option("--ref <path>", "Reference image path (repeatable)", collect, [])
    .option("--character <id>", "Attach a character asset (repeatable)", collect, [])
    .option("--object <id>", "Attach an object asset (repeatable)", collect, [])
    .option("--background <id>", "Attach a background asset (repeatable)", collect, [])
    .option("--style <id>", "Attach a style asset (repeatable)", collect, [])
    .option("--wait", "Block until job completes, printing live progress")
    .option("--out <dir>", "Output directory override")
    .option("--board <id>", "Add result to a board after generation")
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
  const providerId = options.provider ?? "seedance";
  const provider = runtime.videoRegistry.get(providerId);
  if (!provider) {
    throw new Error(
      `video provider '${providerId}' is not configured. Run \`imagine config set volcengine.apiKey ...\` first.`,
    );
  }
  const model = pickVideoModel(providerId, options.model, runtime.config, provider.models);
  const resolved = provider.models.get(model);
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
      ...(options.duration ? { durationSec: Number(options.duration) } : {}),
      ...(options.fps ? { fps: Number(options.fps) } : {}),
      ...(options.resolution ? { resolution: options.resolution } : {}),
      ...(options.aspect ? { aspectRatio: options.aspect } : {}),
      references: cappedRefs.map((p) => ({ path: p, role: "freeform" as const })),
      assetIds: slots.assetIds,
      ...(options.board ? { boardId: options.board } : {}),
    };

    const intent: GenerationIntent = { kind: "video", request: req };

    if (!options.wait) {
      const id = await runner.start(intent);
      process.stdout.write(`${chalk.green("submitted:")} ${id}\n`);
      process.stdout.write(
        `${chalk.dim("note:")} polling stops when CLI exits; reattach with 'imagine job watch ${id}' from the same machine\n`,
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

function pickVideoModel(
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
  const first = providerModels.keys().next().value;
  if (typeof first === "string") return first;
  throw new Error(`no model configured for video provider '${providerId}'`);
}
