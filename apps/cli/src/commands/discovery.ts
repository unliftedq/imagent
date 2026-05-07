import type { ImageModelDef, VideoModelDef } from "@imagent/core";
import { resolveImageProviderModels, resolveVideoProviderModels } from "@imagent/providers";
import chalk from "chalk";
import type { Command } from "commander";

import {
  describeImageOptions,
  describeVideoOptions,
  type OptionDescriptor,
} from "./model-options.js";
import { type CliRuntime, loadCliRuntime } from "./runtime.js";

type ModelKind = "image" | "video";

interface JsonOption {
  json?: boolean;
}

interface FilterOptions extends JsonOption {
  provider?: string;
  kind?: string;
}

interface OptionsOptions extends FilterOptions {
  model?: string;
}

interface ProviderSummary {
  id: string;
  displayName: string;
  kinds: ModelKind[];
  configured: Partial<Record<ModelKind, boolean>>;
  modelCount: Partial<Record<ModelKind, number>>;
}

interface ModelSummary {
  provider: string;
  kind: ModelKind;
  id: string;
  canonicalModelId?: string;
  displayName?: string;
  configured: boolean;
  defaults?: Record<string, unknown>;
  capabilities?: Record<string, unknown>;
  options: OptionDescriptor[];
}

export function registerDiscoveryCommands(program: Command): void {
  program
    .command("providers")
    .description("List provider availability without exposing secrets")
    .option("--kind <kind>", "Filter by kind: image or video")
    .option("--json", "Print machine-readable JSON")
    .addHelpText(
      "after",
      `

Examples:
  $ imagent providers
  $ imagent providers --kind image --json
`,
    )
    .action(async (options: FilterOptions) => {
      await runDiscovery("providers", options);
    });

  program
    .command("models")
    .description("List provider-facing models and their configured status")
    .option("--provider <id>", "Filter to one provider id")
    .option("--kind <kind>", "Filter by kind: image or video")
    .option("--json", "Print machine-readable JSON")
    .addHelpText(
      "after",
      `

Examples:
  $ imagent models --provider openai
  $ imagent models --kind video --json
`,
    )
    .action(async (options: FilterOptions) => {
      await runDiscovery("models", options);
    });

  program
    .command("options")
    .alias("capabilities")
    .description("Show supported --option key=value parameters for models")
    .option("--provider <id>", "Filter to one provider id")
    .option("--kind <kind>", "Filter by kind: image or video")
    .option("--model <id>", "Filter to one provider-facing model id")
    .option("--json", "Print machine-readable JSON")
    .addHelpText(
      "after",
      `

Examples:
  $ imagent options --provider openai --model gpt-image-2
  $ imagent capabilities --kind video --json

Use these keys with generation commands, for example:
  $ imagent image "prompt" --provider openai --option quality=high
`,
    )
    .action(async (options: OptionsOptions) => {
      await runDiscovery("options", options);
    });
}

async function runDiscovery(
  mode: "providers" | "models" | "options",
  options: FilterOptions | OptionsOptions,
): Promise<void> {
  try {
    const runtime = await loadCliRuntime();
    const kind = parseKind(options.kind);
    if (mode === "providers") {
      const providers = listProviders(runtime, kind);
      writeOutput(providers, formatProviders(providers), options.json);
      return;
    }

    const models = listModels(runtime, kind, options.provider);
    if (mode === "models") {
      writeOutput(models, formatModels(models), options.json);
      return;
    }

    const modelFilter = "model" in options ? options.model : undefined;
    const filtered = modelFilter ? models.filter((model) => model.id === modelFilter) : models;
    writeOutput(filtered, formatOptions(filtered), options.json);
  } catch (err) {
    process.stderr.write(`${mode} failed: ${(err as Error).message}\n`);
    process.exitCode = 1;
  }
}

