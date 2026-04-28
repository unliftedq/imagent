#!/usr/bin/env node
import { Command } from "commander";

import { runDoctor } from "./commands/doctor.js";
import { registerStubCommands } from "./commands/stubs.js";
import { CLI_VERSION } from "./version.js";

async function main(): Promise<void> {
  const program = new Command();
  program
    .name("imagine")
    .description("imagine-studio CLI — local image and video generation")
    .version(CLI_VERSION);

  // M1: only doctor is fully implemented. The rest are registered so
  // `imagine --help` exposes the full v1 surface and each one prints
  // "not implemented (Mn)" until it's wired up.
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

  registerStubCommands(program);

  await program.parseAsync(process.argv);
}

main().catch((err) => {
  process.stderr.write(`${(err as Error).stack ?? err}\n`);
  process.exit(1);
});
