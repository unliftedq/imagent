import { spawn, spawnSync } from "node:child_process";
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
  it("root --help exits 0 and lists every command", () => {
    const r = runCli(["--help"]);
    expect(r.status).toBe(0);
    for (const cmd of ["doctor", "image", "config", "asset", "gallery", "video", "job", "mcp"]) {
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
    ["mcp", "--help"],
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
          params: { name: "imagine_doctor", arguments: { args: ["--help"] } },
        })}\n`,
      );

      await waitFor(() => responses.length >= 3);

      expect(responses.find((r) => r.id === 1)?.result).toMatchObject({
        protocolVersion: "2024-11-05",
        serverInfo: { name: "imagine" },
      });
      expect(responses.find((r) => r.id === 2)?.result).toMatchObject({
        tools: expect.arrayContaining([
          expect.objectContaining({ name: "imagine_doctor" }),
          expect.objectContaining({ name: "imagine_image" }),
          expect.objectContaining({ name: "imagine_video" }),
          expect.objectContaining({ name: "imagine_config" }),
          expect.objectContaining({ name: "imagine_catalog" }),
          expect.objectContaining({ name: "imagine_asset" }),
          expect.objectContaining({ name: "imagine_gallery" }),
          expect.objectContaining({ name: "imagine_job" }),
          expect.objectContaining({ name: "imagine_cli" }),
        ]),
      });

      const callResult = responses.find((r) => r.id === 3)?.result as {
        content?: Array<{ text: string }>;
      };
      const text = callResult.content?.[0]?.text;
      expect(text).toBeTypeOf("string");
      const payload = JSON.parse(text as string) as { stdout: string; status: number };
      expect(payload.status).toBe(0);
      expect(payload.stdout).toContain("Usage: imagine doctor");
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
