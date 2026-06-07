import type { SpeechModelDef, SpeechOutputFormat, VoiceInfo } from "../domain/model.js";
import type { SpeechRequest } from "../domain/request.js";
import type { SpeechGenerationResult } from "../domain/result.js";
import type { ProviderTestResult } from "./image-provider.js";

/** Aggregate speech capability snapshot across the provider's enabled models. */
export interface SpeechCapabilities {
  readonly outputFormats: readonly SpeechOutputFormat[];
  readonly supportsVoiceDiscovery: boolean;
}

export interface SpeechProvider {
  readonly id: string;
  readonly displayName: string;
  readonly capabilities: SpeechCapabilities;
  readonly models: ReadonlyMap<string, SpeechModelDef>;
  synthesize(req: SpeechRequest, signal?: AbortSignal): Promise<SpeechGenerationResult>;
  /** Optional live voice discovery. Implementations MUST NOT throw on auth/network — wrap and rethrow as ProviderError so callers can fall back. */
  listVoices?(signal?: AbortSignal): Promise<VoiceInfo[]>;
  /** Optional minimal authenticated probe. Never throws; returns `{ ok:false }`. */
  test?(signal?: AbortSignal): Promise<ProviderTestResult>;
}

export type { VoiceInfo };
