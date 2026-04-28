import type {
  ImageCapabilities,
  ImageGenerationResult,
  ImageModelDef,
  ImageProvider,
  ImageRequest,
} from "@imagine-studio/core";
import { aggregateCapabilities } from "../openai/image.js";

export interface AzureOpenAIImageProviderOptions {
  endpoint: string;
  apiKey: string;
  apiVersion: string;
  /** Deployment name → resolved model definition. */
  models: ReadonlyMap<string, ImageModelDef>;
}

/**
 * Azure shares the OpenAI image schema but uses an `api-key` header and
 * deployment-scoped URLs. M2 composes `OpenAIImageProvider` with an Azure
 * URL builder; the skeleton here just records the right id and aggregated
 * capability surface.
 */
export class AzureOpenAIImageProvider implements ImageProvider {
  readonly id = "azure-openai";
  readonly displayName = "Azure OpenAI";
  readonly capabilities: ImageCapabilities;
  readonly models: ReadonlyMap<string, ImageModelDef>;

  constructor(private readonly options: AzureOpenAIImageProviderOptions) {
    this.models = options.models;
    this.capabilities = aggregateCapabilities(options.models);
  }

  async generate(_req: ImageRequest, _signal?: AbortSignal): Promise<ImageGenerationResult> {
    throw new Error("not implemented (M2)");
  }
}
