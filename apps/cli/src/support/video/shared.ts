import type { DefaultModelPreference } from "@imagent/config";
import type { Job, JobState, VideoProvider } from "@imagent/core";
import chalk from "chalk";

import type { CliRuntime } from "../runtime.js";

export interface VideoGenerateOptions {
  provider?: string;
  model?: string;
  option?: string[];
  ref?: string[];
  character?: string[];
  object?: string[];
  background?: string[];
  style?: string[];
  wait?: boolean;
  out?: string;
}

export interface RemoteVideoTaskSnapshot {
  job: Job;
  providerState: string | null;
  progress: number | null | undefined;
  errorMessage: string | null | undefined;
}

export const VALID_STATES: JobState[] = ["queued", "running", "succeeded", "failed", "cancelled"];
export const VALID_STATE_VALUES = new Set<string>(VALID_STATES);
export const VIDEO_TASK_LS_REFRESH_CONCURRENCY = 5;

export function isValidJobState(state: string): state is JobState {
  return VALID_STATE_VALUES.has(state);
}

export function getVideoProvider(runtime: CliRuntime, providerId: string): VideoProvider {
  const provider = runtime.videoRegistry.get(providerId);
  if (!provider) throw new Error(`video provider '${providerId}' is not configured`);
  return provider;
}

export function videoProviderConfigHint(providerId: string): string {
  switch (providerId) {
    case "azure":
      return "imagent config set azure.endpoint <url> && imagent config set azure.apiKey <key>";
    case "byteplus":
      return "imagent config set byteplus.endpoint <url> && imagent config set byteplus.apiKey <key>";
    case "volcengine":
      return "imagent config set volcengine.endpoint <url> && imagent config set volcengine.apiKey <key>";
    default:
      return `imagent config set ${providerId}.apiKey <key>`;
  }
}

export function requireVideoJob(job: Job | null, id: string): Job {
  if (!job) throw new Error(`no job with id '${id}'`);
  if (job.kind !== "video") throw new Error(`job '${id}' is not a video job`);
  return job;
}

function pickVideoModel(
  providerId: string,
  modelOverride: string | undefined,
  providerModels: ReadonlyMap<string, unknown>,
): string {
  if (modelOverride) return modelOverride;
  const first = providerModels.keys().next().value;
  if (typeof first === "string") return first;
  throw new Error(`no model configured for video provider '${providerId}'`);
}

export function resolveVideoSelection(
  configuredDefault: DefaultModelPreference | null,
  registry: ReadonlyMap<string, { models: ReadonlyMap<string, unknown> }>,
  providerOverride: string | undefined,
  modelOverride: string | undefined,
): { providerId: string; model: string } {
  if (providerOverride) {
    const provider = registry.get(providerOverride);
    if (!provider) return { providerId: providerOverride, model: modelOverride ?? "" };
    return {
      providerId: providerOverride,
      model: pickVideoModel(providerOverride, modelOverride, provider.models),
    };
  }

  if (modelOverride) {
    for (const [providerId, provider] of registry) {
      if (provider.models.has(modelOverride)) return { providerId, model: modelOverride };
    }
  }

  if (
    !modelOverride &&
    configuredDefault &&
    registry.get(configuredDefault.providerId)?.models.has(configuredDefault.modelId)
  ) {
    return {
      providerId: configuredDefault.providerId,
      model: configuredDefault.modelId,
    };
  }

  const first = registry.entries().next().value;
  if (first) {
    const [providerId, provider] = first;
    return { providerId, model: pickVideoModel(providerId, modelOverride, provider.models) };
  }
  throw new Error(
    "no video providers configured. Run `imagent config set <vendor>.apiKey ...` first.",
  );
}

export function refreshedProgress(
  providerState: string,
  statusProgress: number | undefined,
  persistedProgress: number | null | undefined,
): number | null | undefined {
  switch (providerState) {
    case "succeeded":
      return 1;
    case "failed":
    case "cancelled":
    case "queued":
    case "running":
    default:
      return statusProgress ?? persistedProgress;
  }
}

export function stateBadge(state: string): string {
  switch (state) {
    case "queued":
      return chalk.dim(state);
    case "running":
      return chalk.cyan(state);
    case "succeeded":
      return chalk.green(state);
    case "failed":
      return chalk.red(state);
    case "cancelled":
      return chalk.yellow(state);
    default:
      return state;
  }
}
