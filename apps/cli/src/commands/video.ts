import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import type {
  GenerationIntent,
  Job,
  JobProgressEvent,
  JobState,
  VideoModelDef,
  VideoProvider,
  VideoRequest,
} from "@imagent/core";
import { AssetRepository } from "@imagent/persistence";
import chalk from "chalk";
import type { Command } from "commander";

import { buildAssetSlots, capReferences } from "../support/asset-slots.js";
import {
  installCancelOnInterrupt,
  isTerminalState,
  resolveJobId,
} from "../support/job-control.js";
import { buildRunner, loadCliRuntime, type CliRuntime, type RunnerBundle } from "../support/runtime.js";
import {
  coerceScalar,
  collect,
  excerpt,
  formatRelativeTime,
  isTty,
  parseKeyValueOptions,
  parsePositiveNumberOption,
} from "../support/util.js";

interface VideoGenerateOptions {
  provider?: string;
  model?: string;
  option?: string[];
  ref?: string[];
  character?: string[];
  object?: string[];
  background?: string[];
  style?: string[];
  wait?: boolean;
  out?: string;
}

const VALID_STATES: JobState[] = ["queued", "running", "succeeded", "failed", "cancelled"];
const VALID_STATE_VALUES = new Set<string>(VALID_STATES);
const VIDEO_TASK_LS_REFRESH_CONCURRENCY = 5;

export function registerVideoCommand(program: Command): void {
  const video = program
    .command("video")
    .summary("Video generation commands")
    .description(
      [
        "Submit, track, and download video generation jobs.",
        "",
        "Use `imagent video generate <prompt>` to submit a video job. By default it returns after provider submission; pass `--wait` to poll until completion and download into the gallery.",
      ].join("\n"),
    );

  video
    .command("generate <prompt>")
    .summary("Submit a video generation job from a text prompt")
    .description(
      [
        "Submit a video generation job from a text prompt.",
        "",
        "Default provider: bytedance. Without --wait, the command exits after the provider accepts the job and prints commands for status/download. With --wait, it polls until completion and downloads the completed video into the gallery.",
        "Run `imagent models --kind video` to list providers/models and `imagent options --provider <id> --model <id>` for the model's exact `--option key=value` keys (durationSec, resolution, aspectRatio, fps, firstFrame, lastFrame, ...).",
      ].join("\n"),
    )
    .option(
      "--provider <id>",
      "Video provider id (bytedance | google | xai). See `imagent doctor`.",
      "bytedance",
    )
    .option(
      "--model <id>",
      "Model id within the chosen provider (see `imagent models --provider <id> --kind video`)",
    )
    .option(
      "-o, --option <key=value>",
      "Repeatable model capability option. Common keys: durationSec, fps, resolution, aspectRatio, firstFrame, lastFrame. Run `imagent options --provider <id> --model <id> --kind video` for the exact list.",
      collect,
      [],
    )
    .option("--ref <path>", "Reference image path (repeatable; only honored when the model supports refs)", collect, [])
    .option("--character <slug>", "Attach a saved character asset by slug (repeatable)", collect, [])
    .option("--object <slug>", "Attach a saved object asset by slug (repeatable)", collect, [])
    .option("--background <slug>", "Attach a saved background asset by slug (repeatable)", collect, [])
    .option("--style <slug>", "Attach a saved style asset by slug (repeatable; appends prompt_snippet)", collect, [])
    .option("--wait", "Poll until completion and download the completed video into the gallery", false)
    .option("--out <dir>", "Copy the downloaded result to this directory")
    .action(async (prompt: string, options: VideoGenerateOptions) => {
      try {
        await runVideoGenerate(prompt, options);
      } catch (err) {
        process.stderr.write(`${chalk.red("video failed:")} ${(err as Error).message}\n`);
        process.exit(1);
      }
    });

  const task = video
    .command("task")
    .description("List, inspect, and cancel submitted video tasks");

  task
    .command("ls")
    .description("List video tasks, refreshing running tasks from their remote provider before printing")
    .option("--state <state>", `One of: ${VALID_STATES.join("|")}`)
    .option("--limit <n>", "Maximum rows to print", "50")
    .action(async (options: { state?: string; limit?: string }) => {
      try {
        await runVideoTaskLs(options);
      } catch (err) {
        process.stderr.write(`${chalk.red("video task ls failed:")} ${(err as Error).message}\n`);
        process.exit(1);
      }
    });

  task
    .command("get")
    .description("Show a video task, refreshing it from the remote provider first when it is running")
    .requiredOption("--id <jobId>", "Video task id or unique prefix (min 6 chars)")
    .action(async (options: { id: string }) => {
      try {
        await runVideoTaskGet(options.id);
      } catch (err) {
        process.stderr.write(`${chalk.red("video task get failed:")} ${(err as Error).message}\n`);
        process.exit(1);
      }
    });

  task
    .command("cancel")
    .description("Cancel a video task after first refreshing its latest remote provider status")
    .requiredOption("--id <jobId>", "Video task id or unique prefix (min 6 chars)")
    .action(async (options: { id: string }) => {
      try {
        await runVideoTaskCancel(options.id);
      } catch (err) {
        process.stderr.write(`${chalk.red("video task cancel failed:")} ${(err as Error).message}\n`);
        process.exit(1);
      }
    });

  video
    .command("download [jobId]")
    .description("Poll until a video job succeeds, download it into the gallery, and optionally copy it to --out")
    .option("--id <jobId>", "Video task id or unique prefix (min 6 chars)")
    .option("--out <dir>", "Copy the downloaded result to this directory")
    .action(async (jobId: string | undefined, options: { id?: string; out?: string }) => {
      try {
        await runVideoDownload(options.id ?? jobId, options);
      } catch (err) {
        process.stderr.write(`${chalk.red("video download failed:")} ${(err as Error).message}\n`);
        process.exit(1);
      }
    });

}

