import type {
  AudioCapabilities,
  AudioModelDef,
  ImageCapabilities,
  ImageModelDef,
  VideoCapabilities,
  VideoModelDef,
} from "@imagent/core";

/**
 * Aggregate per-model image capabilities into the union shown by the provider
 * class. Set-union for enumerated knobs, max for numeric caps, logical-OR for
 * boolean flags. Empty input still produces a well-formed shape.
 */
export function aggregateImageCapabilities(
  models: ReadonlyMap<string, ImageModelDef>,
): ImageCapabilities {
  const sizes = new Set<string>();
  let supportsArbitrarySize = false;
  const aspectRatios = new Set<string>();
  let maxReferences = 0;
  let maxReferenceSizeMb: number | undefined;
  let maxOutputs = 1;
  let supportsStyleRef = false;
  for (const m of models.values()) {
    const c = m.capabilities;
    if (!c) continue;
    for (const s of c.sizes ?? []) sizes.add(s);
    supportsArbitrarySize ||= c.supportsArbitrarySize === true;
    for (const a of c.aspectRatios ?? []) aspectRatios.add(a);
    maxReferences = Math.max(maxReferences, c.maxReferences ?? 0);
    if (c.maxReferenceSizeMb !== undefined) {
      maxReferenceSizeMb = Math.max(maxReferenceSizeMb ?? 0, c.maxReferenceSizeMb);
    }
    maxOutputs = Math.max(maxOutputs, c.maxOutputs);
    supportsStyleRef ||= c.supportsStyleRef;
  }
  return {
    sizes: [...sizes],
    ...(supportsArbitrarySize ? { supportsArbitrarySize } : {}),
    aspectRatios: [...aspectRatios],
    maxReferences,
    ...(maxReferenceSizeMb !== undefined ? { maxReferenceSizeMb } : {}),
    maxOutputs,
    supportsStyleRef,
  };
}

/**
 * Aggregate per-model video capabilities. Same rules as the image version —
 * set-union for enumerations, max for numeric caps, OR for booleans.
 */
export function aggregateVideoCapabilities(
  models: ReadonlyMap<string, VideoModelDef>,
): VideoCapabilities {
  const durationsSec = new Set<number>();
  const fpsOptions = new Set<number>();
  const resolutions = new Set<string>();
  const aspectRatios = new Set<string>();
  let maxDurationSec = 0;
  let maxReferences: number | undefined;
  let maxReferenceSizeMb: number | undefined;
  let supportsFirstFrame = false;
  let supportsLastFrame = false;
  let supportsRefImages = false;
  for (const m of models.values()) {
    const c = m.capabilities;
    if (!c) continue;
    for (const d of c.durationsSec ?? []) durationsSec.add(d);
    for (const f of c.fpsOptions ?? []) fpsOptions.add(f);
    for (const r of c.resolutions ?? []) resolutions.add(r);
    for (const a of c.aspectRatios ?? []) aspectRatios.add(a);
    if (c.maxDurationSec !== undefined) maxDurationSec = Math.max(maxDurationSec, c.maxDurationSec);
    if (c.maxReferences !== undefined)
      maxReferences = Math.max(maxReferences ?? 0, c.maxReferences);
    if (c.maxReferenceSizeMb !== undefined) {
      maxReferenceSizeMb = Math.max(maxReferenceSizeMb ?? 0, c.maxReferenceSizeMb);
    }
    supportsFirstFrame ||= c.supportsFirstFrame;
    supportsLastFrame ||= c.supportsLastFrame;
    supportsRefImages ||= c.supportsRefImages;
  }
  return {
    durationsSec: [...durationsSec].sort((a, b) => a - b),
    maxDurationSec,
    fpsOptions: [...fpsOptions].sort((a, b) => a - b),
    resolutions: [...resolutions],
    ...(aspectRatios.size > 0 ? { aspectRatios: [...aspectRatios] } : {}),
    ...(maxReferences !== undefined ? { maxReferences } : {}),
    ...(maxReferenceSizeMb !== undefined ? { maxReferenceSizeMb } : {}),
    supportsFirstFrame,
    supportsLastFrame,
    supportsRefImages,
  };
}

export function aggregateAudioCapabilities(
  models: ReadonlyMap<string, AudioModelDef>,
): AudioCapabilities {
  const qualitiesByCodec = new Map<string, Set<string>>();
  const codecOrder: string[] = [];
  let supportsVoiceDiscovery = false;
  for (const m of models.values()) {
    const c = m.capabilities;
    if (!c) continue;
    for (const fmt of c.outputFormats ?? []) {
      let qualities = qualitiesByCodec.get(fmt.codec);
      if (!qualities) {
        qualities = new Set<string>();
        qualitiesByCodec.set(fmt.codec, qualities);
        codecOrder.push(fmt.codec);
      }
      for (const q of fmt.qualities) qualities.add(q);
    }
    supportsVoiceDiscovery ||= c.supportsVoiceDiscovery === true;
  }
  const outputFormats = codecOrder.map((codec) => ({
    codec,
    qualities: [...(qualitiesByCodec.get(codec) ?? [])],
  }));
  return { outputFormats, supportsVoiceDiscovery };
}
