import { countFtsTables, openDatabase } from "@imagent/persistence";
import {
  configuredProviderCount,
  effectiveImageOfferings,
  effectiveProviderDisplayName,
  effectiveVideoOfferings,
  TOTAL_PROVIDER_COUNT,
} from "@imagent/providers";
import chalk from "chalk";

import { loadCliRuntime } from "../support/runtime.js";
import { CLI_VERSION } from "../version.js";

/**
 * `imagent doctor` — first-run friendly health check. Loads the runtime
 * (running the migration if needed), prints DB / FTS / config status, and
 * breaks down each provider with the concrete image+video models it would
 * expose. Useful for agents that need to know which provider/model pairs are
 * actually callable before invoking `imagent image|video generate`.
 */
export async function runDoctor(): Promise<void> {
  const runtime = await loadCliRuntime();
  const { resolver, catalog, config, secrets, imageRegistry, videoRegistry } = runtime;

  const dbPath = resolver.dbFile();
  const db = openDatabase(dbPath);
  const ftsCount = countFtsTables(db);
  const ftsStatus = ftsCount >= 2 ? "ok" : `partial (${ftsCount}/2)`;
  db.close();

  const configPath = resolver.configFile();
  const configExistedBefore = await fileExists(configPath);
  const configLabel = configExistedBefore ? "loaded" : "defaults";
  const configured = configuredProviderCount(secrets, config.providers);

  // ----- print --------------------------------------------------------
  process.stdout.write(`${chalk.bold(`imagent v${CLI_VERSION}`)}\n`);
  process.stdout.write(`${chalk.dim("DB:        ")}${dbPath} ${ftsBadge(ftsStatus)}\n`);
  process.stdout.write(`${chalk.dim("Config:    ")}${configPath} (${configLabel})\n`);
  process.stdout.write(`${chalk.dim("Catalog:   ")}${resolver.catalogFile()}\n`);
  process.stdout.write(
    `${chalk.dim("Providers: ")}${configured} / ${TOTAL_PROVIDER_COUNT} configured\n\n`,
  );

  // Iterate the union of catalog + config provider ids so custom OpenAI
  // providers (which only live in config) appear too.
  const providerIds = [
    ...new Set([
      ...Object.keys(catalog.providers),
      ...Object.keys(config.providers.customOpenAI ?? {}),
    ]),
  ].sort();

  for (const providerId of providerIds) {
    const display = effectiveProviderDisplayName(catalog, config.providers, providerId);
    const imageProvider = imageRegistry.get(providerId);
    const videoProvider = videoRegistry.get(providerId);
    const isConfigured = Boolean(imageProvider || videoProvider);
    const status = isConfigured
      ? chalk.green("configured")
      : chalk.yellow("missing credentials");

    process.stdout.write(`${chalk.bold(providerId)} ${chalk.dim(`(${display})`)}  ${status}\n`);

    const imageOfferings = effectiveImageOfferings(catalog, config.providers, providerId);
    const videoOfferings = effectiveVideoOfferings(catalog, config.providers, providerId);

    if (imageOfferings.length === 0 && videoOfferings.length === 0) {
      const hint =
        providerId === "azure"
          ? `(no deployments — run \`imagent config provider add azure <deployment-id> --model <canonical>\`)`
          : "(no offerings)";
      process.stdout.write(`  ${chalk.dim(hint)}\n`);
      if (!isConfigured) {
        process.stdout.write(
          `  ${chalk.dim("→ run `imagent config set " + secretHintFor(providerId) + "` to enable")}\n`,
        );
      }
      continue;
    }

    if (imageOfferings.length > 0) {
      const ids = imageOfferings.map((m) => m.id).join(", ");
      process.stdout.write(`  ${chalk.cyan("image:")} ${ids}\n`);
    }
    if (videoOfferings.length > 0) {
      const ids = videoOfferings.map((m) => m.id).join(", ");
      process.stdout.write(`  ${chalk.magenta("video:")} ${ids}\n`);
    }

    if (!isConfigured) {
      process.stdout.write(
        `  ${chalk.dim("→ run `imagent config set " + secretHintFor(providerId) + "` to enable")}\n`,
      );
    }
  }

  process.stdout.write(
    `\n${chalk.dim("hint: `imagent models` lists every provider/model; `imagent options --provider <id> --model <id>` shows a model's request options.")}\n`,
  );
}

function ftsBadge(status: string): string {
  return status === "ok" ? chalk.green(`(FTS=${status})`) : chalk.yellow(`(FTS=${status})`);
}

function secretHintFor(providerId: string): string {
  switch (providerId) {
    case "azure":
      return "azure.endpoint <url> && imagent config set azure.apiKey <key>";
    case "bytedance":
      return "bytedance.endpoint <url> && imagent config set bytedance.apiKey <key>";
    default:
      return `${providerId}.apiKey <key>`;
  }
}

async function fileExists(path: string): Promise<boolean> {
  const fs = await import("node:fs/promises");
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}
