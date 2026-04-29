import {
  createEnvSecretsStore,
  createFileConfigStore,
  createFileSecretsStore,
  mergeSecrets,
  type ProviderSecrets,
} from "@imagine/config";
import { countFtsTables, createPathResolver, ensureDataDir, openDatabase } from "@imagine/persistence";
import { TOTAL_PROVIDER_COUNT, configuredProviderCount } from "@imagine/providers";
import chalk from "chalk";

import { CLI_VERSION } from "../version.js";

/**
 * `imagine doctor` — first-run friendly health check. Creates the data dir,
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

  const fileSecrets = await createFileSecretsStore(resolver.secretsFile()).loadSecrets();
  const envSecrets = await createEnvSecretsStore(process.env).loadSecrets();
  const secrets: ProviderSecrets = mergeSecrets(fileSecrets, envSecrets);
  const configured = configuredProviderCount(secrets);

  // ----- print --------------------------------------------------------
  process.stdout.write(`${chalk.bold(`imagine v${CLI_VERSION}`)}\n`);
  process.stdout.write(`${chalk.dim("DB:        ")}${dbPath} ${ftsBadge(ftsStatus)}\n`);
  process.stdout.write(`${chalk.dim("Config:    ")}${configPath} (${configLabel})\n`);
  process.stdout.write(
    `${chalk.dim("Providers: ")}${configured} / ${TOTAL_PROVIDER_COUNT} configured\n`,
  );
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
