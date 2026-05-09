import { promises as fs } from "node:fs";
import path from "node:path";

import type {
  GenerationIntent,
  ImageRequest,
  Job,
  JobProgressEvent,
  VideoRequest,
} from "@imagent/core";
import {
  AssetRepository,
  GalleryRepository,
  createPathResolver,
  ensureDataDir,
  openDatabase,
} from "@imagent/persistence";
import chalk from "chalk";
import type { Command } from "commander";

import { buildAssetSlots, capReferences } from "./asset-slots.js";
import { installCancelOnInterrupt } from "./job-control.js";
import { buildRunner, loadCliRuntime } from "./runtime.js";
import {
  excerpt,
  formatRelativeTime,
  isTty,
  truncate,
} from "./util.js";

interface GalleryLsOptions {
  kind?: string;
  provider?: string;
  favorite?: boolean;
  limit?: string;
  search?: string;
}
interface GalleryRemixOptions {
  promptSuffix?: string;
  provider?: string;
  count?: string;
  out?: string;
}

export function registerGalleryCommands(program: Command): void {
  const gallery = program
    .command("gallery")
    .description(
      [
        "Browse, remix, and curate prior generations stored in the local gallery (under ~/.imagent/data/gallery).",
        "",
        "Use `gallery ls` to find item ids, `gallery show <id>` for full lineage and attached assets, and `gallery remix <id>` to spawn a new generation that links back to the parent via parent_id.",
      ].join("\n"),
    );

  gallery
    .command("ls")
    .description("List gallery items, optionally filtered")
    .option("--kind <kind>", "image|video")
    .option("--provider <id>", "Filter by provider id")
    .option("--favorite", "Only favorited items")
    .option("--limit <n>", "Maximum rows to print", "50")
    .option("--search <query>", "FTS5 search across prompt + negative_prompt")
    .action(async (options: GalleryLsOptions) => {
      try {
        await runLs(options);
      } catch (err) {
        process.stderr.write(`${chalk.red("gallery ls failed:")} ${(err as Error).message}\n`);
        process.exit(1);
      }
    });

  gallery
    .command("show <itemId>")
    .description("Show full details + lineage + attached assets")
    .action(async (itemId: string) => {
      try {
        await runShow(itemId);
      } catch (err) {
        process.stderr.write(`${chalk.red("gallery show failed:")} ${(err as Error).message}\n`);
        process.exit(1);
      }
    });

  gallery
    .command("remix <itemId>")
    .description("Generate a new item from an existing one (records parent_id)")
    .option("--prompt-suffix <text>", "Append text to the parent's prompt")
    .option("--provider <id>", "Override the provider")
    .option("--count <n>", "Override the count")
    .option("--out <dir>", "Override the output directory (image only)")
    .action(async (itemId: string, options: GalleryRemixOptions) => {
      try {
        await runRemix(itemId, options);
      } catch (err) {
        process.stderr.write(`${chalk.red("gallery remix failed:")} ${(err as Error).message}\n`);
        process.exit(1);
      }
    });

  gallery
    .command("rm <itemId>")
    .description("Delete a gallery item (and its file, FK cascades)")
    .option("--force", "Skip confirmation prompt")
    .action(async (itemId: string, options: { force?: boolean }) => {
      try {
        await runRm(itemId, options);
      } catch (err) {
        process.stderr.write(`${chalk.red("gallery rm failed:")} ${(err as Error).message}\n`);
        process.exit(1);
      }
    });

  gallery
    .command("favorite <itemId>")
    .description("Toggle favorite (or set explicitly with --off)")
    .option("--off", "Force unfavorite (otherwise toggles)")
    .action(async (itemId: string, options: { off?: boolean }) => {
      try {
        await runFavorite(itemId, options);
      } catch (err) {
        process.stderr.write(`${chalk.red("gallery favorite failed:")} ${(err as Error).message}\n`);
        process.exit(1);
      }
    });
}

