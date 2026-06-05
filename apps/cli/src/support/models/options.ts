import type { AudioModelDef, ImageModelDef, VideoModelDef } from "@imagent/core";
import chalk from "chalk";
import {
  effectiveAudioOfferings,
  effectiveImageOfferings,
  effectiveVideoOfferings,
} from "@imagent/providers";

import { loadCliRuntime } from "../runtime.js";
import {
  buildExamples,
  formatCapabilityFlags,
  formatReferenceSummary,
  supportedAudioOptionDescriptors,
  supportedImageOptionDescriptors,
  supportedVideoOptionDescriptors,
} from "./descriptors.js";
import type { OptionsCommandArgs } from "./shared.js";
import { normalizeKind } from "./shared.js";

export async function runOptions(options: OptionsCommandArgs): Promise<void> {
  const providerId = options.provider;
  const modelId = options.model;
  if (!providerId || !modelId) {
    throw new Error("--provider and --model are required");
  }
  const requestedKind = normalizeKind(options.kind);
  const runtime = await loadCliRuntime();

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
  const audioOfferings = effectiveAudioOfferings(
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
    | { kind: "video"; def: VideoModelDef; baseModelId: string }
    | { kind: "audio"; def: AudioModelDef; baseModelId: string };

  const matches: Resolved[] = [];

  if (!requestedKind || requestedKind === "image") {
    const offering = imageOfferings.find((m) => m.id === modelId);
    if (offering) {
      const provider = runtime.imageRegistry.get(providerId);
      const def = provider?.models.get(modelId);
      if (def) {
        matches.push({ kind: "image", def, baseModelId: offering.modelId });
      } else {
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
  if (!requestedKind || requestedKind === "audio") {
    const offering = audioOfferings.find((m) => m.id === modelId);
    if (offering) {
      const provider = runtime.audioRegistry.get(providerId);
      const def = provider?.models.get(modelId);
      if (def) {
        matches.push({ kind: "audio", def, baseModelId: offering.modelId });
      } else {
        const { resolveAudioProviderModel } = await import("@imagent/providers");
        const resolved = resolveAudioProviderModel(runtime.catalog, providerId, offering);
        matches.push({ kind: "audio", def: resolved, baseModelId: offering.modelId });
      }
    }
  }

  if (matches.length === 0) {
    const imageIds = imageOfferings.map((m) => m.id);
    const videoIds = videoOfferings.map((m) => m.id);
    const audioIds = audioOfferings.map((m) => m.id);
    const hint =
      imageIds.length || videoIds.length || audioIds.length
        ? `Available models for '${providerId}': image=[${imageIds.join(", ")}] video=[${videoIds.join(", ")}] audio=[${audioIds.join(", ")}]`
        : `Provider '${providerId}' has no offerings. Run \`imagent config provider add ${providerId} <id> --model <canonical>\` to add one.`;
    throw new Error(`unknown model '${modelId}' for provider '${providerId}'. ${hint}`);
  }
  if (matches.length > 1 && !requestedKind) {
    throw new Error(
      `model '${modelId}' is registered for multiple kinds under '${providerId}'. Pass --kind image, --kind video, or --kind audio to disambiguate.`,
    );
  }

  const match = matches[0]!;
  const configured =
    match.kind === "image"
      ? runtime.imageRegistry.has(providerId)
      : match.kind === "video"
        ? runtime.videoRegistry.has(providerId)
        : runtime.audioRegistry.has(providerId);

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
          : match.kind === "video"
            ? supportedVideoOptionDescriptors(match.def)
            : supportedAudioOptionDescriptors(match.def),
      examples: buildExamples(providerId, match),
    };
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }

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

  const descriptors =
    match.kind === "image"
      ? supportedImageOptionDescriptors(match.def)
      : match.kind === "video"
        ? supportedVideoOptionDescriptors(match.def)
        : supportedAudioOptionDescriptors(match.def);
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

  if (match.def.defaults && Object.keys(match.def.defaults).length > 0) {
    process.stdout.write(`\n${chalk.cyan("defaults")}:\n`);
    for (const [k, v] of Object.entries(match.def.defaults)) {
      process.stdout.write(`  ${chalk.bold(k)} = ${JSON.stringify(v)}\n`);
    }
  }

  const refSummary = formatReferenceSummary(match);
  if (refSummary) process.stdout.write(`\n${chalk.cyan("references")}:\n${refSummary}`);

  const flagSummary = formatCapabilityFlags(match);
  if (flagSummary) process.stdout.write(`\n${chalk.cyan("capabilities")}:\n${flagSummary}`);

  process.stdout.write("\n");
  for (const example of buildExamples(providerId, match)) {
    process.stdout.write(`${chalk.dim("example: ")}${example}\n`);
  }
}
