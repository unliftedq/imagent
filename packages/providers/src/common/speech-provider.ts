import {
  type SpeechCapabilities,
  type SpeechGenerationResult,
  type SpeechModelDef,
  type SpeechProvider,
  type SpeechRequest,
  applySpeechDefaults,
  type Logger,
  ProviderRequestError,
  type ProviderTestResult,
  type VoiceInfo,
  validateSpeechRequestAgainstModel,
} from "@imagent/core";
import { aggregateSpeechCapabilities } from "./capabilities.js";

export interface BaseSpeechProviderOptions {
  providerId: string;
  displayName: string;
  models: ReadonlyMap<string, SpeechModelDef>;
  logger?: Logger;
}

export abstract class BaseSpeechProvider implements SpeechProvider {
  readonly id: string;
  readonly displayName: string;
  readonly models: ReadonlyMap<string, SpeechModelDef>;
  readonly capabilities: SpeechCapabilities;
  protected readonly logger?: Logger;

  constructor(options: BaseSpeechProviderOptions) {
    this.id = options.providerId;
    this.displayName = options.displayName;
    this.models = options.models;
    this.capabilities = aggregateSpeechCapabilities(options.models);
    if (options.logger) this.logger = options.logger;
  }

  async synthesize(req: SpeechRequest, signal?: AbortSignal): Promise<SpeechGenerationResult> {
    const model = this.models.get(req.model);
    if (!model) throw this.unknownModelError(req.model);
    const merged = applySpeechDefaults(req, model);
    validateSpeechRequestAgainstModel(this.id, merged, model);
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
    merged: SpeechRequest,
    model: SpeechModelDef,
    signal?: AbortSignal,
  ): Promise<SpeechGenerationResult>;

  protected abstract doTest(signal?: AbortSignal): Promise<ProviderTestResult>;
}