async function runVideoGenerate(prompt: string, options: VideoGenerateOptions): Promise<void> {
  const runtime = await loadCliRuntime();
  const bundle = buildRunner(runtime);
  try {
    const { provider, providerId, model, request, slots } = await prepareVideoRequest(
      runtime,
      bundle,
      prompt,
      options,
    );

    if (options.wait) {
      await runWaitedVideoGenerate(bundle, providerId, model, request, slots.attachments, options.out);
      return;
    }

    process.stdout.write(`${chalk.dim("submitting:")} provider=${providerId} model=${model}\n`);
    const id = randomUUID();
    const now = Date.now();
    bundle.jobs.create({
      id,
      kind: "video",
      state: "queued",
      providerId,
      providerJobId: null,
      requestJson: JSON.stringify(request),
      progress: 0,
      errorMessage: null,
      resultItemId: null,
      createdAt: now,
      updatedAt: now,
      finishedAt: null,
    });

    try {
      const handle = await provider.submit(request);
      bundle.jobs.updateState(id, {
        state: "running",
        providerJobId: handle.providerJobId,
        progress: 0,
      });
      process.stdout.write(`${chalk.green("submitted:")} ${id}\n`);
      process.stdout.write(`${chalk.dim("provider job:")} ${handle.providerJobId}\n`);
      process.stdout.write(`${chalk.dim("status:")} imagent video task get --id ${id}\n`);
      process.stdout.write(`${chalk.dim("download:")} imagent video download --id ${id}\n`);
    } catch (err) {
      bundle.jobs.updateState(id, {
        state: "failed",
        errorMessage: (err as Error)?.message ?? String(err),
        finishedAt: Date.now(),
      });
      throw err;
    }
  } finally {
    bundle.db.close();
  }
}

