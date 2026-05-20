import {
  applyImageDefaults,
  type ImageCapabilities,
  type ImageGenerationResult,
  type ImageModelDef,
  type ImageProvider,
  type ImageRequest,
  type Logger,
  ProviderRequestError,
  type ProviderTestResult,
  validateImageRequestAgainstModel,
} from "@imagent/core";
import { aggregateImageCapabilities } from "./capabilities.js";

export interface BaseImageProviderOptions {
  providerId: string;
  displayName: string;
  models: ReadonlyMap<string, ImageModelDef>;
  logger?: Logger;
}

/**
 * Shared scaffolding for every image provider:
 *
 *   - holds `id` / `displayName` / `models` / `capabilities` / `logger`
 *   - `generate()` looks the model up, merges defaults, validates against the
 *     catalog, then hands off to the vendor-specific `doGenerate`
 *   - `test()` wraps the vendor probe in the standard never-throws envelope
 *
 * Subclasses implement `doGenerate(merged, model, signal)` and either
 * `doTest(signal)` (which already runs inside a try/catch) or override
 * `test()` entirely.
 */
export abstract class BaseImageProvider implements ImageProvider {
  readonly id: string;
  readonly displayName: string;
  readonly models: ReadonlyMap<string, ImageModelDef>;
  readonly capabilities: ImageCapabilities;
  protected readonly logger?: Logger;

  constructor(options: BaseImageProviderOptions) {
    this.id = options.providerId;
    this.displayName = options.displayName;
    this.models = options.models;
    this.capabilities = aggregateImageCapabilities(options.models);
    if (options.logger) this.logger = options.logger;
  }

  async generate(req: ImageRequest, signal?: AbortSignal): Promise<ImageGenerationResult> {
    const model = this.models.get(req.model);
    if (!model) throw this.unknownModelError(req.model);
    const merged = applyImageDefaults(req, model);
    validateImageRequestAgainstModel(this.id, merged, model);
    return this.doGenerate(merged, model, signal);
  }

  async test(signal?: AbortSignal): Promise<ProviderTestResult> {
    try {
      return await this.doTest(signal);
    } catch (err) {
      // doTest implementations are expected to convert SDK errors themselves
      // (so they can run the list-probe helper directly). The wrapper here
      // catches anything that slips through (e.g. synchronous logic errors).
      this.logger?.debug?.(`${this.id} test() threw`, { err: String(err) });
      return { ok: false, reason: err instanceof Error ? err.message : String(err) };
    }
  }

  protected unknownModelError(modelId: string): ProviderRequestError {
    return new ProviderRequestError(`unknown model '${modelId}' for ${this.id}`, {
      vendorId: this.id,
    });
  }

  protected abstract doGenerate(
    merged: ImageRequest,
    model: ImageModelDef,
    signal?: AbortSignal,
  ): Promise<ImageGenerationResult>;

  protected abstract doTest(signal?: AbortSignal): Promise<ProviderTestResult>;
}
