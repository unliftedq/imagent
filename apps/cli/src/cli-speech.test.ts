import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const ENTRY = path.resolve(here, "..", "dist", "cli.js");

function runCli(args: string[], env: NodeJS.ProcessEnv = {}) {
  const home = path.join(process.cwd(), ".test-home-speech-cli");
  rmSync(home, { recursive: true, force: true });
  try {
    const result = spawnSync(process.execPath, [ENTRY, ...args], {
      encoding: "utf8",
      env: { ...process.env, HOME: home, USERPROFILE: home, ...env },
      timeout: 15_000,
    });
    return {
      status: result.status,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
    };
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

describe("CLI speech regressions", { timeout: 20_000 }, () => {
  it("speech voices rejects an explicit unknown model", () => {
    const r = runCli(["speech", "voices", "--provider", "elevenlabs", "--model", "typo-model"], {
      ELEVENLABS_API_KEY: "dummy",
    });

    expect(r.status).toBe(1);
    expect(r.stderr).toContain("unknown model 'typo-model'");
    expect(r.stdout).not.toContain("no voices available");
  });

  it("config provider add accepts speech routing for built-in speech providers", () => {
    const r = runCli(
      [
        "config",
        "provider",
        "add",
        "elevenlabs",
        "custom-tts",
        "--kind",
        "speech",
        "--model",
        "eleven_multilingual_v2",
      ],
      { ELEVENLABS_API_KEY: "dummy" },
    );

    expect(r.status, `stderr:\n${r.stderr}`).toBe(0);
    expect(r.stdout).toContain("elevenlabs speech 'custom-tts'");
  });
});
