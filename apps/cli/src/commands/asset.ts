import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import type { Asset, AssetFile, AssetKind } from "@imagent/core";
import {
  AssetRepository,
  createPathResolver,
  ensureDataDir,
  generateImageThumbnail,
  openDatabase,
  readImageMetadata,
} from "@imagent/persistence";
import chalk from "chalk";
import type { Command } from "commander";

import { describeAssetSlug } from "./asset-slots.js";
import { collect, formatRelativeTime, isTty } from "./util.js";

const VALID_KINDS: AssetKind[] = ["character", "object", "background", "style"];

interface AssetAddOptions {
  name?: string;
  description?: string;
  prompt?: string;
  ref?: string[];
  force?: boolean;
}
interface AssetListOptions {
  kind?: string;
  search?: string;
  limit?: string;
}

export function registerAssetCommands(program: Command): void {
  const asset = program
    .command("asset")
    .description("Manage Characters / Objects / Backgrounds / Styles");

  asset
    .command("add <kind>")
    .description("Add a new asset (character|object|background|style)")
    .requiredOption("--name <name>", "Display name")
    .option("--description <text>", "Optional description")
    .option("--prompt <snippet>", "Prompt snippet (style only)")
    .option("--ref <path>", "Reference image path", collect, [])
    .action(async (kind: string, options: AssetAddOptions) => {
      try {
        await runAssetAdd(kind, options);
      } catch (err) {
        process.stderr.write(`${chalk.red("asset add failed:")} ${(err as Error).message}\n`);
        process.exit(1);
      }
    });

  asset
    .command("list")
    .description("List assets with their reference status")
    .option("--kind <kind>", "Filter by kind")
    .option("--search <query>", "FTS5 search across name/description/prompt")
    .option("--limit <n>", "Maximum rows to print")
    .action(async (options: AssetListOptions) => {
      try {
        await runAssetList(options);
      } catch (err) {
        process.stderr.write(`${chalk.red("asset list failed:")} ${(err as Error).message}\n`);
        process.exit(1);
      }
    });

  asset
    .command("show <id>")
    .description("Show full asset record (paths, dimensions, prompt snippet)")
    .action(async (id: string) => {
      try {
        await runAssetShow(id);
      } catch (err) {
        process.stderr.write(`${chalk.red("asset show failed:")} ${(err as Error).message}\n`);
        process.exit(1);
      }
    });

  asset
    .command("rm <id>")
    .description("Delete an asset and its files")
    .option("--force", "Skip confirmation prompt")
    .action(async (id: string, options: { force?: boolean }) => {
      try {
        await runAssetRm(id, options);
      } catch (err) {
        process.stderr.write(`${chalk.red("asset rm failed:")} ${(err as Error).message}\n`);
        process.exit(1);
      }
    });
}

