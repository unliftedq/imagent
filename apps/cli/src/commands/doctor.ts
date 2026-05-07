import { createFileConfigStore } from "@imagent/config";
import {
  countFtsTables,
  createPathResolver,
  ensureDataDir,
  openDatabase,
} from "@imagent/persistence";
import { configuredProviderCount, TOTAL_PROVIDER_COUNT } from "@imagent/providers";
import chalk from "chalk";

import { CLI_VERSION } from "../version.js";
import { listProviderModels } from "./discovery.js";
import { loadCliRuntime } from "./runtime.js";

/**
 * `imagent doctor` — first-run friendly health check. Creates the data dir,
 * runs migrations, prints DB / FTS / config / providers status. No network
 * calls in M1; provider-readiness pings arrive in M2.
 */
export async function runDoctor(): Promise<void> {
  const resolver = createPathResolver();
  await ensureDataDir(resolver);

  const dbPath = resolver.dbFile();
  const db = openDatabase(dbPath);
  const ftsCount = countFtsTables(db);
  const ftsStatus = ftsCount >= 2 ? "ok" : `partial (${ftsCount}/2)`;
  db.close();

  const configPath = resolver.configFile();
  const configStore = createFileConfigStore(configPath);
  const configExistedBefore = await fileExists(configPath);
  await configStore.loadConfig(); // creates with defaults if missing
  const configLabel = configExistedBefore ? "loaded" : "defaults";

  const runtime = await loadCliRuntime();
  const configured = configuredProviderCount(runtime.secrets);
  const configuredProviders = listProviderModels(runtime, { configuredOnly: true });

  // ----- print --------------------------------------------------------
  process.stdout.write(`${chalk.bold(`imagent v${CLI_VERSION}`)}\n`);
  process.stdout.write(`${chalk.dim("DB:        ")}${dbPath} ${ftsBadge(ftsStatus)}\n`);
  process.stdout.write(`${chalk.dim("Config:    ")}${configPath} (${configLabel})\n`);
  process.stdout.write(
    `${chalk.dim("Providers: ")}${configured} / ${TOTAL_PROVIDER_COUNT} configured\n`,
  );
  for (const provider of configuredProviders) {
    const groups: string[] = [];
    if (provider.models.image) groups.push(`image: ${provider.models.image.join(", ")}`);
    if (provider.models.video) groups.push(`video: ${provider.models.video.join(", ")}`);
    process.stdout.write(`${chalk.dim("  - ")}${provider.id} | ${groups.join("; ")}\n`);
  }
  if (configuredProviders.length === 0) {
    process.stdout.write(`${chalk.dim("  - none configured")}\n`);
  }
}

function ftsBadge(status: string): string {
  return status === "ok" ? chalk.green(`(FTS=${status})`) : chalk.yellow(`(FTS=${status})`);
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
