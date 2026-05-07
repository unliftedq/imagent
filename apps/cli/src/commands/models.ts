import type { ImageModelDef, VideoModelDef } from "@imagent/core";
import {
  effectiveImageOfferings,
  effectiveProviderDisplayName,
  effectiveVideoOfferings,
} from "@imagent/providers";
import chalk from "chalk";
import type { Command } from "commander";

import { loadCliRuntime } from "./runtime.js";

interface ModelsOptions {
  kind?: string;
  provider?: string;
  configured?: boolean;
  json?: boolean;
}

interface OptionsCommandArgs {
  provider?: string;
  model?: string;
  kind?: string;
  json?: boolean;
}

/**
 * `imagent models` — list every provider/model pair in the catalog.
 * `imagent options --provider <id> --model <id>` — print the concrete request
 * options, capabilities, and defaults for a specific model so agents can
 * craft a valid `imagent image|video` invocation without guessing.
 *
 * Both commands operate against the resolved catalog (canonical model caps
 * merged with any provider override). `models --configured` filters to
 * providers that have credentials in `~/.imagent/secrets.json`, which is the
 * subset the runtime can actually call.
 */
export function registerModelsCommand(program: Command): void {
  program
    .command("models")
    .description("List every provider/model available in the catalog (image + video)")
    .option("--kind <kind>", "Filter by kind: 'image' or 'video'")
    .option("--provider <id>", "Filter to a single provider id")
    .option("--configured", "Only show providers with credentials in secrets.json", false)
    .option("--json", "Emit machine-readable JSON instead of the human-friendly table", false)
    .action(async (options: ModelsOptions) => {
      try {
        await runModels(options);
      } catch (err) {
        process.stderr.write(`models failed: ${(err as Error).message}\n`);
        process.exitCode = 1;
      }
    });
}

export function registerOptionsCommand(program: Command): void {
  program
    .command("options")
    .description(
      "Show the request options/capabilities for a specific provider+model (use before `imagent image` / `imagent video`)",
    )
    .requiredOption("--provider <id>", "Provider id (e.g. openai, azure, google, flux-bfl, bytedance, xai)")
    .requiredOption("--model <id>", "Model/offering id as it appears under that provider")
    .option("--kind <kind>", "Disambiguate when the same id exists for both kinds: 'image' or 'video'")
    .option("--json", "Emit machine-readable JSON instead of the human-friendly view", false)
    .action(async (options: OptionsCommandArgs) => {
      try {
        await runOptions(options);
      } catch (err) {
        process.stderr.write(`options failed: ${(err as Error).message}\n`);
        process.exitCode = 1;
      }
    });
}

