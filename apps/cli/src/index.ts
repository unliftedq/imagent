#!/usr/bin/env node
import { Command } from "commander";

import { registerAssetCommands } from "./commands/asset.js";
import { registerConfigCommand } from "./commands/config.js";
import { runDoctor } from "./commands/doctor.js";
import { registerGalleryCommands } from "./commands/gallery.js";
import { registerImageCommand } from "./commands/image.js";
import { registerJobCommands } from "./commands/job.js";
import { registerMcpCommand } from "./commands/mcp.js";
import { registerModelsCommand, registerOptionsCommand } from "./commands/models.js";
import { registerVideoCommand } from "./commands/video.js";
import { CLI_VERSION } from "./version.js";

async function main(): Promise<void> {
  const program = new Command();
  program
    .name("imagent")
    .description(
      [
        "imagent — local-first image and video generation CLI.",
        "",
        "Suggested workflow for agents:",
        "  1. `imagent doctor`                                 — see which providers are configured and what models they expose.",
        "  2. `imagent models [--kind image|video]`            — full provider/model inventory across the catalog.",
        "  3. `imagent options --provider <id> --model <id>`   — exact request options/defaults/limits for the chosen model.",
        "  4. `imagent image|video <prompt> --provider <id> --model <id> --option key=value [--out <dir>]`",
        "",
        "All assets, jobs, and gallery items live under ~/.imagent (override with `imagent config path`).",
      ].join("\n"),
    )
    .version(CLI_VERSION);

  program
    .command("doctor")
    .description(
      "Health check: data dir, DB/FTS, config files, and which providers + models are usable right now",
    )
    .action(async () => {
      try {
        await runDoctor();
      } catch (err) {
        process.stderr.write(`doctor failed: ${(err as Error).message}\n`);
        process.exitCode = 1;
      }
    });

  // Discovery commands (use these first to learn what to pass to image/video).
  registerModelsCommand(program);
  registerOptionsCommand(program);

  // M2 commands.
  registerImageCommand(program);
  registerConfigCommand(program);

  // M3 commands.
  registerAssetCommands(program);
  registerGalleryCommands(program);
  registerVideoCommand(program);
  registerJobCommands(program);
  registerMcpCommand(program);

  await program.parseAsync(process.argv);
}

main().catch((err) => {
  process.stderr.write(`${(err as Error).stack ?? err}\n`);
  process.exit(1);
});
