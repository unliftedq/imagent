import {
  createFileConfigStore,
  createFileSecretsStore,
} from "@imagent/config";
import { createPathResolver, ensureDataDir } from "@imagent/persistence";
import { loadCatalog } from "@imagent/providers";
import type { Command } from "commander";

import { runGet, runSet } from "../support/config/get-set.js";
import {
  type ProviderAddOptions,
  runProviderAdd,
  runProviderList,
  runProviderRm,
} from "../support/config/provider-routing.js";
import { runReset } from "../support/config/reset.js";

export function registerConfigCommand(program: Command): void {
  const config = program
    .command("config")
    .description(
      [
        "Inspect and edit local provider credentials in ~/.imagent/secrets.json (and the preferences file at ~/.imagent/config.json).",
        "Recognised dotted keys: <vendor>.apiKey, azure.endpoint, byteplus.endpoint, volcengine.endpoint, <vendor>.baseUrl, image.defaultModel, video.defaultModel.",
        "Vendors: openai | azure | google | flux-bfl | byteplus | volcengine | xai | minimax.",
        "Use `imagent models` and `imagent options` to inspect the model catalog instead of reading catalog.json by hand.",
      ].join("\n"),
    );

  config
    .command("set <key> <value>")
    .description(
      "Set config. Examples: `imagent config set openai.apiKey sk-...`, `imagent config set image.defaultModel openai:gpt-image-2`, `imagent config set azure.endpoint https://...`.",
    )
    .action(async (key: string, value: string) => {
      try {
        await runSet(key, value);
      } catch (err) {
        process.stderr.write(`config set failed: ${(err as Error).message}\n`);
        process.exitCode = 1;
      }
    });

  config
    .command("get [key]")
    .description(
      "Print a config value (apiKey fields are masked). Omit [key] to dump configured values as JSON.",
    )
    .action(async (key: string | undefined) => {
      try {
        await runGet(key);
      } catch (err) {
        process.stderr.write(`config get failed: ${(err as Error).message}\n`);
        process.exitCode = 1;
      }
    });

  config
    .command("path")
    .description("Print the absolute paths of config.json, catalog.json, and secrets.json")
    .action(async () => {
      const resolver = createPathResolver();
      await ensureDataDir(resolver);
      await createFileConfigStore(resolver.configFile()).loadConfig();
      await createFileSecretsStore(resolver.secretsFile()).loadSecrets();
      await loadCatalog({ path: resolver.catalogFile() });
      process.stdout.write(`config:  ${resolver.configFile()}\n`);
      process.stdout.write(`catalog: ${resolver.catalogFile()}\n`);
      process.stdout.write(`secrets: ${resolver.secretsFile()}\n`);
    });

  config
    .command("reset <target>")
    .description(
      "Reset a state file to its default. <target> is one of: catalog | secrets | config. Pass --force to skip the confirmation prompt.",
    )
    .option("--force", "Skip the confirmation prompt", false)
    .action(async (target: string, options: { force?: boolean }) => {
      try {
        await runReset(target, options);
      } catch (err) {
        process.stderr.write(`config reset failed: ${(err as Error).message}\n`);
        process.exitCode = 1;
      }
    });

  const provider = config
    .command("provider")
    .description(
      [
        "Manage per-user provider routing in config.json (Azure deployment names, custom OpenAI-compatible model lists).",
        "Use this when you have an Azure deployment named differently from the canonical model id, or when registering a custom OpenAI-compatible provider's models. The runtime merges these entries on top of the bundled catalog.",
      ].join("\n"),
    );

  provider
    .command("add <provider> <id>")
    .description(
      "Register an offering. <provider> is `azure` or a custom provider id; <id> is the deployment/model id the provider exposes. Pass --model <canonical-id> to bind it to a catalog model.",
    )
    .requiredOption(
      "--model <canonical-id>",
      "Canonical model id (see `imagent models --json`); the offering inherits its capabilities/defaults",
    )
    .option("--kind <kind>", "image | video (default: image)", "image")
    .option("--display-name <name>", "Optional friendly name shown in `imagent models`")
    .option(
      "--display-name-provider <name>",
      "Override the provider's display name (custom providers; saved to config.providers.<id>.displayName)",
    )
    .action(async (providerId: string, offeringId: string, options: ProviderAddOptions) => {
      try {
        await runProviderAdd(providerId, offeringId, options);
      } catch (err) {
        process.stderr.write(`config provider add failed: ${(err as Error).message}\n`);
        process.exitCode = 1;
      }
    });

  provider
    .command("rm <provider> <id>")
    .description("Remove an offering from the provider's routing list.")
    .option("--kind <kind>", "image | video (default: image)", "image")
    .action(async (providerId: string, offeringId: string, options: { kind?: string }) => {
      try {
        await runProviderRm(providerId, offeringId, options);
      } catch (err) {
        process.stderr.write(`config provider rm failed: ${(err as Error).message}\n`);
        process.exitCode = 1;
      }
    });

  provider
    .command("list [provider]")
    .description(
      "Print the per-user routing block for a single provider, or every configured provider when [provider] is omitted.",
    )
    .option("--json", "Emit machine-readable JSON instead of the human-friendly table", false)
    .action(async (providerId: string | undefined, options: { json?: boolean }) => {
      try {
        await runProviderList(providerId, options);
      } catch (err) {
        process.stderr.write(`config provider list failed: ${(err as Error).message}\n`);
        process.exitCode = 1;
      }
    });
}
