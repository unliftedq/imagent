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

export interface ProviderModelsSummary {
  id: string;
  displayName: string;
  configured: Partial<Record<ModelKind, boolean>>;
  models: Partial<Record<ModelKind, string[]>>;
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
    .command("options")
    .alias("capabilities")
    .description("Show supported --option key=value parameters for one provider/model")
    .requiredOption("--provider <id>", "Provider id")
    .requiredOption("--model <id>", "Provider-facing model id")
    .option("--kind <kind>", "Filter by kind: image or video")
    .option("--json", "Print machine-readable JSON")
    .addHelpText(
      "after",
      `

Examples:
  $ imagent options --provider openai --model gpt-image-2
  $ imagent capabilities --provider bytedance --model doubao-seedance-1-0-pro-250528 --json

Use these keys with generation commands, for example:
  $ imagent image "prompt" --provider openai --option quality=high
`,
    )
    .action(async (options: OptionsOptions) => {
      await runDiscovery("options", options);
    });
}

export function registerConfigModelCommands(config: Command): void {
  config
    .command("models")
    .alias("providers")
    .description("List providers with their available provider-facing models")
    .option("--provider <id>", "Filter to one provider id")
    .option("--kind <kind>", "Filter by kind: image or video")
    .option("--configured", "Show only configured provider/kind entries", false)
    .option("--json", "Print machine-readable JSON")
    .addHelpText(
      "after",
      `

Examples:
  $ imagent config models
  $ imagent config models --provider openai
  $ imagent config models --configured --json
`,
    )
    .action(async (options: FilterOptions & { configured?: boolean }) => {
      try {
        const runtime = await loadCliRuntime();
        const kind = parseKind(options.kind);
        const summaries = listProviderModels(runtime, {
          kind,
          provider: options.provider,
          configuredOnly: options.configured,
        });
        writeOutput(summaries, formatProviderModels(summaries), options.json);
      } catch (err) {
        process.stderr.write(`config models failed: ${(err as Error).message}\n`);
        process.exitCode = 1;
      }
    });
}

async function runDiscovery(mode: "options", options: OptionsOptions): Promise<void> {
  try {
    const runtime = await loadCliRuntime();
    const kind = parseKind(options.kind);
    const models = listModels(runtime, kind, options.provider);
    const filtered = models.filter((model) => model.id === options.model);
    writeOutput(filtered, formatOptions(filtered), options.json);
  } catch (err) {
    process.stderr.write(`${mode} failed: ${(err as Error).message}\n`);
    process.exitCode = 1;
  }
}

export function listProviderModels(
  runtime: CliRuntime,
  options: { kind?: ModelKind; provider?: string; configuredOnly?: boolean } = {},
): ProviderModelsSummary[] {
  const out: ProviderModelsSummary[] = [];
  for (const [id, provider] of Object.entries(runtime.catalog.providers)) {
    if (options.provider && id !== options.provider) continue;
    const imageConfigured = runtime.imageRegistry.has(id);
    const videoConfigured = runtime.videoRegistry.has(id);
    const imageModels =
      (!options.kind || options.kind === "image") &&
      (!options.configuredOnly || imageConfigured) &&
      provider.image
        ? provider.image.map((model) => model.id)
        : undefined;
    const videoModels =
      (!options.kind || options.kind === "video") &&
      (!options.configuredOnly || videoConfigured) &&
      provider.video
        ? provider.video.map((model) => model.id)
        : undefined;
    if (!imageModels && !videoModels) continue;
    const summary: ProviderModelsSummary = {
      id,
      displayName: provider.displayName ?? id,
      configured: {
        ...(provider.image ? { image: imageConfigured } : {}),
        ...(provider.video ? { video: videoConfigured } : {}),
      },
      models: {
        ...(imageModels ? { image: imageModels } : {}),
        ...(videoModels ? { video: videoModels } : {}),
      },
    };
    out.push(summary);
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

export function formatProviderModels(providers: ProviderModelsSummary[]): string {
  if (providers.length === 0) return "No provider models matched.\n";
  const lines = ["Provider models:"];
  for (const provider of providers) {
    const groups: string[] = [];
    if (provider.models.image) {
      groups.push(
        `image ${statusBadge(provider.configured.image)}: ${provider.models.image.join(", ")}`,
      );
    }
    if (provider.models.video) {
      groups.push(
        `video ${statusBadge(provider.configured.video)}: ${provider.models.video.join(", ")}`,
      );
    }
    lines.push(`  ${chalk.bold(provider.id)} | ${groups.join("; ")}`);
  }
  lines.push("");
  lines.push(chalk.dim("Use `imagent options --provider <id> --model <id>` for option values."));
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
      if (option.aliases && option.aliases.length > 0) {
        parts.push(`aliases: ${option.aliases.join(", ")}`);
      }
      if (option.values && option.values.length > 0) {
        parts.push(`values: ${option.values.join(", ")}`);
      }
      if (option.min !== undefined) parts.push(`min: ${option.min}`);
      if (option.max !== undefined) parts.push(`max: ${option.max}`);
      if (option.default !== undefined) parts.push(`default: ${String(option.default)}`);
      lines.push(`    --option ${parts.join("; ")}`);
      lines.push(`      ${option.description}`);
    }
    const referenceLimit = referenceLimitLabel(model.capabilities);
    if (referenceLimit) lines.push(`    references: max ${referenceLimit}`);
  }
  return `${lines.join("\n")}\n`;
}

function referenceLimitLabel(caps: Record<string, unknown> | undefined): string | undefined {
  if (!caps) return undefined;
  if (typeof caps.maxReferences === "number") return `${caps.maxReferences}`;
  if (caps.supportsRefImages === false) return "0";
  return undefined;
}

function statusBadge(configured: boolean | undefined): string {
  return configured ? chalk.green("configured") : chalk.yellow("not-configured");
}