function listProviders(runtime: CliRuntime, kind: ModelKind | undefined): ProviderSummary[] {
  const out: ProviderSummary[] = [];
  for (const [id, provider] of Object.entries(runtime.catalog.providers)) {
    const imageCount = provider.image?.length ?? 0;
    const videoCount = provider.video?.length ?? 0;
    const kinds = [
      ...(imageCount > 0 ? (["image"] as const) : []),
      ...(videoCount > 0 ? (["video"] as const) : []),
    ].filter((candidate) => !kind || candidate === kind);
    if (kinds.length === 0) continue;
    out.push({
      id,
      displayName: provider.displayName ?? id,
      kinds,
      configured: {
        ...(imageCount > 0 ? { image: runtime.imageRegistry.has(id) } : {}),
        ...(videoCount > 0 ? { video: runtime.videoRegistry.has(id) } : {}),
      },
      modelCount: {
        ...(imageCount > 0 ? { image: imageCount } : {}),
        ...(videoCount > 0 ? { video: videoCount } : {}),
      },
    });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

function listModels(
  runtime: CliRuntime,
  kind: ModelKind | undefined,
  providerFilter: string | undefined,
): ModelSummary[] {
  const out: ModelSummary[] = [];
  for (const providerId of Object.keys(runtime.catalog.providers).sort()) {
    if (providerFilter && providerId !== providerFilter) continue;
    if (!kind || kind === "image") {
      out.push(
        ...resolveImageProviderModels(runtime.catalog, providerId).map((model) =>
          summarizeImageModel(providerId, model, runtime.imageRegistry.has(providerId)),
        ),
      );
    }
    if (!kind || kind === "video") {
      out.push(
        ...resolveVideoProviderModels(runtime.catalog, providerId).map((model) =>
          summarizeVideoModel(providerId, model, runtime.videoRegistry.has(providerId)),
        ),
      );
    }
  }
  return out;
}

function summarizeImageModel(
  provider: string,
  model: ImageModelDef,
  configured: boolean,
): ModelSummary {
  return {
    provider,
    kind: "image",
    id: model.id,
    canonicalModelId: model.baseModelId,
    displayName: model.displayName,
    configured,
    defaults: model.defaults,
    capabilities: model.capabilities,
    options: describeImageOptions(model),
  };
}

function summarizeVideoModel(
  provider: string,
  model: VideoModelDef,
  configured: boolean,
): ModelSummary {
  return {
    provider,
    kind: "video",
    id: model.id,
    canonicalModelId: model.baseModelId,
    displayName: model.displayName,
    configured,
    defaults: model.defaults,
    capabilities: model.capabilities,
    options: describeVideoOptions(model),
  };
}

function parseKind(value: string | undefined): ModelKind | undefined {
  if (!value) return undefined;
  const lower = value.toLowerCase();
  if (lower !== "image" && lower !== "video") {
    throw new Error(`--kind must be 'image' or 'video' (got '${value}')`);
  }
  return lower;
}

function writeOutput(data: unknown, text: string, json = false): void {
  process.stdout.write(json ? `${JSON.stringify(data, null, 2)}\n` : text);
}

function formatProviders(providers: ProviderSummary[]): string {
  if (providers.length === 0) return "No providers matched.\n";
  const lines = ["Providers:"];
  for (const provider of providers) {
    const kinds = provider.kinds
      .map(
        (kind) =>
          `${kind}:${provider.configured[kind] ? "configured" : "not-configured"}(${provider.modelCount[kind] ?? 0} models)`,
      )
      .join(", ");
    lines.push(`  ${chalk.bold(provider.id)} — ${provider.displayName} [${kinds}]`);
  }
  lines.push("");
  lines.push(
    chalk.dim(
      "Use `imagent models --provider <id>` and `imagent options --provider <id> --model <id>`.",
    ),
  );
  return `${lines.join("\n")}\n`;
}

function formatModels(models: ModelSummary[]): string {
  if (models.length === 0) return "No models matched.\n";
  const lines = ["Models:"];
  for (const model of models) {
    lines.push(
      `  ${chalk.bold(`${model.provider}/${model.kind}/${model.id}`)} ` +
        `${model.configured ? chalk.green("configured") : chalk.yellow("not-configured")}`,
    );
    if (model.displayName) lines.push(`    name: ${model.displayName}`);
    if (model.canonicalModelId && model.canonicalModelId !== model.id) {
      lines.push(`    canonical: ${model.canonicalModelId}`);
    }
    lines.push(`    options: ${model.options.map((option) => option.key).join(", ") || "(none)"}`);
  }
  lines.push("");
  lines.push(
    chalk.dim(
      "Use `imagent options --provider <id> --model <id>` for accepted values and defaults.",
    ),
  );
  return `${lines.join("\n")}\n`;
}

function formatOptions(models: ModelSummary[]): string {
  if (models.length === 0) return "No model options matched.\n";
  const lines = ["Model options:"];
  for (const model of models) {
    lines.push(`  ${chalk.bold(`${model.provider}/${model.kind}/${model.id}`)}`);
    if (model.options.length === 0) {
      lines.push("    (no catalog-declared --option keys)");
      continue;
    }
    for (const option of model.options) {
      const parts = [`${option.key}=<${option.type}>`];
      if (option.aliases && option.aliases.length > 0)
        parts.push(`aliases: ${option.aliases.join(", ")}`);
      if (option.values && option.values.length > 0)
        parts.push(`values: ${option.values.join(", ")}`);
      if (option.min !== undefined) parts.push(`min: ${option.min}`);
      if (option.max !== undefined) parts.push(`max: ${option.max}`);
      if (option.default !== undefined) parts.push(`default: ${String(option.default)}`);
      lines.push(`    --option ${parts.join("; ")}`);
      lines.push(`      ${option.description}`);
    }
    const caps = model.capabilities ?? {};
    const referenceLimit =
      typeof caps.maxReferences === "number"
        ? `${caps.maxReferences}`
        : caps.supportsRefImages === false
          ? "0"
          : undefined;
    if (referenceLimit) lines.push(`    references: max ${referenceLimit}`);
  }
  return `${lines.join("\n")}\n`;
}
