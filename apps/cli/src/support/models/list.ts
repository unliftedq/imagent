import {
  effectiveAudioOfferings,
  effectiveImageOfferings,
  effectiveProviderDisplayName,
  effectiveVideoOfferings,
  resolveAudioProviderModel,
} from "@imagent/providers";
import { combineAudioFormat } from "@imagent/core";
import chalk from "chalk";

import { loadCliRuntime } from "../runtime.js";
import type { ModelsOptions } from "./shared.js";
import type { ModelKind } from "./shared.js";
import { isProviderConfigured, normalizeKind } from "./shared.js";

export async function runModels(options: ModelsOptions): Promise<void> {
  const kind = normalizeKind(options.kind);
  const runtime = await loadCliRuntime();
  const filterProvider = options.provider;

  const rows: Array<{
    providerId: string;
    providerDisplay: string;
    kind: ModelKind;
    modelId: string;
    baseModelId?: string;
    displayName?: string;
    configured: boolean;
    voices?: string[];
    outputFormats?: string[];
  }> = [];

  const providerIds = new Set<string>([
    ...Object.keys(runtime.catalog.providers),
    ...Object.keys(runtime.config.providers.customOpenAI ?? {}),
  ]);

  for (const providerId of providerIds) {
    if (filterProvider && providerId !== filterProvider) continue;
    const anyConfigured = isProviderConfigured(
      providerId,
      runtime.imageRegistry,
      runtime.videoRegistry,
      runtime.audioRegistry,
    );
    if (options.configured && !anyConfigured) continue;

    const providerDisplay = effectiveProviderDisplayName(
      runtime.catalog,
      runtime.config.providers,
      providerId,
    );
    const includeImage = !kind || kind === "image";
    const includeVideo = !kind || kind === "video";
    const includeAudio = !kind || kind === "audio";

    if (includeImage) {
      for (const offering of effectiveImageOfferings(
        runtime.catalog,
        runtime.config.providers,
        providerId,
      )) {
        const base = runtime.catalog.models.image[offering.modelId];
        const configured = runtime.imageRegistry.has(providerId);
        if (options.configured && !configured) continue;
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
        const configured = runtime.videoRegistry.has(providerId);
        if (options.configured && !configured) continue;
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
    if (includeAudio) {
      for (const offering of effectiveAudioOfferings(
        runtime.catalog,
        runtime.config.providers,
        providerId,
      )) {
        const provider = runtime.audioRegistry.get(providerId);
        const configured = runtime.audioRegistry.has(providerId);
        if (options.configured && !configured) continue;
        const resolved =
          provider?.models.get(offering.id) ??
          resolveAudioProviderModel(runtime.catalog, providerId, offering);
        rows.push({
          providerId,
          providerDisplay,
          kind: "audio",
          modelId: offering.id,
          baseModelId: offering.modelId !== offering.id ? offering.modelId : undefined,
          displayName: offering.displayName ?? resolved.displayName,
          configured,
          voices: resolved.capabilities?.voices?.map((v) => v.id),
          outputFormats: resolved.capabilities?.outputFormats?.flatMap((fmt) =>
            fmt.qualities.length > 0
              ? fmt.qualities.map((q) => combineAudioFormat(fmt.codec, q))
              : [fmt.codec],
          ),
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
    const audioRows = list.filter((r) => r.kind === "audio");
    if (imageRows.length > 0) {
      process.stdout.write(`  ${chalk.cyan("image:")}\n`);
      for (const r of imageRows) process.stdout.write(`    ${formatModelLine(r)}\n`);
    }
    if (videoRows.length > 0) {
      process.stdout.write(`  ${chalk.magenta("video:")}\n`);
      for (const r of videoRows) process.stdout.write(`    ${formatModelLine(r)}\n`);
    }
    if (audioRows.length > 0) {
      process.stdout.write(`  ${chalk.blue("audio:")}\n`);
      for (const r of audioRows) process.stdout.write(`    ${formatModelLine(r)}\n`);
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
  voices?: string[];
  outputFormats?: string[];
}): string {
  const parts = [chalk.bold(row.modelId)];
  if (row.displayName && row.displayName !== row.modelId) {
    parts.push(chalk.dim(`— ${row.displayName}`));
  }
  if (row.baseModelId) parts.push(chalk.dim(`[base=${row.baseModelId}]`));
  if (row.voices?.length) parts.push(chalk.dim(`[voices=${row.voices.join(",")}]`));
  if (row.outputFormats?.length) parts.push(chalk.dim(`[formats=${row.outputFormats.join(",")}]`));
  return parts.join(" ");
}
