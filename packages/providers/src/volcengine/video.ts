import type {
  VideoCapabilities,
  VideoGenerationResult,
  VideoJobHandle,
  VideoJobStatus,
  VideoModelDef,
  VideoProvider,
  VideoRequest,
} from "@imagine-studio/core";

export interface SeedanceVideoProviderOptions {
  apiKey: string;
  baseUrl: string;
  region: string;
  models: ReadonlyMap<string, VideoModelDef>;
}

/**
 * Seedance — Volcengine video provider. Async lifecycle:
 *   submit() → returns providerJobId quickly
 *   poll()   → state + progress (server-side TTL is 12h)
 *   fetch()  → MP4 bytes once state === 'succeeded'
 * The full implementation lands in M2 along with the JobRunner polling loop.
 */
export class SeedanceVideoProvider implements VideoProvider {
  readonly id = "seedance";
  readonly displayName = "Seedance (Volcengine)";
  readonly capabilities: VideoCapabilities;
  readonly models: ReadonlyMap<string, VideoModelDef>;

  constructor(private readonly options: SeedanceVideoProviderOptions) {
    this.models = options.models;
    this.capabilities = aggregateVideoCapabilities(options.models);
  }

  async submit(_req: VideoRequest): Promise<VideoJobHandle> {
    throw new Error("not implemented (M2)");
  }

  async poll(_handle: VideoJobHandle): Promise<VideoJobStatus> {
    throw new Error("not implemented (M2)");
  }

  async fetch(_handle: VideoJobHandle): Promise<VideoGenerationResult> {
    throw new Error("not implemented (M2)");
  }

  async cancel(_handle: VideoJobHandle): Promise<void> {
    throw new Error("not implemented (M2)");
  }
}

export function aggregateVideoCapabilities(
  models: ReadonlyMap<string, VideoModelDef>,
): VideoCapabilities {
  const durationsSec = new Set<number>();
  const fpsOptions = new Set<number>();
  const resolutions = new Set<string>();
  let maxDurationSec = 0;
  let supportsFirstFrame = false;
  let supportsLastFrame = false;
  let supportsRefImages = false;
  for (const m of models.values()) {
    const c = m.capabilities;
    if (!c) continue;
    for (const d of c.durationsSec ?? []) durationsSec.add(d);
    for (const f of c.fpsOptions ?? []) fpsOptions.add(f);
    for (const r of c.resolutions ?? []) resolutions.add(r);
    if (c.maxDurationSec !== undefined) maxDurationSec = Math.max(maxDurationSec, c.maxDurationSec);
    supportsFirstFrame ||= c.supportsFirstFrame;
    supportsLastFrame ||= c.supportsLastFrame;
    supportsRefImages ||= c.supportsRefImages;
  }
  return {
    durationsSec: [...durationsSec].sort((a, b) => a - b),
    maxDurationSec,
    fpsOptions: [...fpsOptions].sort((a, b) => a - b),
    resolutions: [...resolutions],
    supportsFirstFrame,
    supportsLastFrame,
    supportsRefImages,
  };
}