async function runWaitedVideoGenerate(
  bundle: RunnerBundle,
  providerId: string,
  model: string,
  request: VideoRequest,
  attachments: Array<{ assetId: string; role: string }>,
  outDir: string | undefined,
): Promise<void> {
  const intent: GenerationIntent = { kind: "video", request };
  const tty = isTty();
  const printProgress = (e: JobProgressEvent): void => {
    const pct = Math.round((e.progress ?? 0) * 100);
    if (tty) {
      process.stdout.write(`\rprogress: ${pct}% (${e.state})    `);
    } else {
      process.stdout.write(`progress: ${pct}% (${e.state})\n`);
    }
  };
  bundle.runner.on("job.progress", printProgress);

  const completed = new Promise<Job>((resolve, reject) => {
    bundle.runner.once("job.completed", (j: Job) => resolve(j));
    bundle.runner.once("job.failed", (j: Job) =>
      reject(new Error(j.errorMessage ?? `job ended ${j.state}`)),
    );
  });

  process.stdout.write(`${chalk.dim("submitting:")} provider=${providerId} model=${model}\n`);
  const id = await bundle.runner.start(intent);
  const cleanupCancel = installCancelOnInterrupt(bundle.runner, bundle.jobs, id);
  process.stdout.write(`${chalk.dim("job:")} ${id}\n`);

  const job = await completed.finally(() => {
    cleanupCancel();
    bundle.runner.off("job.progress", printProgress);
    if (tty) process.stdout.write("\n");
  });

  if (!job.resultItemId) {
    throw new Error("job completed without resultItemId");
  }
  for (const a of attachments) {
    bundle.gallery.addAssetLink({
      itemId: job.resultItemId,
      assetId: a.assetId,
      role: a.role,
    });
  }
  await printDownloadedResult(bundle, job, outDir);
}

async function runVideoTaskGet(jobId: string): Promise<void> {
  const runtime = await loadCliRuntime();
  const bundle = buildRunner(runtime);
  try {
    const id = resolveJobId(bundle.jobs, jobId);
    const { job, providerState, progress, errorMessage } = await refreshRemoteVideoTask(
      runtime,
      bundle,
      requireVideoJob(bundle.jobs.get(id), id),
    );

    process.stdout.write(`${chalk.dim("id:        ")}${job.id}\n`);
    process.stdout.write(`${chalk.dim("state:     ")}${stateBadge(job.state)}\n`);
    process.stdout.write(`${chalk.dim("provider:  ")}${job.providerId}\n`);
    if (job.providerJobId) process.stdout.write(`${chalk.dim("provJobId: ")}${job.providerJobId}\n`);
    const readyToDownload = providerState === "succeeded" && !job.resultItemId;
    if (providerState) {
      const suffix = readyToDownload ? " (ready to download)" : "";
      process.stdout.write(`${chalk.dim("provState: ")}${stateBadge(providerState)}${suffix}\n`);
    }
    if (progress !== null && progress !== undefined) {
      process.stdout.write(`${chalk.dim("progress:  ")}${Math.round(progress * 100)}%\n`);
    }
    if (errorMessage) process.stdout.write(`${chalk.dim("error:     ")}${errorMessage}\n`);
    if (job.resultItemId) process.stdout.write(`${chalk.dim("result:    ")}${job.resultItemId}\n`);
    if (readyToDownload) {
      process.stdout.write(`${chalk.dim("download:  ")}imagent video download --id ${job.id}\n`);
    }
    process.stdout.write(`${chalk.dim("created:   ")}${new Date(job.createdAt).toISOString()}\n`);
    process.stdout.write(`${chalk.dim("updated:   ")}${new Date(job.updatedAt).toISOString()}\n`);
    if (job.finishedAt) process.stdout.write(`${chalk.dim("finished:  ")}${new Date(job.finishedAt).toISOString()}\n`);
  } finally {
    bundle.db.close();
  }
}

