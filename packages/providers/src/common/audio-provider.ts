import {
  type AudioCapabilities,
  type AudioGenerationResult,
  type AudioModelDef,
  type AudioProvider,
  type AudioRequest,
  applyAudioDefaults,
  type Logger,
  ProviderRequestError,
  type ProviderTestResult,
  type VoiceInfo,
  validateAudioRequestAgainstModel,
} from "@imagent/core";
import { aggregateAudioCapabilities } from "./capabilities.js";

export interface BaseAudioProviderOptions {
  providerId: string;
  displayName: string;
  models: ReadonlyMap<string, AudioModelDef>;
  logger?: Logger;
}

export abstract class BaseAudioProvider implements AudioProvider {
  readonly id: string;
  readonly displayName: string;
  readonly models: ReadonlyMap<string, AudioModelDef>;
  readonly capabilities: AudioCapabilities;
  protected readonly logger?: Logger;

  constructor(options: BaseAudioProviderOptions) {
    this.id = options.providerId;
    this.displayName = options.displayName;
    this.models = options.models;
    this.capabilities = aggregateAudioCapabilities(options.models);
    if (options.logger) this.logger = options.logger;
  }

  async synthesize(req: AudioRequest, signal?: AbortSignal): Promise<AudioGenerationResult> {
    const model = this.models.get(req.model);
    if (!model) throw this.unknownModelError(req.model);
    const merged = applyAudioDefaults(req, model);
    validateAudioRequestAgainstModel(this.id, merged, model);
    return this.doSynthesize(merged, model, signal);
  }

  async test(signal?: AbortSignal): Promise<ProviderTestResult> {
    try {
      return await this.doTest(signal);
    } catch (err) {
      this.logger?.debug?.(`${this.id} test() threw`, { err: String(err) });
      return { ok: false, reason: err instanceof Error ? err.message : String(err) };
    }
  }

  /** Default: no live discovery. Subclasses override when an API exists. */
  listVoices?(signal?: AbortSignal): Promise<VoiceInfo[]>;

  protected unknownModelError(modelId: string): ProviderRequestError {
    return new ProviderRequestError(`unknown model '${modelId}' for ${this.id}`, {
      vendorId: this.id,
    });
  }

  protected abstract doSynthesize(
    merged: AudioRequest,
    model: AudioModelDef,
    signal?: AbortSignal,
  ): Promise<AudioGenerationResult>;

  protected abstract doTest(signal?: AbortSignal): Promise<ProviderTestResult>;
}
