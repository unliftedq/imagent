import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import type { CliRuntime } from "./runtime.js";

export const DETACHED_JOB_ID_ENV = "IMAGENT_DETACHED_JOB_ID";

export async function startDetachedCurrentCommand(
  runtime: CliRuntime,
): Promise<{ id: string; logPath: string; pid: number | undefined }> {
  const id = randomUUID();
  const entry = process.argv[1];
  if (!entry) throw new Error("cannot determine CLI entrypoint for detached job");

  const args = process.argv.slice(2).filter((arg) => arg !== "--detach");
  const logDir = path.join(runtime.resolver.dataDir, "logs");
  await fs.mkdir(logDir, { recursive: true });
  const logPath = path.join(logDir, `job-${id}.log`);
  const log = await fs.open(logPath, "a");
  try {
    const child = spawn(process.execPath, [entry, ...args], {
      cwd: process.cwd(),
      detached: true,
      env: { ...process.env, [DETACHED_JOB_ID_ENV]: id },
      // A detached worker must not inherit the terminal's stdin; stdout and
      // stderr are intentionally merged into one job log for later inspection.
      stdio: ["ignore", log.fd, log.fd],
    });
    child.unref();
    return { id, logPath, pid: child.pid };
  } finally {
    await log.close();
  }
}