async function runVideoDownload(jobId: string | undefined, options: { out?: string }): Promise<void> {
  if (!jobId) throw new Error("missing required job id; pass <jobId> or --id <jobId>");
  const runtime = await loadCliRuntime();
  const bundle = buildRunner(runtime);
  try {
    const id = resolveJobId(bundle.jobs, jobId);
    requireVideoJob(bundle.jobs.get(id), id);

    const tty = isTty();
    const printProgress = (e: JobProgressEvent): void => {
      if (e.id !== id) return;
      const pct = Math.round((e.progress ?? 0) * 100);
      if (tty) process.stdout.write(`\rprogress: ${pct}% (${e.state})    `);
      else process.stdout.write(`progress: ${pct}% (${e.state})\n`);
    };
    bundle.runner.on("job.progress", printProgress);
    const cleanupCancel = installCancelOnInterrupt(bundle.runner, bundle.jobs, id);
    try {
      const job = await bundle.runner.attach(id);
      if (tty) process.stdout.write("\n");
      await linkVideoAssetsFromRequest(bundle, job);
      await printDownloadedResult(bundle, job, options.out);
    } finally {
      cleanupCancel();
      bundle.runner.off("job.progress", printProgress);
    }
  } finally {
    bundle.db.close();
  }
}

async function runVideoTaskCancel(jobId: string): Promise<void> {
  const runtime = await loadCliRuntime();
  const bundle = buildRunner(runtime);
  try {
    const id = resolveJobId(bundle.jobs, jobId);
    const { job, providerState } = await refreshRemoteVideoTask(
      runtime,
      bundle,
      requireVideoJob(bundle.jobs.get(id), id),
    );
    if (isTerminalState(job.state)) {
      process.stdout.write(`${chalk.dim("already terminal:")} state=${job.state}\n`);
      return;
    }
    if (providerState === "succeeded") {
      process.stdout.write(`${chalk.dim("already complete:")} remote state=succeeded\n`);
      process.stdout.write(`${chalk.dim("download:")} imagent video download --id ${job.id}\n`);
      return;
    }
    if (job.providerJobId) {
      const provider = getVideoProvider(runtime, job.providerId);
      if (!provider.cancel) {
        throw new Error(`video provider '${job.providerId}' does not support cancelling video tasks`);
      }
      await provider.cancel({ providerId: job.providerId, providerJobId: job.providerJobId });
    }
    bundle.jobs.updateState(id, {
      state: "cancelled",
      finishedAt: Date.now(),
      errorMessage: "cancelled via CLI",
    });
    process.stdout.write(`${chalk.green("ok:")} cancelled ${id}\n`);
  } finally {
    bundle.db.close();
  }
}

async function runVideoTaskLs(options: { state?: string; limit?: string }): Promise<void> {
  const state = options.state;
  const limit = options.limit ? Number.parseInt(options.limit, 10) : 50;
  if (Number.isNaN(limit) || limit <= 0) {
    throw new Error(`--limit must be a positive integer (got '${options.limit}')`);
  }
  let stateFilter: JobState[] | undefined;
  if (state) {
    if (!isValidJobState(state)) {
      throw new Error(`--state must be one of: ${VALID_STATES.join("|")} (got '${state}')`);
    }
    stateFilter = [state];
  }

  const runtime = await loadCliRuntime();
  const bundle = buildRunner(runtime);
  try {
    const list = bundle.jobs.query({
      kind: "video",
      ...(stateFilter ? { state: stateFilter } : {}),
      limit,
      offset: 0,
    });
    if (list.length === 0) {
      process.stdout.write(`${chalk.dim("(no video jobs)")}\n`);
      return;
    }
    const snapshots = await refreshRemoteVideoTasks(runtime, bundle, list);
    for (const { job, providerState, progress } of snapshots) {
      const progressText =
        progress !== null && progress !== undefined ? `${Math.round(progress * 100)}%` : "—";
      const created = formatRelativeTime(job.createdAt);
      const remote = providerState ? `  ${chalk.dim(`remote=${providerState}`)}` : "";
      process.stdout.write(
        `${chalk.dim(job.id)}  ${stateBadge(job.state)}  ${chalk.dim(job.providerId)}  ${chalk.dim(progressText)}  ${chalk.dim(created)}${remote}${job.errorMessage ? `  ${chalk.red(excerpt(job.errorMessage, 30))}` : ""}\n`,
      );
    }
  } finally {
    bundle.db.close();
  }
}

