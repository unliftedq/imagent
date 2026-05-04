import { spawn } from "node:child_process";

import type { Command } from "commander";

type JsonRpcId = string | number | null;

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: JsonRpcId;
  method: string;
  params?: unknown;
}

interface ToolCallArgs {
  args?: unknown;
  timeoutMs?: unknown;
}

const SERVER_INFO = {
  name: "imagine",
  version: "0.0.1",
};

const SUPPORTED_PROTOCOL_VERSIONS = ["2024-11-05", "2025-03-26", "2025-06-18"] as const;
const DEFAULT_PROTOCOL_VERSION =
  SUPPORTED_PROTOCOL_VERSIONS[SUPPORTED_PROTOCOL_VERSIONS.length - 1] ?? "2025-06-18";

const IMAGINE_CLI_TOOL = {
  name: "imagine_cli",
  description:
    "Run an imagine CLI command and return its stdout, stderr, exit status, and timeout state. Pass only the arguments after `imagine`; the `mcp` subcommand is blocked to avoid recursion.",
  inputSchema: {
    type: "object",
    properties: {
      args: {
        type: "array",
        items: { type: "string" },
        description:
          'Arguments to pass after `imagine`, for example ["image", "a cat", "--provider", "openai"].',
      },
      timeoutMs: {
        type: "number",
        minimum: 1,
        maximum: 600_000,
        description: "Optional command timeout in milliseconds. Defaults to 120000.",
      },
    },
    required: ["args"],
    additionalProperties: false,
  },
};

export function registerMcpCommand(program: Command): void {
  program
    .command("mcp")
    .description("Run an MCP stdio server exposing the imagine CLI to other agents")
    .action(async () => {
      try {
        await runMcpServer();
      } catch (err) {
        process.stderr.write(`mcp failed: ${(err as Error).message}\n`);
        process.exit(1);
      }
    });
}

async function runMcpServer(): Promise<void> {
  process.stdin.setEncoding("utf8");

  let buffer = "";
  process.stdin.on("data", (chunk: string) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      void handleLine(trimmed);
    }
  });

  await new Promise<void>((resolve) => {
    process.stdin.on("end", resolve);
  });
}

async function handleLine(line: string): Promise<void> {
  let request: JsonRpcRequest;
  try {
    request = JSON.parse(line) as JsonRpcRequest;
  } catch {
    writeError(null, -32700, "Parse error");
    return;
  }

  if (request.jsonrpc !== "2.0" || typeof request.method !== "string") {
    writeError(request.id ?? null, -32600, "Invalid Request");
    return;
  }

  if (request.id === undefined) {
    return;
  }

  try {
    switch (request.method) {
      case "initialize":
        writeResult(request.id, {
          protocolVersion: resolveProtocolVersion(request.params),
          capabilities: {
            tools: {},
          },
          serverInfo: SERVER_INFO,
        });
        return;
      case "ping":
        writeResult(request.id, {});
        return;
      case "tools/list":
        writeResult(request.id, { tools: [IMAGINE_CLI_TOOL] });
        return;
      case "tools/call":
        writeResult(request.id, await callTool(request.params));
        return;
      case "resources/list":
        writeResult(request.id, { resources: [] });
        return;
      case "prompts/list":
        writeResult(request.id, { prompts: [] });
        return;
      default:
        writeError(request.id, -32601, `Method not found: ${request.method}`);
    }
  } catch (err) {
    writeError(request.id, -32000, (err as Error).message);
  }
}

function resolveProtocolVersion(params: unknown): string {
  const requested =
    isRecord(params) && typeof params.protocolVersion === "string"
      ? params.protocolVersion
      : DEFAULT_PROTOCOL_VERSION;
  if (
    !SUPPORTED_PROTOCOL_VERSIONS.includes(requested as (typeof SUPPORTED_PROTOCOL_VERSIONS)[number])
  ) {
    throw new Error(`Unsupported protocolVersion: ${requested}`);
  }
  return requested;
}

async function callTool(params: unknown): Promise<unknown> {
  if (!isRecord(params) || params.name !== IMAGINE_CLI_TOOL.name) {
    throw new Error(`Unknown tool: ${isRecord(params) ? String(params.name) : "(missing)"}`);
  }

  const toolArguments = isRecord(params.arguments) ? (params.arguments as ToolCallArgs) : {};
  const result = await runImagineCli(toolArguments);
  const isError = result.status !== 0 || result.timedOut;

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(result, null, 2),
      },
    ],
    ...(isError ? { isError: true } : {}),
  };
}

async function runImagineCli(input: ToolCallArgs): Promise<{
  stdout: string;
  stderr: string;
  status: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
}> {
  if (!Array.isArray(input.args) || !input.args.every((arg) => typeof arg === "string")) {
    throw new Error("args must be an array of strings");
  }
  const args = input.args;
  if (args[0] === "mcp") {
    throw new Error("the mcp subcommand cannot be called from the MCP server");
  }

  const timeoutMs = normalizeTimeout(input.timeoutMs);
  const entry = process.argv[1];
  if (!entry) {
    throw new Error("cannot locate imagine CLI entrypoint");
  }

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [entry, ...args], {
      env: { ...process.env, NO_COLOR: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (status, signal) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, status, signal, timedOut });
    });
  });
}

function normalizeTimeout(value: unknown): number {
  if (value === undefined) return 120_000;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error("timeoutMs must be a positive number");
  }
  return Math.min(Math.floor(value), 600_000);
}

function writeResult(id: JsonRpcId, result: unknown): void {
  writeMessage({ jsonrpc: "2.0", id, result });
}

function writeError(id: JsonRpcId, code: number, message: string): void {
  writeMessage({ jsonrpc: "2.0", id, error: { code, message } });
}

function writeMessage(message: unknown): void {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
