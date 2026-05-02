import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const ENTRY = path.resolve(here, "..", "dist", "index.js");

interface Result {
  status: number | null;
  stdout: string;
  stderr: string;
}

function runCli(args: string[]): Result {
  const result = spawnSync(process.execPath, [ENTRY, ...args], {
    encoding: "utf8",
    timeout: 15_000,
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

describe("CLI --help", () => {
  it("root --help exits 0 and lists every M3 command", () => {
    const r = runCli(["--help"]);
    expect(r.status).toBe(0);
    for (const cmd of [
      "doctor",
      "image",
      "config",
      "asset",
      "gallery",
      "video",
      "job",
    ]) {
      expect(r.stdout).toContain(cmd);
    }
  });

  for (const sub of [
    ["asset", "--help"],
    ["gallery", "--help"],
    ["job", "--help"],
    ["config", "--help"],
    ["image", "--help"],
    ["video", "--help"],
    ["asset", "add", "--help"],
    ["gallery", "ls", "--help"],
    ["job", "ls", "--help"],
  ]) {
    it(`'${sub.join(" ")}' exits 0`, () => {
      const r = runCli(sub);
      expect(r.status, `stderr:\n${r.stderr}`).toBe(0);
      expect(r.stdout.length).toBeGreaterThan(0);
    });
  }
});
