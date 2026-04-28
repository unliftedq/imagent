import type {
  ImageCapabilities,
  ImageGenerationResult,
  ImageModelDef,
  ImageProvider,
  ImageRequest,
} from "@imagine-studio/core";
import { aggregateCapabilities } from "../openai/image.js";

export interface SeedreamImageProviderOptions {
  apiKey: string;
  baseUrl: string;
  region: string;
  models: ReadonlyMap<string, ImageModelDef>;
}

/**
 * Seedream — Volcengine image provider. Shares VolcengineConfig (apiKey +
 * region) with Seedance video. M2 implements the Ark request signing.
 */
export class SeedreamImageProvider implements ImageProvider {
  readonly id = "seedream";
  readonly displayName = "Seedream (Volcengine)";
  readonly capabilities: ImageCapabilities;
  readonly models: ReadonlyMap<string, ImageModelDef>;

  constructor(private readonly options: SeedreamImageProviderOptions) {
    this.models = options.models;
    this.capabilities = aggregateCapabilities(options.models);
  }

  async generate(_req: ImageRequest, _signal?: AbortSignal): Promise<ImageGenerationResult> {
    throw new Error("not implemented (M2)");
  }
}
