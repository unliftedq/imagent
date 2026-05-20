import { randomUUID } from "node:crypto";

import type { GenerationIntent, Job, JobProgressEvent, VideoRequest } from "@imagent/core";
import chalk from "chalk";

import { installCancelOnInterrupt } from "../job-control.js";
import { buildRunner, loadCliRuntime, type RunnerBundle } from "../runtime.js";
import { createSpinner } from "../spinner.js";
import { printDownloadedResult } from "./results.js";
import { prepareVideoRequest } from "./request.js";
import type { VideoGenerateOptions } from "./shared.js";

export async function runVideoGenerate(prompt: string, options: VideoGenerateOptions): Promise<void> {
  if (options.out && !options.wait) {
    throw new Error("--out only applies with --wait; use `imagent video download --id <jobId> --out <dir>` after submission");
  }
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
  const spinner = createSpinner({
    label: `generating video with ${providerId}/${model}`,
  });
  const onProgress = (e: JobProgressEvent): void => {
    spinner.update({ progress: e.progress ?? null, state: e.state });
  };
  bundle.runner.on("job.progress", onProgress);

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
  spinner.start();

  const job = await completed.finally(() => {
    spinner.stop();
    cleanupCancel();
    bundle.runner.off("job.progress", onProgress);
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
