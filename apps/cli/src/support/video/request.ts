import type { VideoModelDef, VideoProvider, VideoRequest } from "@imagent/core";
import chalk from "chalk";

import { buildAssetSlots, capReferences } from "../asset-slots.js";
import type { CliRuntime, RunnerBundle } from "../runtime.js";
import { coerceScalar, parseKeyValueOptions, parsePositiveNumberOption } from "../util.js";
import type { VideoGenerateOptions } from "./shared.js";
import { resolveVideoSelection, videoProviderConfigHint } from "./shared.js";

export async function prepareVideoRequest(
  runtime: CliRuntime,
  bundle: RunnerBundle,
  prompt: string,
  options: VideoGenerateOptions,
): Promise<{
  provider: VideoProvider;
  providerId: string;
  model: string;
  request: VideoRequest;
  slots: Awaited<ReturnType<typeof buildAssetSlots>>;
}> {
  const { providerId, model } = resolveVideoSelection(
    runtime.config.app.defaultVideoModel,
    runtime.videoRegistry,
    options.provider,
    options.model,
  );
  const provider = runtime.videoRegistry.get(providerId);
  if (!provider) {
    throw new Error(
      `video provider '${providerId}' is not configured. Run \`${videoProviderConfigHint(providerId)}\` first.`,
    );
  }
  const resolved = provider.models.get(model);
  if (!resolved) {
    throw new Error(`unknown model '${model}' for video provider '${providerId}'`);
  }
  const requestOptions = parseVideoOptions(options.option ?? [], resolved);
  const supportsRefs = resolved?.capabilities?.supportsRefImages !== false;
  const maxRefs = supportsRefs ? undefined : 0;

  const slots = await buildAssetSlots(runtime.resolver, bundle.db, {
    characters: options.character ?? [],
    objects: options.object ?? [],
    backgrounds: options.background ?? [],
    styles: options.style ?? [],
  });
  const allRefPaths = [...(options.ref ?? []), ...slots.referencePaths];
  const { references: cappedRefs, capped } = capReferences(allRefPaths, maxRefs);
  if (capped !== undefined) {
    process.stderr.write(`${chalk.yellow("warn:")} capped at ${capped} references for model '${model}'\n`);
  }
  const promptWithStyle = slots.stylePromptSnippets.length
    ? `${prompt} ${slots.stylePromptSnippets.join(" ")}`
    : prompt;

  return {
    provider,
    providerId,
    model,
    slots,
    request: {
      prompt: promptWithStyle,
      providerId,
      model,
      ...requestOptions,
      references: cappedRefs.map((p) => ({ path: p, role: "freeform" as const })),
      assetIds: slots.assetIds,
    },
  };
}

export function parseVideoOptions(values: readonly string[], model: VideoModelDef): Partial<VideoRequest> {
  const pairs = parseKeyValueOptions(values);
  const out: Partial<VideoRequest> = {};
  const raw: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(pairs)) {
    const canonical = videoOptionAliases[key] ?? key;
    if (canonical.startsWith("raw.")) {
      const rawKey = canonical.slice(4);
      if (!rawKey) throw new Error(`invalid video option '${key}'`);
      raw[rawKey] = coerceScalar(value);
      continue;
    }
    assertVideoOptionSupported(canonical, model);
    switch (canonical) {
      case "durationSec":
        out.durationSec = parsePositiveNumberOption("video", canonical, value);
        break;
      case "fps":
        out.fps = parsePositiveNumberOption("video", canonical, value);
        break;
      case "resolution":
        out.resolution = value;
        break;
      case "aspectRatio":
        out.aspectRatio = value;
        break;
      case "firstFrame":
        out.firstFrame = value;
        break;
      case "lastFrame":
        out.lastFrame = value;
        break;
      default:
        throw new Error(
          `unknown video option '${key}'. Supported for ${model.id}: ${supportedVideoOptions(model).join(", ")}`,
        );
    }
  }

  if (Object.keys(raw).length > 0) out.raw = raw;
  return out;
}

const videoOptionAliases: Record<string, string> = {
  duration: "durationSec",
  aspect: "aspectRatio",
};

function assertVideoOptionSupported(key: string, model: VideoModelDef): void {
  if (supportedVideoOptions(model).includes(key)) return;
  throw new Error(
    `model '${model.id}' does not advertise video option '${key}'. Supported: ${supportedVideoOptions(model).join(", ")}`,
  );
}

function supportedVideoOptions(model: VideoModelDef): string[] {
  const caps = model.capabilities;
  if (!caps) {
    return ["durationSec", "fps", "resolution", "aspectRatio", "firstFrame", "lastFrame"];
  }
  const keys: string[] = [];
  if (caps.durationsSec || caps.maxDurationSec) keys.push("durationSec");
  if (caps.fpsOptions && caps.fpsOptions.length > 0) keys.push("fps");
  if (caps.resolutions && caps.resolutions.length > 0) keys.push("resolution");
  if (caps.aspectRatios && caps.aspectRatios.length > 0) keys.push("aspectRatio");
  if (caps.supportsFirstFrame) keys.push("firstFrame");
  if (caps.supportsLastFrame) keys.push("lastFrame");
  return keys;
}
