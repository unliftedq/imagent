import path from "node:path";

import type {
  Job,
  JobProgressEvent,
  JobState,
} from "@imagent/core";
import {
  GalleryRepository,
  JobRepository,
  createPathResolver,
  ensureDataDir,
  openDatabase,
} from "@imagent/persistence";
import chalk from "chalk";
import type { Command } from "commander";

import { buildRunner, loadCliRuntime } from "./runtime.js";
import { excerpt, formatRelativeTime, isTty, truncate } from "./util.js";

const VALID_STATES: JobState[] = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
];

export function registerJobCommands(program: Command): void {
  const job = program
    .command("job")
    .description(
      [
        "Inspect, cancel, or watch generation jobs.",
        "",
        "Submitted video jobs run in the background; use `job watch <id>` from the same machine to resume polling. Jobs are also persisted in ~/.imagent/data/imagent.db so `job ls` and `job status` work across CLI sessions.",
      ].join("\n"),
    );

  job
    .command("status <jobId>")
    .description("Print current state and progress for a job")
    .action(async (jobId: string) => {
      try {
        await runStatus(jobId);
      } catch (err) {
        process.stderr.write(`${chalk.red("job status failed:")} ${(err as Error).message}\n`);
        process.exit(1);
      }
    });

  job
    .command("cancel <jobId>")
    .description("Cancel an in-flight job (DB-level + provider hint)")
    .action(async (jobId: string) => {
      try {
        await runCancel(jobId);
      } catch (err) {
        process.stderr.write(`${chalk.red("job cancel failed:")} ${(err as Error).message}\n`);
        process.exit(1);
      }
    });

  job
    .command("watch <jobId>")
    .description("Resume polling a queued/running job and stream progress")
    .action(async (jobId: string) => {
      try {
        await runWatch(jobId);
      } catch (err) {
        process.stderr.write(`${chalk.red("job watch failed:")} ${(err as Error).message}\n`);
        process.exit(1);
      }
    });

  job
    .command("ls")
    .description("List jobs (optionally filtered)")
    .option("--state <state>", `One of: ${VALID_STATES.join("|")}`)
    .option("--kind <kind>", "image|video")
    .option("--limit <n>", "Maximum rows to print", "50")
    .action(async (options: { state?: string; kind?: string; limit?: string }) => {
      try {
        await runLs(options);
      } catch (err) {
        process.stderr.write(`${chalk.red("job ls failed:")} ${(err as Error).message}\n`);
        process.exit(1);
      }
    });
}

async function runStatus(jobId: string): Promise<void> {
  const resolver = createPathResolver();
  await ensureDataDir(resolver);
  const db = openDatabase(resolver.dbFile());
  try {
    const repo = new JobRepository(db);
    const j = repo.get(jobId);
    if (!j) throw new Error(`no job with id '${jobId}'`);
    const lines: string[] = [];
    lines.push(`${chalk.dim("id:        ")}${j.id}`);
    lines.push(`${chalk.dim("kind:      ")}${j.kind}`);
    lines.push(`${chalk.dim("state:     ")}${stateBadge(j.state)}`);
    lines.push(`${chalk.dim("provider:  ")}${j.providerId}`);
    if (j.providerJobId) lines.push(`${chalk.dim("provJobId: ")}${j.providerJobId}`);
    if (j.progress !== null && j.progress !== undefined) {
      lines.push(`${chalk.dim("progress:  ")}${Math.round(j.progress * 100)}%`);
    }
    if (j.errorMessage) lines.push(`${chalk.dim("error:     ")}${j.errorMessage}`);
    if (j.resultItemId) lines.push(`${chalk.dim("result:    ")}${j.resultItemId}`);
    lines.push(`${chalk.dim("created:   ")}${new Date(j.createdAt).toISOString()}`);
    lines.push(`${chalk.dim("updated:   ")}${new Date(j.updatedAt).toISOString()}`);
    if (j.finishedAt) lines.push(`${chalk.dim("finished:  ")}${new Date(j.finishedAt).toISOString()}`);
    process.stdout.write(`${lines.join("\n")}\n`);
  } finally {
    db.close();
  }
}

async function runCancel(jobId: string): Promise<void> {
  // Two-step: persist state=cancelled in DB so any other process polling will
  // bail on its next tick; plus, if a runner instance in *this* process owns
  // the job, ask it to cancel locally too.
  const runtime = await loadCliRuntime();
  const { db, jobs, runner } = buildRunner(runtime);
  try {
    const j = jobs.get(jobId);
    if (!j) throw new Error(`no job with id '${jobId}'`);
    if (j.state === "succeeded" || j.state === "failed" || j.state === "cancelled") {
      process.stdout.write(`${chalk.dim("already terminal:")} state=${j.state}\n`);
      return;
    }
    jobs.updateState(jobId, {
      state: "cancelled",
      finishedAt: Date.now(),
      errorMessage: "cancelled via CLI",
    });
    if (runner.isRunning(jobId)) {
      await runner.cancel(jobId);
    }
    process.stdout.write(`${chalk.green("ok:")} cancelled ${jobId}\n`);
  } finally {
    db.close();
  }
}