async function runAssetAdd(kind: string, options: AssetAddOptions): Promise<void> {
  if (!VALID_KINDS.includes(kind as AssetKind)) {
    throw new Error(`unknown kind '${kind}'. Expected one of: ${VALID_KINDS.join(", ")}`);
  }
  const assetKind = kind as AssetKind;

  if (!options.name) {
    throw new Error("--name is required");
  }
  if (options.prompt && assetKind !== "style") {
    throw new Error(
      "--prompt is only meaningful for kind=style. Drop --prompt or change the kind.",
    );
  }
  const refs = options.ref ?? [];
  if (refs.length > 1) {
    throw new Error("assets accept only one --ref");
  }
  if (refs.length === 0) {
    if (assetKind !== "style") {
      throw new Error(`kind=${assetKind} requires one --ref`);
    }
    if (!options.prompt) {
      throw new Error("kind=style needs one --ref OR a --prompt snippet (or both)");
    }
  }

  const resolver = createPathResolver();
  await ensureDataDir(resolver);

  const assetId = randomUUID();
  const assetDir = resolver.assetsDir(assetId);
  await fs.mkdir(assetDir, { recursive: true });

  const now = Date.now();
  const fileRows: AssetFile[] = [];
  const writtenRelPaths: string[] = [];

  // 1) Copy the optional --ref into the asset folder.
  for (const [i, refPath] of refs.entries()) {
    const src = path.resolve(refPath);
    const stat = await fs.stat(src).catch(() => {
      throw new Error(`reference not found: ${src}`);
    });
    if (stat.isDirectory()) {
      throw new Error(`reference is a directory, not a file: ${src}`);
    }
    const ext = (path.extname(src) || ".bin").toLowerCase();
    const padded = String(i + 1).padStart(3, "0");
    const destRel = path.join("assets", assetId, `ref-${padded}${ext}`);
    const destAbs = path.join(resolver.dataDir, destRel);

    // Copy with COPYFILE_EXCL semantics — atomic when possible.
    await fs.copyFile(src, destAbs);

    // Compute sha256 + dimensions + bytes.
    const buf = await fs.readFile(destAbs);
    const sha256 = createHash("sha256").update(buf).digest("hex");
    let width: number | null = null;
    let height: number | null = null;
    let mimeType = guessMime(ext);
    try {
      const meta = await readImageMetadata(destAbs);
      width = meta.width;
      height = meta.height;
      if (meta.format) mimeType = `image/${meta.format}`;
    } catch {
      // Non-image refs are unusual for character/object/background/style but
      // we don't reject — sharp will throw and we keep the recorded mime.
    }

    fileRows.push({
      id: randomUUID(),
      assetId,
      role: "reference",
      relPath: destRel,
      mimeType,
      width,
      height,
      bytes: buf.byteLength,
      sha256,
      position: i,
      createdAt: now,
    });
    writtenRelPaths.push(destRel);
  }

  // 2) Generate one thumbnail from the first reference if we have one.
  const firstRef = fileRows.find((f) => f.role === "reference");
  if (firstRef) {
    const thumbRel = path.join("assets", assetId, "thumb.webp");
    const thumbAbs = path.join(resolver.dataDir, thumbRel);
    const srcAbs = path.join(resolver.dataDir, firstRef.relPath);
    try {
      const t = await generateImageThumbnail(srcAbs, thumbAbs, { maxSide: 256 });
      fileRows.push({
        id: randomUUID(),
        assetId,
        role: "thumbnail",
        relPath: thumbRel,
        mimeType: "image/webp",
        width: t.width,
        height: t.height,
        bytes: t.bytes,
        sha256: createHash("sha256")
          .update(await fs.readFile(thumbAbs))
          .digest("hex"),
        position: 0,
        createdAt: now,
      });
      writtenRelPaths.push(thumbRel);
    } catch (err) {
      // Non-image first ref — proceed without thumbnail rather than aborting
      // the entire asset (e.g. style asset with PSD-only refs).
      process.stderr.write(
        `${chalk.yellow("warn:")} thumbnail generation skipped (${(err as Error).message})\n`,
      );
    }
  }

  // 3) Insert the assets row + asset_files rows. Asset row goes LAST so a
  //    crash during file copy doesn't leave an empty asset hanging around.
  const db = openDatabase(resolver.dbFile());
  try {
    const repo = new AssetRepository(db);

    // Optional dedup hint.
    const dedupHits = fileRows
      .filter((f) => f.role === "reference")
      .flatMap((f) => repo.findFilesBySha256(f.sha256));
    if (dedupHits.length > 0 && isTty()) {
      process.stderr.write(
        `${chalk.dim("hint:")} matched ${dedupHits.length} existing asset_file row(s) by sha256 (proceeding anyway)\n`,
      );
    }

    const asset: Asset = {
      id: assetId,
      kind: assetKind,
      name: options.name,
      description: options.description ?? null,
      promptSnippet: options.prompt ?? null,
      files: fileRows,
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
    };
    repo.create(asset);
    for (const f of fileRows) {
      repo.addFile(f);
    }
  } finally {
    db.close();
  }

  process.stdout.write(
    `${chalk.green("ok:")} ${describeAssetSlug({ id: assetId, name: options.name })}\n`,
  );
  process.stdout.write(`  ${chalk.dim("id:")} ${assetId}\n`);
  for (const p of writtenRelPaths) {
    process.stdout.write(`  ${chalk.dim("•")} ${p}\n`);
  }
}

async function runAssetList(options: AssetListOptions): Promise<void> {
  if (options.kind && !VALID_KINDS.includes(options.kind as AssetKind)) {
    throw new Error(`unknown kind '${options.kind}'. Expected one of: ${VALID_KINDS.join(", ")}`);
  }
  const limit = options.limit ? Number.parseInt(options.limit, 10) : undefined;
  if (limit !== undefined && (Number.isNaN(limit) || limit <= 0)) {
    throw new Error(`--limit must be a positive integer (got '${options.limit}')`);
  }

  const resolver = createPathResolver();
  await ensureDataDir(resolver);
  const db = openDatabase(resolver.dbFile());
  try {
    const repo = new AssetRepository(db);
    const list = repo.list({
      ...(options.kind !== undefined ? { kind: options.kind as AssetKind } : {}),
      ...(options.search !== undefined ? { search: options.search } : {}),
      ...(limit !== undefined ? { limit } : {}),
    });
    if (list.length === 0) {
      process.stdout.write(`${chalk.dim("(no assets)")}\n`);
      return;
    }

    // pretty table
    for (const a of list) {
      const hasReference = a.files.some((f) => f.role === "reference");
      const slug = describeAssetSlug(a);
      const updated = formatRelativeTime(a.updatedAt);
      process.stdout.write(
        `${chalk.dim(slug)}  ${kindBadge(a.kind)}  ${chalk.bold(a.name)}  ${chalk.dim(hasReference ? "ref=yes" : "ref=no")}  ${chalk.dim(updated)}\n`,
      );
    }
  } finally {
    db.close();
  }
}