async function runLs(options: GalleryLsOptions): Promise<void> {
  if (options.kind && !["image", "video"].includes(options.kind)) {
    throw new Error(`--kind must be 'image' or 'video' (got '${options.kind}')`);
  }
  const limit = options.limit ? Number.parseInt(options.limit, 10) : 50;
  if (Number.isNaN(limit) || limit <= 0) {
    throw new Error(`--limit must be a positive integer (got '${options.limit}')`);
  }

  const resolver = createPathResolver();
  await ensureDataDir(resolver);
  const db = openDatabase(resolver.dbFile());
  try {
    const repo = new GalleryRepository(db);
    const { items } = repo.query({
      ...(options.kind ? { kind: options.kind as "image" | "video" } : {}),
      ...(options.provider ? { providerId: options.provider } : {}),
      ...(options.favorite ? { favoritedOnly: true } : {}),
      ...(options.search ? { search: options.search } : {}),
      limit,
      offset: 0,
    });
    if (items.length === 0) {
      process.stdout.write(`${chalk.dim("(no items)")}\n`);
      return;
    }
    for (const item of items) {
      const id = truncate(item.id, 8);
      const kind = item.kind === "video" ? chalk.magenta("[video]") : chalk.cyan("[image]");
      const provider = `${item.providerId}/${item.model}`;
      const created = formatRelativeTime(item.createdAt);
      const fav = item.favorited ? chalk.yellow("★") : " ";
      process.stdout.write(
        `${chalk.dim(id)}  ${kind}  ${chalk.dim(provider)}  ${fav} ${excerpt(item.prompt, 40)}  ${chalk.dim(created)}\n`,
      );
    }
  } finally {
    db.close();
  }
}

async function runShow(itemId: string): Promise<void> {
  const resolver = createPathResolver();
  const db = openDatabase(resolver.dbFile());
  try {
    const repo = new GalleryRepository(db);
    const assetRepo = new AssetRepository(db);
    const item = repo.get(itemId);
    if (!item) throw new Error(`no gallery item with id '${itemId}'`);

    const abs = path.isAbsolute(item.relPath)
      ? item.relPath
      : path.join(resolver.dataDir, item.relPath);

    process.stdout.write(`${chalk.dim("id:        ")}${item.id}\n`);
    process.stdout.write(`${chalk.dim("kind:      ")}${item.kind}\n`);
    process.stdout.write(`${chalk.dim("provider:  ")}${item.providerId}\n`);
    process.stdout.write(`${chalk.dim("model:     ")}${item.model}\n`);
    process.stdout.write(`${chalk.dim("file:      ")}${abs}\n`);
    if (item.thumbPath) process.stdout.write(`${chalk.dim("thumb:     ")}${item.thumbPath}\n`);
    process.stdout.write(`${chalk.dim("prompt:    ")}${item.prompt}\n`);
    if (item.negativePrompt) {
      process.stdout.write(`${chalk.dim("neg:       ")}${item.negativePrompt}\n`);
    }
    if (item.width || item.height) {
      process.stdout.write(`${chalk.dim("dims:      ")}${item.width ?? "?"}x${item.height ?? "?"}\n`);
    }
    if (item.durationMs) {
      process.stdout.write(`${chalk.dim("duration:  ")}${item.durationMs} ms\n`);
    }
    process.stdout.write(`${chalk.dim("bytes:     ")}${item.bytes}\n`);
    process.stdout.write(`${chalk.dim("favorited: ")}${item.favorited ? "yes" : "no"}\n`);
    process.stdout.write(`${chalk.dim("created:   ")}${new Date(item.createdAt).toISOString()}\n`);
    process.stdout.write(`${chalk.dim("params:    ")}${item.paramsJson}\n`);

    // Lineage: walk parent_id up to grandparent.
    const parent = item.parentId ? repo.get(item.parentId) : null;
    const grand = parent?.parentId ? repo.get(parent.parentId) : null;
    if (parent || grand) {
      const segs = [item.id, parent?.id, grand?.id].filter(Boolean) as string[];
      process.stdout.write(`${chalk.dim("lineage:   ")}${segs.join(" ← ")}\n`);
    }

    // Attached assets.
    const links = repo.listAssetLinks(item.id);
    if (links.length > 0) {
      process.stdout.write(`${chalk.dim("assets:")}\n`);
      for (const link of links) {
        const a = assetRepo.get(link.assetId);
        const name = a ? a.name : "(missing)";
        process.stdout.write(
          `  ${chalk.dim("•")} [${link.role}] ${truncate(link.assetId, 8)} ${name}\n`,
        );
      }
    }
  } finally {
    db.close();
  }
}

