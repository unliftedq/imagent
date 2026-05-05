#!/usr/bin/env node
import { Command } from "commander";

import { registerAssetCommands } from "./commands/asset.js";
import { registerCatalogCommands } from "./commands/catalog.js";
import { registerConfigCommand } from "./commands/config.js";
import { runDoctor } from "./commands/doctor.js";
import { registerGalleryCommands } from "./commands/gallery.js";
import { registerImageCommand } from "./commands/image.js";
import { registerJobCommands } from "./commands/job.js";
import { registerMcpCommand } from "./commands/mcp.js";
import { registerVideoCommand } from "./commands/video.js";
import { CLI_VERSION } from "./version.js";

async function main(): Promise<void> {
  const program = new Command();
  program
    .name("imagent")
    .description("imagent CLI — local image and video generation")
    .version(CLI_VERSION);

  program
    .command("doctor")
    .description("Health check: DB path, FTS status, configured providers")
    .action(async () => {
      try {
        await runDoctor();
      } catch (err) {
        process.stderr.write(`doctor failed: ${(err as Error).message}\n`);
        process.exitCode = 1;
      }
    });

  // M2 commands.
  registerImageCommand(program);
  registerConfigCommand(program);
  registerCatalogCommands(program);

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