async function runModels(options: ModelsOptions): Promise<void> {
  const kind = normalizeKind(options.kind);
  const runtime = await loadCliRuntime();
  const filterProvider = options.provider;

  const rows: Array<{
    providerId: string;
    providerDisplay: string;
    kind: "image" | "video";
    modelId: string;
    baseModelId?: string;
    displayName?: string;
    configured: boolean;
  }> = [];

  // Iterate the union of providers known to the catalog and to the user's
  // routing overlay. Custom OpenAI providers live under
  // `prefs.customOpenAI.<id>` and won't appear in `catalog.providers`.
  const providerIds = new Set<string>([
    ...Object.keys(runtime.catalog.providers),
    ...Object.keys(runtime.config.providers.customOpenAI ?? {}),
  ]);

  for (const providerId of providerIds) {
    if (filterProvider && providerId !== filterProvider) continue;
    const configured = isProviderConfigured(providerId, runtime.imageRegistry, runtime.videoRegistry);
    if (options.configured && !configured) continue;

    const providerDisplay = effectiveProviderDisplayName(
      runtime.catalog,
      runtime.config.providers,
      providerId,
    );
    const includeImage = !kind || kind === "image";
    const includeVideo = !kind || kind === "video";

    if (includeImage) {
      for (const offering of effectiveImageOfferings(
        runtime.catalog,
        runtime.config.providers,
        providerId,
      )) {
        const base = runtime.catalog.models.image[offering.modelId];
        rows.push({
          providerId,
          providerDisplay,
          kind: "image",
          modelId: offering.id,
          baseModelId: offering.modelId !== offering.id ? offering.modelId : undefined,
          displayName: offering.displayName ?? base?.displayName,
          configured,
        });
      }
    }
    if (includeVideo) {
      for (const offering of effectiveVideoOfferings(
        runtime.catalog,
        runtime.config.providers,
        providerId,
      )) {
        const base = runtime.catalog.models.video[offering.modelId];
        rows.push({
          providerId,
          providerDisplay,
          kind: "video",
          modelId: offering.id,
          baseModelId: offering.modelId !== offering.id ? offering.modelId : undefined,
          displayName: offering.displayName ?? base?.displayName,
          configured,
        });
      }
    }
  }

  if (options.json) {
    process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
    return;
  }

  if (rows.length === 0) {
    const filterDesc = [
      filterProvider ? `provider=${filterProvider}` : null,
      kind ? `kind=${kind}` : null,
      options.configured ? "configured-only" : null,
    ]
      .filter(Boolean)
      .join(", ");
    process.stdout.write(
      `${chalk.yellow("no models matched")}${filterDesc ? ` (${filterDesc})` : ""}\n`,
    );
    return;
  }

  // Group by provider, then by kind, for a readable layout.
  const grouped = new Map<string, typeof rows>();
  for (const row of rows) {
    const list = grouped.get(row.providerId);
    if (list) list.push(row);
    else grouped.set(row.providerId, [row]);
  }

  let first = true;
  for (const [providerId, list] of grouped) {
    if (!first) process.stdout.write("\n");
    first = false;
    const display = list[0]?.providerDisplay ?? providerId;
    const status = list[0]?.configured ? chalk.green("configured") : chalk.dim("not configured");
    process.stdout.write(`${chalk.bold(providerId)} ${chalk.dim(`(${display})`)} ${status}\n`);

    const imageRows = list.filter((r) => r.kind === "image");
    const videoRows = list.filter((r) => r.kind === "video");
    if (imageRows.length > 0) {
      process.stdout.write(`  ${chalk.cyan("image:")}\n`);
      for (const r of imageRows) process.stdout.write(`    ${formatModelLine(r)}\n`);
    }
    if (videoRows.length > 0) {
      process.stdout.write(`  ${chalk.magenta("video:")}\n`);
      for (const r of videoRows) process.stdout.write(`    ${formatModelLine(r)}\n`);
    }
  }
  process.stdout.write(
    `\n${chalk.dim("hint: run `imagent options --provider <id> --model <id>` to see request options for a model.")}\n`,
  );
}

function formatModelLine(row: {
  modelId: string;
  baseModelId?: string;
  displayName?: string;
}): string {
  const parts = [chalk.bold(row.modelId)];
  if (row.displayName && row.displayName !== row.modelId) {
    parts.push(chalk.dim(`— ${row.displayName}`));
  }
  if (row.baseModelId) parts.push(chalk.dim(`[base=${row.baseModelId}]`));
  return parts.join(" ");
}