async function runRemix(itemId: string, options: GalleryRemixOptions): Promise<void> {
  const runtime = await loadCliRuntime();
  const { db, jobs, gallery, runner } = buildRunner(runtime);
  try {
    const parent = gallery.get(itemId);
    if (!parent) throw new Error(`no gallery item with id '${itemId}'`);

    const params = safeParseJson(parent.paramsJson);
    const providerId = options.provider ?? parent.providerId;
    const newPrompt = options.promptSuffix
      ? `${parent.prompt} ${options.promptSuffix}`
      : parent.prompt;
    const count = options.count ? Number.parseInt(options.count, 10) : (params.count as number) || 1;

    if (parent.kind === "image") {
      const provider = runtime.imageRegistry.get(providerId);
      if (!provider) {
        throw new Error(
          `provider '${providerId}' is not configured. Run \`imagent config set ${providerId.split("-")[0]}.apiKey ...\` first.`,
        );
      }
      // Carry the parent's asset attachments through to the remix unless
      // explicitly overridden in the future. For now, pull asset ids and
      // re-attach to the child.
      const parentLinks = gallery.listAssetLinks(parent.id);
      const slotted = await buildAssetSlots(runtime.resolver, db, {
        characters: parentLinks.filter((l) => l.role === "character").map((l) => l.assetId),
        objects: parentLinks.filter((l) => l.role === "object").map((l) => l.assetId),
        backgrounds: parentLinks.filter((l) => l.role === "background").map((l) => l.assetId),
        styles: parentLinks.filter((l) => l.role === "style").map((l) => l.assetId),
      });

      const model = parent.model;
      const resolved = provider.models.get(model);
      const maxRefs = resolved?.capabilities?.maxReferences;
      const { references, capped } = capReferences(slotted.referencePaths, maxRefs);
      if (capped) {
        process.stderr.write(
          `${chalk.yellow("warn:")} capped at ${capped} references for model '${model}'\n`,
        );
      }
      const stylePrompts = slotted.stylePromptSnippets.length
        ? ` ${slotted.stylePromptSnippets.join(" ")}`
        : "";

      const req: ImageRequest = {
        prompt: `${newPrompt}${stylePrompts}`,
        providerId,
        model,
        count,
        ...(typeof params.size === "string" ? { size: params.size } : {}),
        ...(typeof params.aspectRatio === "string" ? { aspectRatio: params.aspectRatio } : {}),
        references: references.map((p) => ({ path: p, role: "freeform" as const })),
        assetIds: slotted.assetIds,
      };

      const intent: GenerationIntent = { kind: "image", request: req };
      const completed = new Promise<Job>((resolve, reject) => {
        runner.once("job.completed", (j: Job) => resolve(j));
        runner.once("job.failed", (j: Job) =>
          reject(new Error(j.errorMessage ?? "job failed")),
        );
      });
      process.stdout.write(`${chalk.dim("submitting:")} provider=${providerId} model=${model}\n`);
      const jobId = await runner.start(intent);
      process.stdout.write(`${chalk.dim("job:")} ${jobId}\n`);
      const job = await completed;
      if (!job.resultItemId) throw new Error("job completed without resultItemId");

      // Wire parent_id + asset links on the new item.
      db.prepare("UPDATE gallery_items SET parent_id = ? WHERE id = ?").run(parent.id, job.resultItemId);
      for (const a of slotted.attachments) {
        gallery.addAssetLink({
          itemId: job.resultItemId,
          assetId: a.assetId,
          role: a.role,
        });
      }

      const item = gallery.get(job.resultItemId);
      if (!item) throw new Error("result item missing from gallery_items");
      const abs = path.isAbsolute(item.relPath)
        ? item.relPath
        : path.join(runtime.resolver.dataDir, item.relPath);
      process.stdout.write(`${chalk.green("ok:")} ${abs}\n`);
      return;
    }

    // Video remix follows the foreground video UX: keep this process alive so
    // polling can finish and parent_id can be written on the resulting item.
    const provider = runtime.videoRegistry.get(providerId);
    if (!provider) {
      throw new Error(
        `video provider '${providerId}' is not configured. Run \`imagent config set bytedance.apiKey ...\` first.`,
      );
    }
    const req: VideoRequest = {
      prompt: newPrompt,
      providerId,
      model: parent.model,
      ...(typeof params.durationSec === "number" ? { durationSec: params.durationSec } : {}),
      ...(typeof params.fps === "number" ? { fps: params.fps } : {}),
      ...(typeof params.resolution === "string" ? { resolution: params.resolution } : {}),
      ...(typeof params.aspectRatio === "string" ? { aspectRatio: params.aspectRatio } : {}),
      references: [],
      assetIds: [],
    };
    const intent: GenerationIntent = { kind: "video", request: req };
    const tty = isTty();
    const printProgress = (e: JobProgressEvent): void => {
      const pct = Math.round((e.progress ?? 0) * 100);
      if (tty) process.stdout.write(`\rprogress: ${pct}% (${e.state})    `);
      else process.stdout.write(`progress: ${pct}% (${e.state})\n`);
    };
    runner.on("job.progress", printProgress);
    const completed = new Promise<Job>((resolve, reject) => {
      runner.once("job.completed", (j: Job) => resolve(j));
      runner.once("job.failed", (j: Job) =>
        reject(new Error(j.errorMessage ?? `job ended ${j.state}`)),
      );
    });
    process.stdout.write(`${chalk.dim("submitting:")} provider=${providerId} model=${parent.model}\n`);
    const jobId = await runner.start(intent);
    const cleanupCancel = installCancelOnInterrupt(runner, jobs, jobId);
    process.stdout.write(`${chalk.dim("job:")} ${jobId}\n`);
    const job = await completed.finally(() => {
      cleanupCancel();
      runner.off("job.progress", printProgress);
      if (tty) process.stdout.write("\n");
    });
    if (!job.resultItemId) throw new Error("job completed without resultItemId");
    db.prepare("UPDATE gallery_items SET parent_id = ? WHERE id = ?").run(parent.id, job.resultItemId);
    const item = gallery.get(job.resultItemId);
    if (!item) throw new Error("result item missing from gallery_items");
    const abs = path.isAbsolute(item.relPath)
      ? item.relPath
      : path.join(runtime.resolver.dataDir, item.relPath);
    process.stdout.write(`${chalk.green("ok:")} ${abs}\n`);
  } finally {
    db.close();
  }
}

