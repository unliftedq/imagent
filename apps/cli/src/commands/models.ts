import type { Command } from "commander";

import { runModels } from "../support/models/list.js";
import { runOptions } from "../support/models/options.js";
import type { ModelsOptions, OptionsCommandArgs } from "../support/models/shared.js";

export function registerModelsCommand(program: Command): void {
  program
    .command("models")
    .description("List every provider/model available in the catalog (image + video)")
    .option("--kind <kind>", "Filter by kind: 'image' or 'video'")
    .option("--provider <id>", "Filter to a single provider id")
    .option("--configured", "Only show providers with credentials in secrets.json", false)
    .option("--json", "Emit machine-readable JSON instead of the human-friendly table", false)
    .action(async (options: ModelsOptions) => {
      try {
        await runModels(options);
      } catch (err) {
        process.stderr.write(`models failed: ${(err as Error).message}\n`);
        process.exitCode = 1;
      }
    });
}

export function registerOptionsCommand(program: Command): void {
  program
    .command("options")
    .description(
      "Show the request options/capabilities for a specific provider+model (use before `imagent image` / `imagent video`)",
    )
    .requiredOption("--provider <id>", "Provider id (e.g. openai, azure, google, flux-bfl, bytedance, xai)")
    .requiredOption("--model <id>", "Model/offering id as it appears under that provider")
    .option("--kind <kind>", "Disambiguate when the same id exists for both kinds: 'image' or 'video'")
    .option("--json", "Emit machine-readable JSON instead of the human-friendly view", false)
    .action(async (options: OptionsCommandArgs) => {
      try {
        await runOptions(options);
      } catch (err) {
        process.stderr.write(`options failed: ${(err as Error).message}\n`);
        process.exitCode = 1;
      }
    });
}
