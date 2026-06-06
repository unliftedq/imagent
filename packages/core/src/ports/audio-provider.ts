import type { AudioModelDef, AudioOutputFormat, VoiceInfo } from "../domain/model.js";
import type { AudioRequest } from "../domain/request.js";
import type { AudioGenerationResult } from "../domain/result.js";
import type { ProviderTestResult } from "./image-provider.js";

/** Aggregate audio capability snapshot across the provider's enabled models. */
export interface AudioCapabilities {
  readonly outputFormats: readonly AudioOutputFormat[];
  readonly supportsVoiceDiscovery: boolean;
}

export interface AudioProvider {
  readonly id: string;
  readonly displayName: string;
  readonly capabilities: AudioCapabilities;
  readonly models: ReadonlyMap<string, AudioModelDef>;
  synthesize(req: AudioRequest, signal?: AbortSignal): Promise<AudioGenerationResult>;
  /** Optional live voice discovery. Implementations MUST NOT throw on auth/network — wrap and rethrow as ProviderError so callers can fall back. */
  listVoices?(signal?: AbortSignal): Promise<VoiceInfo[]>;
  /** Optional minimal authenticated probe. Never throws; returns `{ ok:false }`. */
  test?(signal?: AbortSignal): Promise<ProviderTestResult>;
}

export type { VoiceInfo };