async function runWatch(jobId: string): Promise<void> {
  const runtime = await loadCliRuntime();
  const { db, jobs, gallery, runner } = buildRunner(runtime);
  try {
    const j = jobs.get(jobId);
    if (!j) throw new Error(`no job with id '${jobId}'`);

    if (j.state === "succeeded") {
      const item = j.resultItemId ? gallery.get(j.resultItemId) : null;
      const abs = item
        ? path.isAbsolute(item.relPath)
          ? item.relPath
          : path.join(runtime.resolver.dataDir, item.relPath)
        : "(no file)";
      process.stdout.write(`${chalk.green("ok:")} ${abs}\n`);
      return;
    }
    if (j.state === "failed" || j.state === "cancelled") {
      throw new Error(j.errorMessage ?? `job ended in state '${j.state}'`);
    }
    if (j.kind === "image") {
      // Image jobs aren't resumable. We mark them failed via attach() below;
      // first surface a nicer error if a partial file landed somewhere.
      const item = j.resultItemId ? gallery.get(j.resultItemId) : null;
      const where = item
        ? path.isAbsolute(item.relPath)
          ? item.relPath
          : path.join(runtime.resolver.dataDir, item.relPath)
        : "(no file)";
      try {
        await runner.attach(jobId);
      } catch {
        // attach() throws on the failure path we just wrote.
      }
      process.stderr.write(
        `${chalk.red("error:")} image jobs are not resumable; the file is at ${where} if it succeeded\n`,
      );
      process.exit(1);
    }

    // video: stream progress until completion.
    const tty = isTty();
    const onProgress = (e: JobProgressEvent): void => {
      const pct = Math.round((e.progress ?? 0) * 100);
      if (tty) process.stdout.write(`\rprogress: ${pct}% (${e.state})    `);
      else process.stdout.write(`progress: ${pct}% (${e.state})\n`);
    };
    runner.on("job.progress", onProgress);
    try {
      const final = await runner.attach(jobId);
      if (tty) process.stdout.write("\n");
      const item = final.resultItemId ? gallery.get(final.resultItemId) : null;
      const abs = item
        ? path.isAbsolute(item.relPath)
          ? item.relPath
          : path.join(runtime.resolver.dataDir, item.relPath)
        : "(no file)";
      process.stdout.write(`${chalk.green("ok:")} ${abs}\n`);
    } finally {
      runner.off("job.progress", onProgress);
    }
  } finally {
    db.close();
  }
}

async function runLs(options: { state?: string; kind?: string; limit?: string }): Promise<void> {
  if (options.state && !VALID_STATES.includes(options.state as JobState)) {
    throw new Error(`--state must be one of: ${VALID_STATES.join("|")} (got '${options.state}')`);
  }
  if (options.kind && !["image", "video"].includes(options.kind)) {
    throw new Error(`--kind must be 'image' or 'video' (got '${options.kind}')`);
  }
  const limit = options.limit ? Number.parseInt(options.limit, 10) : 50;
  if (Number.isNaN(limit) || limit <= 0) {
    throw new Error(`--limit must be a positive integer (got '${options.limit}')`);
  }

  const resolver = createPathResolver();
  await ensureDataDir(resolver);
  const db = openDatabase(resolver.dbFile());
  try {
    const repo = new JobRepository(db);
    const list = repo.query({
      ...(options.state ? { state: [options.state as JobState] } : {}),
      ...(options.kind ? { kind: options.kind as "image" | "video" } : {}),
      limit,
      offset: 0,
    });
    if (list.length === 0) {
      process.stdout.write(`${chalk.dim("(no jobs)")}\n`);
      return;
    }
    for (const j of list) {
      const id = truncate(j.id, 8);
      const kind = j.kind === "video" ? chalk.magenta("[video]") : chalk.cyan("[image]");
      const provider = j.providerId;
      const progress =
        j.progress !== null && j.progress !== undefined
          ? `${Math.round(j.progress * 100)}%`
          : "—";
      const created = formatRelativeTime(j.createdAt);
      process.stdout.write(
        `${chalk.dim(id)}  ${kind}  ${stateBadge(j.state)}  ${chalk.dim(provider)}  ${chalk.dim(progress)}  ${chalk.dim(created)}${j.errorMessage ? `  ${chalk.red(excerpt(j.errorMessage, 30))}` : ""}\n`,
      );
    }
  } finally {
    db.close();
  }
}

function stateBadge(state: JobState): string {
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
