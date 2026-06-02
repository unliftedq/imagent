import chalk from "chalk";
import type { Command } from "commander";

import { runVideoGenerate } from "../support/video/generate.js";
import { runVideoDownload, runVideoTaskCancel, runVideoTaskGet, runVideoTaskLs } from "../support/video/tasks.js";
import { collect } from "../support/util.js";
import type { VideoGenerateOptions } from "../support/video/shared.js";
import { VALID_STATES } from "../support/video/shared.js";

export function registerVideoCommand(program: Command): void {
  const video = program
    .command("video")
    .summary("Video generation commands")
    .description(
      [
        "Submit, track, and download video generation jobs.",
        "Use `imagent video generate <prompt>` to submit a video job. By default it returns after provider submission; pass `--wait` to poll until completion and download into the gallery.",
      ].join("\n"),
    );

  video
    .command("generate <prompt>")
    .summary("Submit a video generation job from a text prompt")
    .description(
      [
        "Submit a video generation job from a text prompt.",
        "Without --provider/--model the CLI falls back to the configured video default model. Without --wait, the command exits after the provider accepts the job and prints commands for status/download. With --wait, it polls until completion and downloads the completed video into the gallery; --out only applies with --wait.",
        "Run `imagent models --kind video` to list providers/models and `imagent options --provider <id> --model <id> --kind video` for the model's exact `--option key=value` keys (durationSec, resolution, aspectRatio, fps, firstFrame, lastFrame, ...).",
      ].join("\n"),
    )
    .option(
      "--provider <id>",
      "Video provider id (byteplus | volcengine | google | xai | minimax). See `imagent doctor`.",
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
    .option("--out <dir>", "With --wait, copy the downloaded result to this directory")
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
