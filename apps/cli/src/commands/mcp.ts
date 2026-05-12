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
    'Health check. Verifies the data directory, DB/FTS, config files, and lists every provider with the concrete image+video models it would expose plus whether credentials are present. Run this first to see what you can call. Args go after `imagent doctor`, e.g. [] or ["--help"].',
  ),
  subcommandTool(
    "imagent_models",
    "models",
    'List every provider/model pair available in the catalog. Filter with --kind image|video, --provider <id>, or --configured (only providers with credentials). Add --json for machine-readable output. Use this to discover what to pass to `imagent image|video --provider <id> --model <id>`. Example args: ["--kind", "image", "--configured"] or ["--provider", "openai", "--json"].',
  ),
  subcommandTool(
    "imagent_options",
    "options",
    'Show the request options, capabilities, defaults, and reference-image limits for a specific provider/model. Use this before calling `imagent image|video` to know exactly which `--option key=value` pairs (size, aspectRatio, quality, durationSec, ...) the model accepts and what values are valid. Add --json for machine-readable output. Required args: --provider <id> --model <id>. Example args: ["--provider", "openai", "--model", "gpt-image-2"] or ["--provider", "google", "--model", "veo-3.0-generate-001", "--kind", "video", "--json"].',
  ),
  subcommandTool(
    "imagent_image",
    "image",
    'Generate one or more images from a text prompt. First run `imagent_models --kind image` and `imagent_options --provider <id> --model <id>` to learn which models are available and which `--option key=value` keys they accept. Supports provider/model overrides, repeatable freeform `--ref` paths, character/object/background/style asset slots by slug, and `--out <dir>` to copy the gallery result. Args go after `imagent image`, e.g. ["generate", "a cinematic robot portrait", "--provider", "openai", "--model", "gpt-image-2", "--option", "size=1024x1024", "--option", "count=2", "--out", "./outputs"].',
  ),
  subcommandTool(
    "imagent_video",
    "video",
    'Submit, track, and download video jobs. First run `imagent_models --kind video` and `imagent_options --provider <id> --model <id> --kind video` to learn which models are available and which `--option key=value` keys they accept (durationSec, resolution, aspectRatio, fps, firstFrame, ...). `generate` defaults to async submission; pass `--wait` to poll until completion and download into the gallery. Use `status <jobId>` and `download <jobId>` for async jobs. Args go after `imagent video`, e.g. ["generate", "a camera orbit around a glass sculpture", "--provider", "google", "--model", "veo-3.0-generate-001", "--option", "durationSec=8", "--wait", "--out", "./outputs"].',
  ),
  subcommandTool(
    "imagent_config",
    "config",
    'Inspect, edit, or reset local provider credentials, preferences, and per-user routing. Subcommands: `set <key> <value>`, `get [key]`, `path` (locate config.json/catalog.json/secrets.json), `reset <target>` where target is `catalog` | `secrets` | `config`, and `provider <add|rm|list>` for per-user model routing (Azure deployments, custom OpenAI providers). Recognised secret keys: <vendor>.apiKey, azure.endpoint, bytedance.endpoint, <vendor>.baseUrl. Vendors: openai | azure | google | flux-bfl | bytedance | xai. Args go after `imagent config`, e.g. ["set", "openai.apiKey", "sk-..."], ["provider", "add", "azure", "my-deployment", "--model", "gpt-image-2"], ["provider", "list"], or ["reset", "catalog", "--force"]. Use `imagent_models` / `imagent_options` to inspect what canonical model ids exist.',
  ),
  subcommandTool(
    "imagent_asset",
    "asset",
    'Manage reusable generation assets: characters, objects, backgrounds, and styles. Assets are referenced by slug from `imagent image|video --character/--object/--background/--style <slug>`. Args go after `imagent asset`, e.g. ["add", "character", "--name", "Ari", "--ref", "./ari.png"], ["list", "--kind", "style"], or ["show", "<assetId>"].',
  ),
  subcommandTool(
    "imagent_gallery",
    "gallery",
    'Browse and curate prior generations. Args go after `imagent gallery`, e.g. ["ls", "--favorite"], ["show", "<itemId>"], ["remix", "<itemId>", "--prompt-suffix", "in pencil"], or ["rm", "<itemId>", "--force"]. Item ids are persistent and survive across CLI sessions.',
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