async function refreshRemoteVideoTasks(
  runtime: CliRuntime,
  bundle: RunnerBundle,
  jobs: readonly Job[],
): Promise<RemoteVideoTaskSnapshot[]> {
  const snapshots = new Array<RemoteVideoTaskSnapshot>(jobs.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < jobs.length) {
      const index = next;
      next += 1;
      snapshots[index] = await refreshRemoteVideoTask(runtime, bundle, jobs[index]!);
    }
  };
  const workerCount = Math.min(VIDEO_TASK_LS_REFRESH_CONCURRENCY, jobs.length);
  await Promise.all(Array.from({ length: workerCount }, worker));
  return snapshots;
}

interface RemoteVideoTaskSnapshot {
  job: Job;
  providerState: string | null;
  progress: number | null | undefined;
  errorMessage: string | null | undefined;
}

async function refreshRemoteVideoTask(
  runtime: CliRuntime,
  bundle: RunnerBundle,
  job: Job,
): Promise<RemoteVideoTaskSnapshot> {
  if (isTerminalState(job.state) || !job.providerJobId) {
    return {
      job,
      providerState: null,
      progress: job.progress,
      errorMessage: job.errorMessage,
    };
  }

  const provider = getVideoProvider(runtime, job.providerId);
  const status = await provider.poll({ providerId: job.providerId, providerJobId: job.providerJobId });
  let updated = job;
  if (status.state === "queued" || status.state === "running") {
    updated = bundle.jobs.updateState(job.id, {
      state: status.state,
      progress: status.progress,
    });
  } else if (status.state === "failed" || status.state === "cancelled") {
    updated = bundle.jobs.updateState(job.id, {
      state: status.state,
      errorMessage: status.errorMessage ?? null,
      finishedAt: Date.now(),
    });
  } else {
    updated = bundle.jobs.updateState(job.id, { progress: 1 });
  }

  return {
    job: updated,
    providerState: status.state,
    progress: refreshedProgress(status.state, status.progress, updated.progress),
    errorMessage: status.errorMessage ?? updated.errorMessage,
  };
}

function refreshedProgress(
  providerState: string,
  statusProgress: number | undefined,
  persistedProgress: number | null | undefined,
): number | null | undefined {
  switch (providerState) {
    case "succeeded":
      return 1;
    case "failed":
    case "cancelled":
    case "queued":
    case "running":
    default:
      return statusProgress ?? persistedProgress;
  }
}

function isValidJobState(state: string): state is JobState {
  return VALID_STATE_VALUES.has(state);
}

async function prepareVideoRequest(
  runtime: CliRuntime,
  bundle: RunnerBundle,
  prompt: string,
  options: VideoGenerateOptions,
): Promise<{
  provider: VideoProvider;
  providerId: string;
  model: string;
  request: VideoRequest;
  slots: Awaited<ReturnType<typeof buildAssetSlots>>;
}> {
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

  const slots = await buildAssetSlots(runtime.resolver, bundle.db, {
    characters: options.character ?? [],
    objects: options.object ?? [],
    backgrounds: options.background ?? [],
    styles: options.style ?? [],
  });
  const allRefPaths = [...(options.ref ?? []), ...slots.referencePaths];
  const { references: cappedRefs, capped } = capReferences(allRefPaths, maxRefs);
  if (capped !== undefined) {
    process.stderr.write(`${chalk.yellow("warn:")} capped at ${capped} references for model '${model}'\n`);
  }
  const promptWithStyle = slots.stylePromptSnippets.length
    ? `${prompt} ${slots.stylePromptSnippets.join(" ")}`
    : prompt;

  return {
    provider,
    providerId,
    model,
    slots,
    request: {
      prompt: promptWithStyle,
      providerId,
      model,
      ...requestOptions,
      references: cappedRefs.map((p) => ({ path: p, role: "freeform" as const })),
      assetIds: slots.assetIds,
    },
  };
}

