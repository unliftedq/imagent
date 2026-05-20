import type { Job, JobProgressEvent, JobState } from "@imagent/core";
import chalk from "chalk";

import { installCancelOnInterrupt, isTerminalState, resolveJobId } from "../job-control.js";
import { buildRunner, loadCliRuntime, type CliRuntime, type RunnerBundle } from "../runtime.js";
import { createSpinner } from "../spinner.js";
import { excerpt, formatRelativeTime } from "../util.js";
import { linkVideoAssetsFromRequest, printDownloadedResult } from "./results.js";
import {
  getVideoProvider,
  isValidJobState,
  refreshedProgress,
  requireVideoJob,
  stateBadge,
  type RemoteVideoTaskSnapshot,
  VALID_STATES,
  VIDEO_TASK_LS_REFRESH_CONCURRENCY,
} from "./shared.js";

export async function runVideoTaskGet(jobId: string): Promise<void> {
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

export async function runVideoDownload(
  jobId: string | undefined,
  options: { out?: string },
): Promise<void> {
  if (!jobId) throw new Error("missing required job id; pass <jobId> or --id <jobId>");
  const runtime = await loadCliRuntime();
  const bundle = buildRunner(runtime);
  try {
    const id = resolveJobId(bundle.jobs, jobId);
    requireVideoJob(bundle.jobs.get(id), id);

    const spinner = createSpinner({ label: `downloading video ${id.slice(0, 8)}` });
    const onProgress = (e: JobProgressEvent): void => {
      if (e.id !== id) return;
      spinner.update({ progress: e.progress ?? null, state: e.state });
    };
    bundle.runner.on("job.progress", onProgress);
    const cleanupCancel = installCancelOnInterrupt(bundle.runner, bundle.jobs, id);
    spinner.start();
    try {
      const job = await bundle.runner.attach(id);
      spinner.stop();
      await linkVideoAssetsFromRequest(bundle, job);
      await printDownloadedResult(bundle, job, options.out);
    } finally {
      spinner.stop();
      cleanupCancel();
      bundle.runner.off("job.progress", onProgress);
    }
  } finally {
    bundle.db.close();
  }
}

export async function runVideoTaskCancel(jobId: string): Promise<void> {
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

export async function runVideoTaskLs(options: { state?: string; limit?: string }): Promise<void> {
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

export async function refreshRemoteVideoTasks(
  runtime: CliRuntime,
  bundle: RunnerBundle,
  jobs: readonly Job[],
): Promise<RemoteVideoTaskSnapshot[]> {
  const snapshots = new Array<RemoteVideoTaskSnapshot | undefined>(jobs.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < jobs.length) {
      const index = next;
      next += 1;
      const job = jobs[index];
      if (!job) continue;
      snapshots[index] = await refreshRemoteVideoTask(runtime, bundle, job);
    }
  };
  const workerCount = Math.min(VIDEO_TASK_LS_REFRESH_CONCURRENCY, jobs.length);
  await Promise.all(Array.from({ length: workerCount }, worker));
  return snapshots.flatMap((snapshot) => (snapshot ? [snapshot] : []));
}

export async function refreshRemoteVideoTask(
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