async function runOptions(options: OptionsCommandArgs): Promise<void> {
  const providerId = options.provider;
  const modelId = options.model;
  if (!providerId || !modelId) {
    throw new Error("--provider and --model are required");
  }
  const requestedKind = normalizeKind(options.kind);
  const runtime = await loadCliRuntime();

  // Effective offerings: catalog (canonical) merged with config overlay
  // (Azure deployments, customOpenAI). A provider is "known" if either side
  // has an entry for it.
  const imageOfferings = effectiveImageOfferings(
    runtime.catalog,
    runtime.config.providers,
    providerId,
  );
  const videoOfferings = effectiveVideoOfferings(
    runtime.catalog,
    runtime.config.providers,
    providerId,
  );
  if (
    !runtime.catalog.providers[providerId] &&
    !runtime.config.providers.customOpenAI?.[providerId]
  ) {
    const known = [
      ...Object.keys(runtime.catalog.providers),
      ...Object.keys(runtime.config.providers.customOpenAI ?? {}),
    ]
      .filter((id, i, a) => a.indexOf(id) === i)
      .join(", ");
    throw new Error(`unknown provider '${providerId}'. Known providers: ${known}`);
  }

  type Resolved =
    | { kind: "image"; def: ImageModelDef; baseModelId: string }
    | { kind: "video"; def: VideoModelDef; baseModelId: string };

  const matches: Resolved[] = [];

  if (!requestedKind || requestedKind === "image") {
    const offering = imageOfferings.find((m) => m.id === modelId);
    if (offering) {
      const provider = runtime.imageRegistry.get(providerId);
      const def = provider?.models.get(modelId);
      if (def) {
        matches.push({ kind: "image", def, baseModelId: offering.modelId });
      } else {
        // Provider not configured: still resolve via catalog so users can
        // inspect capabilities before adding credentials.
        const { resolveImageProviderModel } = await import("@imagent/providers");
        const resolved = resolveImageProviderModel(runtime.catalog, providerId, offering);
        matches.push({ kind: "image", def: resolved, baseModelId: offering.modelId });
      }
    }
  }
  if (!requestedKind || requestedKind === "video") {
    const offering = videoOfferings.find((m) => m.id === modelId);
    if (offering) {
      const provider = runtime.videoRegistry.get(providerId);
      const def = provider?.models.get(modelId);
      if (def) {
        matches.push({ kind: "video", def, baseModelId: offering.modelId });
      } else {
        const { resolveVideoProviderModel } = await import("@imagent/providers");
        const resolved = resolveVideoProviderModel(runtime.catalog, providerId, offering);
        matches.push({ kind: "video", def: resolved, baseModelId: offering.modelId });
      }
    }
  }

  if (matches.length === 0) {
    const imageIds = imageOfferings.map((m) => m.id);
    const videoIds = videoOfferings.map((m) => m.id);
    const hint =
      imageIds.length || videoIds.length
        ? `Available models for '${providerId}': image=[${imageIds.join(", ")}] video=[${videoIds.join(", ")}]`
        : `Provider '${providerId}' has no offerings. Run \`imagent config provider add ${providerId} <id> --model <canonical>\` to add one.`;
    throw new Error(`unknown model '${modelId}' for provider '${providerId}'. ${hint}`);
  }
  if (matches.length > 1 && !requestedKind) {
    throw new Error(
      `model '${modelId}' is registered for both image and video under '${providerId}'. Pass --kind image or --kind video to disambiguate.`,
    );
  }

  const match = matches[0]!;
  const configured =
    match.kind === "image"
      ? runtime.imageRegistry.has(providerId)
      : runtime.videoRegistry.has(providerId);

  if (options.json) {
    const payload = {
      provider: providerId,
      kind: match.kind,
      modelId: match.def.id,
      baseModelId: match.def.baseModelId ?? match.baseModelId,
      displayName: match.def.displayName,
      configured,
      capabilities: match.def.capabilities ?? null,
      defaults: match.def.defaults ?? null,
      requestOptions:
        match.kind === "image"
          ? supportedImageOptionDescriptors(match.def)
          : supportedVideoOptionDescriptors(match.def),
      examples: buildExamples(providerId, match),
    };
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }

  // Pretty output.
  process.stdout.write(
    `${chalk.bold(`${providerId} / ${match.def.id}`)} ${chalk.dim(`(${match.kind})`)}\n`,
  );
  if (match.def.displayName) {
    process.stdout.write(`${chalk.dim("name:        ")}${match.def.displayName}\n`);
  }
  if (match.def.baseModelId && match.def.baseModelId !== match.def.id) {
    process.stdout.write(`${chalk.dim("base model:  ")}${match.def.baseModelId}\n`);
  }
  process.stdout.write(
    `${chalk.dim("status:      ")}${configured ? chalk.green("configured") : chalk.yellow("not configured (set credentials with `imagent config set`)")}\n`,
  );

  // Request options that --option key=value accepts.
  const descriptors =
    match.kind === "image"
      ? supportedImageOptionDescriptors(match.def)
      : supportedVideoOptionDescriptors(match.def);
  process.stdout.write(`\n${chalk.cyan("request options")} ${chalk.dim("(--option key=value)")}:\n`);
  if (descriptors.length === 0) {
    process.stdout.write(`  ${chalk.dim("(none — pass only the prompt)")}\n`);
  } else {
    for (const d of descriptors) {
      const allowed = d.allowed?.length ? `  values: ${d.allowed.join(" | ")}` : "";
      const note = d.note ? `  ${chalk.dim(d.note)}` : "";
      process.stdout.write(`  ${chalk.bold(d.key)}${allowed}${note}\n`);
    }
  }

  // Defaults the runtime applies when an option is omitted.
  if (match.def.defaults && Object.keys(match.def.defaults).length > 0) {
    process.stdout.write(`\n${chalk.cyan("defaults")}:\n`);
    for (const [k, v] of Object.entries(match.def.defaults)) {
      process.stdout.write(`  ${chalk.bold(k)} = ${JSON.stringify(v)}\n`);
    }
  }

  // Reference image limits (relevant for `--ref/--character/...` slots).
  const refSummary = formatReferenceSummary(match);
  if (refSummary) process.stdout.write(`\n${chalk.cyan("references")}:\n${refSummary}`);

  // Capability flags (everything not already covered).
  const flagSummary = formatCapabilityFlags(match);
  if (flagSummary) process.stdout.write(`\n${chalk.cyan("capabilities")}:\n${flagSummary}`);

  process.stdout.write("\n");
  for (const example of buildExamples(providerId, match)) {
    process.stdout.write(`${chalk.dim("example: ")}${example}\n`);
  }
}

