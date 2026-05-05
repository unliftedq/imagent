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

interface McpTool {
  name: string;
  description: string;
  commandPrefix?: string[];
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties: false;
  };
}

const SERVER_INFO = {
  name: "imagent",
  version: "0.0.1",
};

const SUPPORTED_PROTOCOL_VERSIONS = ["2024-11-05", "2025-03-26", "2025-06-18"] as const;
const DEFAULT_PROTOCOL_VERSION =
  SUPPORTED_PROTOCOL_VERSIONS[SUPPORTED_PROTOCOL_VERSIONS.length - 1] ?? "2025-06-18";
const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_TIMEOUT_MS = 600_000;

const SUBCOMMAND_ARGS_SCHEMA = {
  type: "array",
  items: { type: "string" },
  description: "Arguments to pass after the mapped imagent subcommand.",
};

const TIMEOUT_SCHEMA = {
  type: "number",
  minimum: 1,
  maximum: MAX_TIMEOUT_MS,
  description: "Optional command timeout in milliseconds. Defaults to 120000.",
};

function subcommandTool(name: string, command: string, description: string): McpTool {
  return {
    name,
    description,
    commandPrefix: [command],
    inputSchema: {
      type: "object",
      properties: {
        args: SUBCOMMAND_ARGS_SCHEMA,
        timeoutMs: TIMEOUT_SCHEMA,
      },
      required: ["args"],
      additionalProperties: false,
    },
  };
}

const MCP_TOOLS: McpTool[] = [
  subcommandTool(
    "imagent_doctor",
    "doctor",
    'Check whether imagent is ready to run. Verifies the data directory, database/FTS setup, config files, and configured provider count. Pass args after `imagent doctor`, for example [] or ["--help"].',
  ),
  subcommandTool(
    "imagent_image",
    "image",
    'Generate one or more images from a text prompt. Use for text-to-image requests, provider/model overrides, output count, size/aspect, seed, negative prompt, freeform references, and character/object/background/style asset slots. Pass args after `imagent image`, for example ["a cinematic robot portrait", "--provider", "openai", "--count", "2"].',
  ),
  subcommandTool(
    "imagent_video",
    "video",
    'Submit or wait for a video generation job from a text prompt. Use for text-to-video requests, provider/model overrides, duration, FPS, resolution/aspect, reference images, asset slots, and `--wait` progress streaming. Pass args after `imagent video`, for example ["a camera orbit around a glass sculpture", "--duration", "5", "--wait"].',
  ),
  subcommandTool(
    "imagent_config",
    "config",
    'Inspect or edit local provider secrets and config paths. Use to set/get API keys, endpoints, or base URLs for openai, azure-openai, google, flux-bfl, bytedance, and xai, or to locate config files. Pass args after `imagent config`, for example ["set", "openai.apiKey", "sk-..."] or ["path"].',
  ),
  subcommandTool(
    "imagent_catalog",
    "catalog",
    'Inspect and manage the local model catalog at ~/.imagent/catalog.json. Use to find the catalog path, show available image/video models filtered by provider or kind, or reset the catalog to bundled defaults. Pass args after `imagent catalog`, for example ["show", "--kind", "image"] or ["reset", "--force"].',
  ),
  subcommandTool(
    "imagent_asset",
    "asset",
    'Manage reusable generation assets: characters, objects, backgrounds, and styles. Use to add reference assets, list/search assets, inspect stored paths and metadata, or remove assets. Pass args after `imagent asset`, for example ["add", "character", "--name", "Ari", "--ref", "./ari.png"] or ["list", "--kind", "style"].',
  ),
  subcommandTool(
    "imagent_gallery",
    "gallery",
    'Browse and curate prior generations stored in the local gallery. Use to list/filter outputs, show prompts/files/lineage/attached assets, remix an existing item, delete an item, or toggle favorites. Pass args after `imagent gallery`, for example ["ls", "--favorite"] or ["show", "<itemId>"].',
  ),
  subcommandTool(
    "imagent_job",
    "job",
    'Inspect and control generation jobs. Use to list jobs, check status/progress, cancel queued or running work, or watch a job until completion. Pass args after `imagent job`, for example ["ls", "--state", "running"] or ["watch", "<jobId>"].',
  ),
];

const MCP_TOOL_BY_NAME = new Map(MCP_TOOLS.map((tool) => [tool.name, tool]));

const PUBLIC_MCP_TOOLS = MCP_TOOLS.map(({ commandPrefix: _commandPrefix, ...tool }) => tool);

export function registerMcpCommand(program: Command): void {
  program
    .command("mcp")
    .description("Run an MCP stdio server exposing the imagent CLI to other agents")
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
  let processing = Promise.resolve();
  process.stdin.on("data", (chunk: string) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      processing = processing
        .then(() => handleLine(trimmed))
        .catch((err) => writeError(null, -32000, (err as Error).message));
    }
  });

  await new Promise<void>((resolve) => {
    process.stdin.on("end", resolve);
  });
  await processing;
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
        writeResult(request.id, { tools: PUBLIC_MCP_TOOLS });
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
  const paramsRecord = isRecord(params) ? params : undefined;
  const tool =
    paramsRecord && typeof paramsRecord.name === "string"
      ? MCP_TOOL_BY_NAME.get(paramsRecord.name)
      : undefined;
  if (!paramsRecord || !tool) {
    throw new Error(`Unknown tool: ${paramsRecord ? String(paramsRecord.name) : "(missing)"}`);
  }

  const toolArguments = isRecord(paramsRecord.arguments)
    ? (paramsRecord.arguments as ToolCallArgs)
    : {};
  const result = await runImagineCli(toolArguments, tool.commandPrefix ?? []);
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

async function runImagineCli(
  input: ToolCallArgs,
  prefix: string[],
): Promise<{
  stdout: string;
  stderr: string;
  status: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
}> {
  if (!Array.isArray(input.args) || !input.args.every((arg) => typeof arg === "string")) {
    throw new Error("args must be an array of strings");
  }
  const args = [...prefix, ...input.args];
  if (args[0] === "mcp") {
    throw new Error("the mcp subcommand cannot be called from the MCP server");
  }

  const timeoutMs = normalizeTimeout(input.timeoutMs);
  const entry = process.argv[1];
  if (!entry) {
    throw new Error("cannot locate imagent CLI entrypoint");
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
  if (value === undefined) return DEFAULT_TIMEOUT_MS;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error("timeoutMs must be a positive number");
  }
  return Math.min(Math.floor(value), MAX_TIMEOUT_MS);
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
