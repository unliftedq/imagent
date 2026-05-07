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
      "image",
      "config",
      "catalog",
      "options",
      "asset",
      "gallery",
      "video",
      "job",
      "mcp",
    ]) {
      expect(r.stdout).toContain(cmd);
    }
    expect(r.stdout).toContain("Agent discovery");
  });

  for (const sub of [
    ["asset", "--help"],
    ["gallery", "--help"],
    ["job", "--help"],
    ["config", "--help"],
    ["image", "--help"],
    ["video", "--help"],
    ["mcp", "--help"],
    ["options", "--help"],
    ["capabilities", "--help"],
    ["config", "models", "--help"],
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

  it("image/video help exposes dynamic key=value options instead of stale model flags", () => {
    const image = runCli(["image", "--help"]);
    expect(image.status, `stderr:\n${image.stderr}`).toBe(0);
    expect(image.stdout).toContain("--option <key=value>");
    expect(image.stdout).toContain("--out <dir>");
    expect(image.stdout).not.toContain("--negative");
    expect(image.stdout).not.toContain("--size");

    const video = runCli(["video", "--help"]);
    expect(video.status, `stderr:\n${video.stderr}`).toBe(0);
    expect(video.stdout).toContain("--option <key=value>");
    expect(video.stdout).toContain("--out <dir>");
    expect(video.stdout).not.toContain("--duration");
    expect(video.stdout).not.toContain("--resolution");
  });

  it("discovery commands expose provider models and model options", () => {
    const providerModels = runCli(["config", "models", "--json"]);
    expect(providerModels.status, `stderr:\n${providerModels.stderr}`).toBe(0);
    const providerPayload = JSON.parse(providerModels.stdout) as Array<{
      id: string;
      models: { image?: string[]; video?: string[] };
    }>;
    expect(providerPayload).toContainEqual(
      expect.objectContaining({
        id: "openai",
        models: expect.objectContaining({ image: expect.arrayContaining(["gpt-image-2"]) }),
      }),
    );

    const textModels = runCli(["config", "models", "--provider", "openai"]);
    expect(textModels.status, `stderr:\n${textModels.stderr}`).toBe(0);
    expect(textModels.stdout).toContain("openai | image");
    expect(textModels.stdout).toContain("gpt-image-2");

    const options = runCli(["options", "--provider", "openai", "--model", "gpt-image-2"]);
    expect(options.status, `stderr:\n${options.stderr}`).toBe(0);
    expect(options.stdout).toContain("--option quality=<string>");
    expect(options.stdout).toContain("values: low, medium, high, auto");

    const videoOptions = runCli([
      "options",
      "--provider",
      "bytedance",
      "--model",
      "doubao-seedance-1-0-pro-250528",
      "--json",
    ]);
    expect(videoOptions.status, `stderr:\n${videoOptions.stderr}`).toBe(0);
    const videoPayload = JSON.parse(videoOptions.stdout) as Array<{
      options: Array<{ key: string; aliases?: string[]; values?: string[] }>;
    }>;
    expect(videoPayload[0]?.options).toContainEqual(
      expect.objectContaining({
        key: "aspectRatio",
        aliases: ["aspect"],
        values: expect.arrayContaining(["16:9"]),
      }),
    );

    const missingFilter = runCli(["options", "--provider", "openai"]);
    expect(missingFilter.status).not.toBe(0);
    expect(missingFilter.stderr).toContain("required option '--model <id>' not specified");
  });

  it("doctor lists configured provider/model details", () => {
    const r = runCli(["doctor"]);
    expect(r.status, `stderr:\n${r.stderr}`).toBe(0);
    expect(r.stdout).toContain("Providers:");
    expect(r.stdout).toContain("none configured");
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
          expect.objectContaining({
            name: "imagent_image",
            description: expect.stringContaining("--option key=value"),
          }),
          expect.objectContaining({
            name: "imagent_video",
            description: expect.stringContaining("--out <dir>"),
          }),
          expect.objectContaining({ name: "imagent_config" }),
          expect.objectContaining({ name: "imagent_catalog" }),
          expect.objectContaining({ name: "imagent_options" }),
          expect.objectContaining({ name: "imagent_asset" }),
          expect.objectContaining({ name: "imagent_gallery" }),
          expect.objectContaining({ name: "imagent_job" }),
        ]),
      });
      expect(listResult.tools?.map((tool) => tool.name)).not.toContain("imagent_cli");
      expect(listResult.tools?.map((tool) => tool.name)).not.toContain("imagent_providers");
      expect(listResult.tools?.map((tool) => tool.name)).not.toContain("imagent_models");
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
