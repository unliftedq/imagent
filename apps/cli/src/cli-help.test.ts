import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const ENTRY = path.resolve(here, "..", "dist", "cli.js");

interface Result {
  status: number | null;
  stdout: string;
  stderr: string;
}

function runCli(args: string[], env: NodeJS.ProcessEnv = {}): Result {
  const result = spawnSync(process.execPath, [ENTRY, ...args], {
    encoding: "utf8",
    env: { ...process.env, ...env },
    timeout: 15_000,
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function withTempHome<T>(fn: (env: NodeJS.ProcessEnv) => T): T {
  const home = mkdtempSync(path.join(os.tmpdir(), "imagent-cli-home-"));
  try {
    return fn({ HOME: home, USERPROFILE: home });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

describe("CLI --help", () => {
  it("root --help exits 0 and lists every command", () => {
    const r = runCli(["--help"]);
    expect(r.status).toBe(0);
    for (const cmd of [
      "image",
      "video",
      "gallery",
      "asset",
      "models",
      "options",
      "doctor",
      "config",
      "mcp",
    ]) {
      expect(r.stdout).toContain(cmd);
    }
    // The standalone `catalog` command was folded into `config reset catalog`.
    // Match commander's "Commands:" listing format: two leading spaces, a name,
    // then padding before the description.
    expect(r.stdout).not.toMatch(/^ {2}catalog(?:\s|\[)/m);
  });

  it("root --help lists commands in expected registration order", () => {
    const r = runCli(["--help"]);
    expect(r.status).toBe(0);
    const expected = [
      "image",
      "video",
      "gallery",
      "asset",
      "models",
      "options",
      "doctor",
      "config",
      "mcp",
    ];
    const positions = expected.map((cmd) => r.stdout.indexOf(`  ${cmd}`));
    for (const position of positions) {
      expect(position).toBeGreaterThanOrEqual(0);
    }
    for (let i = 1; i < positions.length; i += 1) {
      const previous = positions[i - 1];
      const current = positions[i];
      if (previous === undefined || current === undefined) {
        throw new Error("expected command positions to be present");
      }
      expect(current).toBeGreaterThan(previous);
    }
  });

  it("root --help description does not contain blank lines", () => {
    const r = runCli(["--help"]);
    expect(r.status).toBe(0);
    // Commander inserts section spacing around Usage/Options/Commands; only
    // inspect the rendered root description itself.
    const match = r.stdout.match(/imagent —[\s\S]*?(?=\r?\nOptions:)/);
    expect(match).not.toBeNull();
    const descriptionBlock = match?.[0] ?? "";
    expect(descriptionBlock.length).toBeGreaterThan(0);
    expect(descriptionBlock).not.toMatch(/\n\s*\n/);
  });

  it("config --help advertises the reset subcommand with all targets", () => {
    const r = runCli(["config", "--help"]);
    expect(r.status, `stderr:\n${r.stderr}`).toBe(0);
    expect(r.stdout).toMatch(/reset[^\n]*<target>/);
  });

  it("config reset --help mentions catalog and secrets", () => {
    const r = runCli(["config", "reset", "--help"]);
    expect(r.status, `stderr:\n${r.stderr}`).toBe(0);
    expect(r.stdout).toContain("catalog");
    expect(r.stdout).toContain("secrets");
  });

  for (const sub of [
    ["asset", "--help"],
    ["gallery", "--help"],
    ["config", "--help"],
    ["image", "--help"],
    ["image", "generate", "--help"],
    ["video", "--help"],
    ["video", "generate", "--help"],
    ["video", "task", "--help"],
    ["video", "task", "ls", "--help"],
    ["video", "task", "get", "--help"],
    ["video", "task", "cancel", "--help"],
    ["video", "download", "--help"],
    ["mcp", "--help"],
    ["models", "--help"],
    ["options", "--help"],
    ["asset", "add", "--help"],
    ["gallery", "ls", "--help"],
  ]) {
    it(`'${sub.join(" ")}' exits 0`, () => {
      const r = runCli(sub);
      expect(r.status, `stderr:\n${r.stderr}`).toBe(0);
      expect(r.stdout.length).toBeGreaterThan(0);
    });
  }

  it("image/video help exposes dynamic key=value options instead of stale model flags", () => {
    const image = runCli(["image", "generate", "--help"]);
    expect(image.status, `stderr:\n${image.stderr}`).toBe(0);
    expect(image.stdout).toContain("--option <key=value>");
    expect(image.stdout).toContain("--out <dir>");
    expect(image.stdout).not.toContain("--detach");
    expect(image.stdout).not.toContain("--negative");
    expect(image.stdout).not.toContain("--size");

    const video = runCli(["video", "generate", "--help"]);
    expect(video.status, `stderr:\n${video.stderr}`).toBe(0);
    expect(video.stdout).toContain("--option <key=value>");
    expect(video.stdout).toContain("--out <dir>");
    expect(video.stdout).not.toContain("--detach");
    expect(video.stdout).toContain("--wait");
    expect(video.stdout).not.toContain("--duration");
    expect(video.stdout).not.toContain("--resolution");
  });

  it("video generate rejects --out without --wait", () => {
    const r = runCli(["video", "generate", "prompt", "--out", "./videos"]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("--out only applies with --wait");
  });

  it("config get masks apiKey values", () => {
    withTempHome((env) => {
      const set = runCli(["config", "set", "openai.apiKey", "sk-1234567890"], env);
      expect(set.status, `stderr:\n${set.stderr}`).toBe(0);

      const get = runCli(["config", "get", "openai.apiKey"], env);
      expect(get.status, `stderr:\n${get.stderr}`).toBe(0);
      expect(get.stdout.trim()).toBe("sk-1…7890");
      expect(get.stdout).not.toContain("sk-1234567890");
    });
  });

  it("config set/get supports image and video default models", () => {
    withTempHome((env) => {
      const image = runCli(
        ["config", "set", "image.defaultModel", "openai:gpt-image-2"],
        env,
      );
      expect(image.status, `stderr:\n${image.stderr}`).toBe(0);
      const video = runCli(
        ["config", "set", "video.defaultModel", "bytedance:doubao-seedance-1-0-pro-250528"],
        env,
      );
      expect(video.status, `stderr:\n${video.stderr}`).toBe(0);

      const imageGet = runCli(["config", "get", "image.defaultModel"], env);
      expect(imageGet.status, `stderr:\n${imageGet.stderr}`).toBe(0);
      expect(imageGet.stdout.trim()).toBe("openai:gpt-image-2");

      const videoGet = runCli(["config", "get", "video.defaultModel"], env);
      expect(videoGet.status, `stderr:\n${videoGet.stderr}`).toBe(0);
      expect(videoGet.stdout.trim()).toBe("bytedance:doubao-seedance-1-0-pro-250528");
    });
  });

});

describe("CLI MCP server", () => {
  it("responds to initialize, tools/list, and tools/call over stdio", async () => {
    const child = spawn(process.execPath, [ENTRY, "mcp"], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    try {
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");

      const responses: Array<Record<string, unknown>> = [];
      let buffer = "";
      child.stdout.on("data", (chunk: string) => {
        buffer += chunk;
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (line.trim()) responses.push(JSON.parse(line) as Record<string, unknown>);
        }
      });

      child.stdin.write(
        `${JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: { protocolVersion: "2024-11-05" },
        })}\n`,
      );
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" })}\n`);
      child.stdin.write(
        `${JSON.stringify({
          jsonrpc: "2.0",
          id: 3,
          method: "tools/call",
          params: { name: "imagent_doctor", arguments: { args: ["--help"] } },
        })}\n`,
      );

      await waitFor(() => responses.length >= 3);

      expect(responses.find((r) => r.id === 1)?.result).toMatchObject({
        protocolVersion: "2024-11-05",
        serverInfo: { name: "imagent" },
      });
      const listResult = responses.find((r) => r.id === 2)?.result as {
        tools?: Array<{ name: string; description?: string }>;
      };
      expect(listResult).toMatchObject({
        tools: expect.arrayContaining([
          expect.objectContaining({ name: "imagent_doctor" }),
          expect.objectContaining({ name: "imagent_models" }),
          expect.objectContaining({ name: "imagent_options" }),
          expect.objectContaining({
            name: "imagent_image",
            description: expect.stringContaining("--option key=value"),
          }),
          expect.objectContaining({
            name: "imagent_video",
            description: expect.stringContaining("--out <dir>"),
          }),
          expect.objectContaining({ name: "imagent_config" }),
          expect.objectContaining({ name: "imagent_asset" }),
          expect.objectContaining({ name: "imagent_gallery" }),
        ]),
      });
      expect(listResult.tools?.map((tool) => tool.name)).not.toContain("imagent_job");
      expect(listResult.tools?.map((tool) => tool.name)).not.toContain("imagent_catalog");
      expect(listResult.tools?.map((tool) => tool.name)).not.toContain("imagent_cli");
      const imageTool = listResult.tools?.find((tool) => tool.name === "imagent_image");
      const videoTool = listResult.tools?.find((tool) => tool.name === "imagent_video");
      expect(imageTool?.description).toContain("--out <dir>");
      expect(imageTool?.description).not.toContain("--count");
      expect(videoTool?.description).toContain("--option key=value");
      expect(videoTool?.description).not.toContain("--duration");

      const callResult = responses.find((r) => r.id === 3)?.result as {
        content?: Array<{ text: string }>;
      };
      const text = callResult.content?.[0]?.text;
      expect(text).toBeTypeOf("string");
      const payload = JSON.parse(text as string) as { stdout: string; status: number };
      expect(payload.status).toBe(0);
      expect(payload.stdout).toContain("Usage: imagent doctor");
    } finally {
      child.stdin.end();
      child.kill();
    }
  }, 15_000);
});

async function waitFor(predicate: () => boolean): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > 15_000) {
      throw new Error("timed out waiting for MCP responses");
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
