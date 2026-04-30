import {
  getBundledCatalog,
  loadCatalog,
  saveCatalog,
  type ModelCatalog,
} from "@imagine/providers";
import { createPathResolver, ensureDataDir } from "@imagine/persistence";
import chalk from "chalk";
import type { Command } from "commander";
import { createInterface } from "node:readline/promises";

/**
 * `imagine catalog path` — print the absolute catalog path.
 * `imagine catalog show [--provider <id>] [--kind image|video]` — pretty-print.
 * `imagine catalog reset [--force]` — overwrite user catalog with bundled default.
 */
export function registerCatalogCommands(program: Command): void {
  const cmd = program
    .command("catalog")
    .description("Inspect and manage the model catalog (~/.imagine/catalog.json)");

  cmd
    .command("path")
    .description("Print the absolute path to ~/.imagine/catalog.json")
    .action(async () => {
      const resolver = createPathResolver();
      await ensureDataDir(resolver);
      // Trigger first-run seeding so users see the file appear.
      await loadCatalog({ path: resolver.catalogFile() });
      process.stdout.write(`${resolver.catalogFile()}\n`);
    });

  cmd
    .command("show")
    .description("Pretty-print the catalog (filter by provider and/or kind)")
    .option("--provider <id>", "Filter to a single provider id")
    .option("--kind <kind>", "Filter by kind: 'image' or 'video'")
    .action(async (options: { provider?: string; kind?: string }) => {
      try {
        await runShow(options);
      } catch (err) {
        process.stderr.write(`catalog show failed: ${(err as Error).message}\n`);
        process.exitCode = 1;
      }
    });

  cmd
    .command("reset")
    .description("Overwrite ~/.imagine/catalog.json with the bundled default")
    .option("--force", "Skip the confirmation prompt", false)
    .action(async (options: { force?: boolean }) => {
      try {
        await runReset(options);
      } catch (err) {
        process.stderr.write(`catalog reset failed: ${(err as Error).message}\n`);
        process.exitCode = 1;
      }
    });
}

async function runShow(options: {
  provider?: string;
  kind?: string;
}): Promise<void> {
  const resolver = createPathResolver();
  await ensureDataDir(resolver);
  const catalog = await loadCatalog({ path: resolver.catalogFile() });
  const kind = options.kind?.toLowerCase();
  if (kind && kind !== "image" && kind !== "video") {
    throw new Error(`--kind must be 'image' or 'video' (got '${options.kind}')`);
  }
  const filtered = filterCatalog(catalog, kind as "image" | "video" | undefined, options.provider);
  process.stdout.write(`${JSON.stringify(filtered, null, 2)}\n`);
}

function filterCatalog(
  catalog: ModelCatalog,
  kind: "image" | "video" | undefined,
  provider: string | undefined,
): ModelCatalog {
  const out: ModelCatalog = { version: 1, image: {}, video: {} };
  if (catalog.comments) out.comments = catalog.comments;
  if (!kind || kind === "image") {
    for (const [pid, models] of Object.entries(catalog.image)) {
      if (provider && pid !== provider) continue;
      out.image[pid] = models;
    }
  }
  if (!kind || kind === "video") {
    for (const [pid, models] of Object.entries(catalog.video)) {
      if (provider && pid !== provider) continue;
      out.video[pid] = models;
    }
  }
  return out;
}

async function runReset(options: { force?: boolean }): Promise<void> {
  const resolver = createPathResolver();
  await ensureDataDir(resolver);
  const target = resolver.catalogFile();
  if (!options.force) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const ok = await rl.question(
      `${chalk.yellow("This will overwrite")} ${target} with the bundled default. Continue? [y/N] `,
    );
    rl.close();
    if (!/^y(es)?$/i.test(ok.trim())) {
      process.stdout.write("aborted\n");
      return;
    }
  }
  const bundled = getBundledCatalog();
  await saveCatalog(bundled, { path: target });
  process.stdout.write(`reset ${target}\n`);
}