async function runRm(itemId: string, options: { force?: boolean }): Promise<void> {
  const resolver = createPathResolver();
  const db = openDatabase(resolver.dbFile());
  try {
    const repo = new GalleryRepository(db);
    const item = repo.get(itemId);
    if (!item) throw new Error(`no gallery item with id '${itemId}'`);
    if (!options.force) {
      const ok = await confirm(
        `Delete gallery item '${truncate(item.id, 8)}' and its file? [y/N] `,
      );
      if (!ok) {
        process.stdout.write(`${chalk.dim("(cancelled)")}\n`);
        return;
      }
    }
    repo.delete(itemId);
    const abs = path.isAbsolute(item.relPath)
      ? item.relPath
      : path.join(resolver.dataDir, item.relPath);
    try {
      await fs.unlink(abs);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        process.stderr.write(
          `${chalk.yellow("warn:")} could not remove ${abs} (${(err as Error).message})\n`,
        );
      }
    }
    process.stdout.write(`${chalk.green("ok:")} deleted ${itemId}\n`);
  } finally {
    db.close();
  }
}

async function runFavorite(
  itemId: string,
  options: { off?: boolean },
): Promise<void> {
  const resolver = createPathResolver();
  const db = openDatabase(resolver.dbFile());
  try {
    const repo = new GalleryRepository(db);
    const item = repo.get(itemId);
    if (!item) throw new Error(`no gallery item with id '${itemId}'`);
    const next = options.off ? false : !item.favorited;
    repo.toggleFavorite(itemId, next);
    process.stdout.write(`${chalk.green("ok:")} favorited=${next}\n`);
  } finally {
    db.close();
  }
}

function safeParseJson(s: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(s);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

async function confirm(prompt: string): Promise<boolean> {
  process.stdout.write(prompt);
  return new Promise<boolean>((resolve) => {
    const onData = (chunk: Buffer): void => {
      process.stdin.off("data", onData);
      process.stdin.pause();
      const text = chunk.toString().trim().toLowerCase();
      resolve(text === "y" || text === "yes");
    };
    process.stdin.resume();
    process.stdin.once("data", onData);
  });
}