function getVideoProvider(runtime: CliRuntime, providerId: string): VideoProvider {
  const provider = runtime.videoRegistry.get(providerId);
  if (!provider) throw new Error(`video provider '${providerId}' is not configured`);
  return provider;
}

function requireVideoJob(job: Job | null, id: string): Job {
  if (!job) throw new Error(`no job with id '${id}'`);
  if (job.kind !== "video") throw new Error(`job '${id}' is not a video job`);
  return job;
}

async function linkVideoAssetsFromRequest(bundle: RunnerBundle, job: Job): Promise<void> {
  if (!job.resultItemId) return;
  const request = JSON.parse(job.requestJson) as VideoRequest;
  if (!request.assetIds || request.assetIds.length === 0) return;
  const assetRepo = new AssetRepository(bundle.db);
  for (const assetId of request.assetIds) {
    const asset = assetRepo.get(assetId);
    if (!asset) continue;
    bundle.gallery.addAssetLink({ itemId: job.resultItemId, assetId, role: asset.kind });
  }
}

async function printDownloadedResult(
  bundle: RunnerBundle,
  job: Job,
  outDir: string | undefined,
): Promise<void> {
  if (!job.resultItemId) {
    throw new Error("job completed without resultItemId");
  }
  const item = bundle.gallery.get(job.resultItemId);
  if (!item) throw new Error("result item missing from gallery_items");
  const abs = path.isAbsolute(item.relPath) ? item.relPath : path.join(bundle.files.dataDir, item.relPath);
  process.stdout.write(`${chalk.green("ok:")} ${abs}\n`);
  if (outDir) {
    try {
      const copied = await copyResultToDir(abs, outDir);
      process.stdout.write(`${chalk.green("copied to:")} ${copied}\n`);
    } catch (err) {
      process.stderr.write(`${chalk.yellow("warn:")} failed to copy result: ${(err as Error).message}\n`);
    }
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
    let hint: string;
    switch (code) {
      case "ENOENT":
        hint = "source file not found or was removed";
        break;
      case "EACCES":
      case "EPERM":
        hint = "permission denied";
        break;
      case "ENOSPC":
        hint = "not enough disk space";
        break;
      default:
        hint = `unexpected file system error: ${(err as Error).message}`;
    }
    throw new Error(
      `generation succeeded, but --out copy from '${sourcePath}' to '${targetPath}' failed: ${hint}`,
    );
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
    // Unknown capabilities means the catalog cannot provide dynamic guidance,
    // so keep the model-option request surface available and let providers validate.
    return ["durationSec", "fps", "resolution", "aspectRatio", "firstFrame", "lastFrame"];
  }
  const keys: string[] = [];
  if (caps.durationsSec || caps.maxDurationSec) keys.push("durationSec");
  if (caps.fpsOptions && caps.fpsOptions.length > 0) keys.push("fps");
  if (caps.resolutions && caps.resolutions.length > 0) keys.push("resolution");
  if (caps.aspectRatios && caps.aspectRatios.length > 0) keys.push("aspectRatio");
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

function stateBadge(state: string): string {
  switch (state) {
    case "queued":
      return chalk.dim(state);
    case "running":
      return chalk.cyan(state);
    case "succeeded":
      return chalk.green(state);
    case "failed":
      return chalk.red(state);
    case "cancelled":
      return chalk.yellow(state);
    default:
      return state;
  }
}