interface OptionDescriptor {
  key: string;
  allowed?: string[];
  note?: string;
}

function supportedImageOptionDescriptors(model: ImageModelDef): OptionDescriptor[] {
  const caps = model.capabilities;
  const out: OptionDescriptor[] = [];
  out.push({ key: "count", note: "positive integer (number of outputs)" });
  if (!caps) {
    return [
      ...out,
      { key: "size", note: "model has no capability metadata; provider will validate" },
      { key: "aspectRatio" },
      { key: "quality" },
      { key: "outputFormat" },
      { key: "negativePrompt" },
      { key: "seed", note: "positive integer" },
    ];
  }
  if (caps.sizes && caps.sizes.length > 0) out.push({ key: "size", allowed: [...caps.sizes] });
  if (caps.supportsArbitrarySize)
    out.push({ key: "size", note: "arbitrary WxH also accepted (supportsArbitrarySize=true)" });
  if (caps.aspectRatios && caps.aspectRatios.length > 0)
    out.push({ key: "aspectRatio", allowed: [...caps.aspectRatios] });
  if (caps.qualities && caps.qualities.length > 0)
    out.push({ key: "quality", allowed: [...caps.qualities] });
  if (caps.outputFormats && caps.outputFormats.length > 0)
    out.push({ key: "outputFormat", allowed: [...caps.outputFormats] });
  if (caps.supportsNegativePrompt) out.push({ key: "negativePrompt" });
  if (caps.supportsSeed) out.push({ key: "seed", note: "positive integer" });
  return out;
}

function supportedVideoOptionDescriptors(model: VideoModelDef): OptionDescriptor[] {
  const caps = model.capabilities;
  if (!caps) {
    return [
      { key: "durationSec", note: "positive number; provider will validate" },
      { key: "fps", note: "positive number" },
      { key: "resolution" },
      { key: "aspectRatio" },
      { key: "firstFrame", note: "path to a starting-frame image" },
      { key: "lastFrame", note: "path to an ending-frame image" },
      { key: "negativePrompt" },
    ];
  }
  const out: OptionDescriptor[] = [];
  if (caps.durationsSec && caps.durationsSec.length > 0) {
    out.push({
      key: "durationSec",
      allowed: caps.durationsSec.map((n) => String(n)),
      note: caps.maxDurationSec ? `max ${caps.maxDurationSec}s` : undefined,
    });
  } else if (caps.maxDurationSec) {
    out.push({ key: "durationSec", note: `max ${caps.maxDurationSec}s` });
  }
  if (caps.fpsOptions && caps.fpsOptions.length > 0) {
    out.push({ key: "fps", allowed: caps.fpsOptions.map((n) => String(n)) });
  }
  if (caps.resolutions && caps.resolutions.length > 0) {
    out.push({ key: "resolution", allowed: [...caps.resolutions] });
  }
  if (caps.aspectRatios && caps.aspectRatios.length > 0) {
    out.push({ key: "aspectRatio", allowed: [...caps.aspectRatios] });
  }
  if (caps.supportsFirstFrame) out.push({ key: "firstFrame", note: "path to a starting-frame image" });
  if (caps.supportsLastFrame) out.push({ key: "lastFrame", note: "path to an ending-frame image" });
  return out;
}

