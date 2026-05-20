import { promises as fs } from "node:fs";
import path from "node:path";

import type { Job, VideoRequest } from "@imagent/core";
import { AssetRepository } from "@imagent/persistence";
import chalk from "chalk";

import type { RunnerBundle } from "../runtime.js";

export async function linkVideoAssetsFromRequest(bundle: RunnerBundle, job: Job): Promise<void> {
  if (!job.resultItemId) return;
  const request = JSON.parse(job.requestJson) as VideoRequest;
  if (!request.assetIds || request.assetIds.length === 0) return;
  const assetRepo = new AssetRepository(bundle.db);
  for (const assetId of request.assetIds) {
    const asset = assetRepo.get(assetId);
    if (!asset) continue;
    bundle.gallery.addAssetLink({ itemId: job.resultItemId, assetId, role: asset.kind });
  }
}

export async function printDownloadedResult(
  bundle: RunnerBundle,
  job: Job,
  outDir: string | undefined,
): Promise<void> {
  if (!job.resultItemId) {
    throw new Error("job completed without resultItemId");
  }
  const item = bundle.gallery.get(job.resultItemId);
  if (!item) throw new Error("result item missing from gallery_items");
  const abs = path.isAbsolute(item.relPath) ? item.relPath : path.join(bundle.files.dataDir, item.relPath);
  process.stdout.write(`${chalk.green("ok:")} ${abs}\n`);
  if (outDir) {
    try {
      const copied = await copyResultToDir(abs, outDir);
      process.stdout.write(`${chalk.green("copied to:")} ${copied}\n`);
    } catch (err) {
      process.stderr.write(`${chalk.yellow("warn:")} failed to copy result: ${(err as Error).message}\n`);
    }
  }
}

async function copyResultToDir(sourcePath: string, outDir: string): Promise<string> {
  const targetDir = path.resolve(outDir);
  const targetPath = path.join(targetDir, path.basename(sourcePath));
  try {
    await fs.mkdir(targetDir, { recursive: true });
    await fs.copyFile(sourcePath, targetPath);
    return targetPath;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    let hint: string;
    switch (code) {
      case "ENOENT":
        hint = "source file not found or was removed";
        break;
      case "EACCES":
      case "EPERM":
        hint = "permission denied";
        break;
      case "ENOSPC":
        hint = "not enough disk space";
        break;
      default:
        hint = `unexpected file system error: ${(err as Error).message}`;
    }
    throw new Error(
      `generation succeeded, but --out copy from '${sourcePath}' to '${targetPath}' failed: ${hint}`,
    );
  }
}
