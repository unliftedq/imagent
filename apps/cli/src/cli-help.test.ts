import { spawn, spawnSync } from "node:child_process";
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
  it("root --help exits 0 and lists every command", () => {
    const r = runCli(["--help"]);
    expect(r.status).toBe(0);
    for (const cmd of [
      "doctor",
      "models",
      "options",
      "image",
      "config",
      "asset",
      "gallery",
      "video",
      "mcp",
    ]) {
      expect(r.stdout).toContain(cmd);
    }
    // The standalone `catalog` command was folded into `config reset catalog`.
    // Match commander's "Commands:" listing format: two leading spaces, a name,
    // then padding before the description.
    expect(r.stdout).not.toMatch(/^ {2}catalog(?:\s|\[)/m);
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
    ["video", "status", "--help"],
    ["video", "download", "--help"],
    ["video", "ls", "--help"],
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