function formatReferenceSummary(
  match:
    | { kind: "image"; def: ImageModelDef }
    | { kind: "video"; def: VideoModelDef },
): string | undefined {
  const caps = match.def.capabilities;
  if (!caps) return undefined;
  const lines: string[] = [];
  if (typeof caps.maxReferences === "number") {
    if (caps.maxReferences === 0) {
      lines.push(`  ${chalk.dim("references not supported (maxReferences=0)")}`);
    } else {
      lines.push(`  max references: ${caps.maxReferences}`);
    }
  }
  if (typeof caps.maxReferenceSizeMb === "number") {
    lines.push(`  max reference size: ${caps.maxReferenceSizeMb} MB`);
  }
  if (match.kind === "image") {
    const ic = match.def.capabilities;
    if (ic?.supportsStyleRef) lines.push(`  supports style references`);
  } else {
    const vc = match.def.capabilities;
    if (vc?.supportsRefImages) lines.push(`  supports image references`);
  }
  return lines.length > 0 ? `${lines.join("\n")}\n` : undefined;
}

function formatCapabilityFlags(
  match:
    | { kind: "image"; def: ImageModelDef }
    | { kind: "video"; def: VideoModelDef },
): string | undefined {
  const caps = match.def.capabilities;
  if (!caps) return undefined;
  const lines: string[] = [];
  if (match.kind === "image") {
    const ic = match.def.capabilities;
    if (typeof ic?.maxOutputs === "number") lines.push(`  max outputs per request: ${ic.maxOutputs}`);
  }
  return lines.length > 0 ? `${lines.join("\n")}\n` : undefined;
}

function buildExamples(
  providerId: string,
  match:
    | { kind: "image"; def: ImageModelDef }
    | { kind: "video"; def: VideoModelDef },
): string[] {
  const examples: string[] = [];
  if (match.kind === "image") {
    const caps = match.def.capabilities;
    const opts: string[] = [];
    if (caps?.sizes?.[0]) opts.push(`--option size=${caps.sizes[0]}`);
    else if (caps?.aspectRatios?.[0]) opts.push(`--option aspectRatio=${caps.aspectRatios[0]}`);
    if (caps?.qualities?.[0]) opts.push(`--option quality=${caps.qualities[0]}`);
    examples.push(
      `imagent image "your prompt" --provider ${providerId} --model ${match.def.id}${opts.length ? ` ${opts.join(" ")}` : ""} --out ./outputs`,
    );
  } else {
    const caps = match.def.capabilities;
    const opts: string[] = [];
    if (caps?.durationsSec?.[0]) opts.push(`--option durationSec=${caps.durationsSec[0]}`);
    if (caps?.resolutions?.[0]) opts.push(`--option resolution=${caps.resolutions[0]}`);
    if (caps?.aspectRatios?.[0]) opts.push(`--option aspectRatio=${caps.aspectRatios[0]}`);
    examples.push(
      `imagent video "your prompt" --provider ${providerId} --model ${match.def.id}${opts.length ? ` ${opts.join(" ")}` : ""} --wait --out ./outputs`,
    );
  }
  return examples;
}

function isProviderConfigured(
  providerId: string,
  imageRegistry: ReadonlyMap<string, unknown>,
  videoRegistry: ReadonlyMap<string, unknown>,
): boolean {
  return imageRegistry.has(providerId) || videoRegistry.has(providerId);
}

function normalizeKind(kind: string | undefined): "image" | "video" | undefined {
  if (!kind) return undefined;
  const lower = kind.toLowerCase();
  if (lower !== "image" && lower !== "video") {
    throw new Error(`--kind must be 'image' or 'video' (got '${kind}')`);
  }
  return lower;
}
