import {
  applyVideoDefaults,
  type Logger,
  ProviderRequestError,
  type ProviderTestResult,
  type VideoCapabilities,
  type VideoGenerationResult,
  type VideoJobHandle,
  type VideoJobStatus,
  type VideoModelDef,
  type VideoProvider,
  type VideoRequest,
  validateVideoRequestAgainstModel,
} from "@imagent/core";
import { aggregateVideoCapabilities } from "./capabilities.js";

export interface BaseVideoProviderOptions {
  providerId: string;
  displayName: string;
  models: ReadonlyMap<string, VideoModelDef>;
  logger?: Logger;
}

/**
 * Shared scaffolding for every video provider. Mirrors `BaseImageProvider`:
 *
 *   - constructor computes `aggregateVideoCapabilities`
 *   - `submit()` does the model lookup + defaults + validation, then calls
 *     `doSubmit(merged, model)`
 *   - `test()` wraps `doTest()` in a never-throws envelope
 *
 * `poll` / `fetch` / `cancel` live on each subclass — vendor differences are
 * large (long-running operation vs in-memory map vs Ark task DB) so there's
 * no useful shared default.
 */
export abstract class BaseVideoProvider implements VideoProvider {
  readonly id: string;
  readonly displayName: string;
  readonly models: ReadonlyMap<string, VideoModelDef>;
  readonly capabilities: VideoCapabilities;
  protected readonly logger?: Logger;

  constructor(options: BaseVideoProviderOptions) {
    this.id = options.providerId;
    this.displayName = options.displayName;
    this.models = options.models;
    this.capabilities = aggregateVideoCapabilities(options.models);
    if (options.logger) this.logger = options.logger;
  }

  async submit(req: VideoRequest): Promise<VideoJobHandle> {
    const model = this.models.get(req.model);
    if (!model) throw this.unknownModelError(req.model);
    const merged = applyVideoDefaults(req, model);
    validateVideoRequestAgainstModel(this.id, merged, model);
    return this.doSubmit(merged, model);
  }

  abstract poll(handle: VideoJobHandle): Promise<VideoJobStatus>;
  abstract fetch(handle: VideoJobHandle): Promise<VideoGenerationResult>;
  abstract cancel(handle: VideoJobHandle): Promise<void>;

  async test(signal?: AbortSignal): Promise<ProviderTestResult> {
    try {
      return await this.doTest(signal);
    } catch (err) {
      this.logger?.debug?.(`${this.id} test() threw`, { err: String(err) });
      return { ok: false, reason: err instanceof Error ? err.message : String(err) };
    }
  }

  protected unknownModelError(modelId: string): ProviderRequestError {
    return new ProviderRequestError(`unknown video model '${modelId}' for ${this.id}`, {
      vendorId: this.id,
    });
  }

  protected abstract doSubmit(merged: VideoRequest, model: VideoModelDef): Promise<VideoJobHandle>;
  protected abstract doTest(signal?: AbortSignal): Promise<ProviderTestResult>;
}
