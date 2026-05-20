import { promises as fs } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline/promises";

import { DEFAULT_CONFIG } from "@imagent/config";
import { createPathResolver, ensureDataDir } from "@imagent/persistence";
import chalk from "chalk";

import { isResetTarget, RESET_TARGETS, type ResetTarget } from "./shared.js";

export async function runReset(rawTarget: string, options: { force?: boolean }): Promise<void> {
  if (!isResetTarget(rawTarget)) {
    throw new Error(
      `unknown reset target '${rawTarget}'. Expected one of: ${RESET_TARGETS.join(", ")}`,
    );
  }
  const resolver = createPathResolver();
  await ensureDataDir(resolver);
  const targetPath = resetPathFor(rawTarget, resolver);
  const intent = resetIntentFor(rawTarget);

  if (!options.force && !(await confirm(`${chalk.yellow(intent)} ${targetPath}. Continue? [y/N] `))) {
    process.stdout.write("aborted\n");
    return;
  }

  switch (rawTarget) {
    case "catalog": {
      await fs.rm(targetPath, { force: true });
      break;
    }
    case "secrets": {
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      await fs.writeFile(targetPath, "{}\n", "utf8");
      try {
        await fs.chmod(targetPath, 0o600);
      } catch {
        // chmod is a no-op on Windows; ignore.
      }
      break;
    }
    case "config": {
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      await fs.writeFile(targetPath, `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`, "utf8");
      break;
    }
  }
  process.stdout.write(`reset ${targetPath}\n`);
}

function resetPathFor(
  target: ResetTarget,
  resolver: ReturnType<typeof createPathResolver>,
): string {
  switch (target) {
    case "catalog":
      return resolver.catalogFile();
    case "secrets":
      return resolver.secretsFile();
    case "config":
      return resolver.configFile();
  }
}

function resetIntentFor(target: ResetTarget): string {
  switch (target) {
    case "catalog":
      return "This will remove the user catalog overlay at";
    case "secrets":
      return "This will clear all secrets at";
    case "config":
      return "This will reset preferences to defaults at";
  }
}

async function confirm(prompt: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(prompt);
  rl.close();
  return /^y(es)?$/i.test(answer.trim());
}