async function runAssetShow(id: string): Promise<void> {
  const resolver = createPathResolver();
  const db = openDatabase(resolver.dbFile());
  try {
    const repo = new AssetRepository(db);
    const asset = repo.get(id);
    if (!asset) throw new Error(`no asset with id '${id}'`);

    const lines: string[] = [];
    lines.push(`${chalk.dim("id:        ")}${asset.id}`);
    lines.push(`${chalk.dim("slug:      ")}${describeAssetSlug(asset)}`);
    lines.push(`${chalk.dim("kind:      ")}${asset.kind}`);
    lines.push(`${chalk.dim("name:      ")}${asset.name}`);
    if (asset.description) lines.push(`${chalk.dim("desc:      ")}${asset.description}`);
    if (asset.promptSnippet) {
      lines.push(`${chalk.dim("prompt:    ")}${asset.promptSnippet}`);
    }
    lines.push(`${chalk.dim("created:   ")}${new Date(asset.createdAt).toISOString()}`);
    lines.push(`${chalk.dim("updated:   ")}${new Date(asset.updatedAt).toISOString()}`);
    if (asset.archivedAt) {
      lines.push(`${chalk.dim("archived:  ")}${new Date(asset.archivedAt).toISOString()}`);
    }

    const reference = asset.files.find((f) => f.role === "reference") ?? null;
    const thumb = asset.files.find((f) => f.role === "thumbnail");
    if (reference) {
      const abs = path.join(resolver.dataDir, reference.relPath);
      const dim =
        reference.width && reference.height ? ` (${reference.width}x${reference.height})` : "";
      lines.push(`${chalk.dim("reference: ")}${abs}${chalk.dim(dim)}`);
    }
    if (thumb) {
      const abs = path.join(resolver.dataDir, thumb.relPath);
      lines.push(`${chalk.dim("thumb:     ")}${abs}`);
    }

    process.stdout.write(`${lines.join("\n")}\n`);
  } finally {
    db.close();
  }
}

async function runAssetRm(id: string, options: { force?: boolean }): Promise<void> {
  const resolver = createPathResolver();
  const db = openDatabase(resolver.dbFile());
  try {
    const repo = new AssetRepository(db);
    const asset = repo.get(id);
    if (!asset) throw new Error(`no asset with id '${id}'`);
    if (!options.force) {
      const ok = await confirm(`Delete asset '${asset.name}' (${asset.kind})? [y/N] `);
      if (!ok) {
        process.stdout.write(`${chalk.dim("(cancelled)")}\n`);
        return;
      }
    }
    repo.delete(id);
    // FK cascade clears asset_files; the directory is ours to clean up.
    const dir = resolver.assetsDir(id);
    // Don't follow symlinks for safety: rm with `force: true, recursive: true`.
    // Node's rm does not follow symlinks when removing the leaf is itself a
    // symlink, but recursive descent does follow link target dirs. The safer
    // path: only rm a directory that isn't a symlink.
    try {
      const stat = await fs.lstat(dir);
      if (stat.isSymbolicLink()) {
        await fs.unlink(dir);
      } else {
        await fs.rm(dir, { recursive: true, force: true });
      }
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") {
        process.stderr.write(
          `${chalk.yellow("warn:")} could not remove ${dir} (${(err as Error).message})\n`,
        );
      }
    }
    process.stdout.write(`${chalk.green("ok:")} deleted ${id}\n`);
  } finally {
    db.close();
  }
}

function kindBadge(kind: AssetKind): string {
  switch (kind) {
    case "character":
      return chalk.cyan(`[${kind}]`);
    case "object":
      return chalk.magenta(`[${kind}]`);
    case "background":
      return chalk.green(`[${kind}]`);
    case "style":
      return chalk.yellow(`[${kind}]`);
    default:
      return `[${kind}]`;
  }
}

function guessMime(ext: string): string {
  const e = ext.toLowerCase().replace(/^\./, "");
  switch (e) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    default:
      return "application/octet-stream";
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
