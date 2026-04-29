import type {
  ImageGenerationResult,
  ImageModelDef,
  ImageProvider,
  ImageRequest,
  ImageCapabilities,
  Logger,
} from "@imagine-studio/core";
import { OpenAIImageProvider } from "../openai/image.js";

export interface AzureOpenAIImageProviderOptions {
  endpoint: string;
  apiKey: string;
  apiVersion: string;
  /** Deployment name → resolved model definition. */
  models: ReadonlyMap<string, ImageModelDef>;
  fetch?: typeof fetch;
  logger?: Logger;
}

/**
 * Azure shares the OpenAI image schema entirely; only the URL and auth header
 * differ. We compose `OpenAIImageProvider` with custom `urlBuilder` (deployment +
 * api-version) and `authHeader` (`api-key` instead of `Bearer`). Body shape,
 * caps validation, b64 decode — all reused.
 */
export class AzureOpenAIImageProvider implements ImageProvider {
  private readonly inner: OpenAIImageProvider;
  readonly id = "azure-openai";
  readonly displayName = "Azure OpenAI";
  readonly models: ReadonlyMap<string, ImageModelDef>;
  readonly capabilities: ImageCapabilities;

  constructor(options: AzureOpenAIImageProviderOptions) {
    const endpoint = options.endpoint.replace(/\/+$/, "");
    const apiVersion = options.apiVersion;
    this.models = options.models;
    this.inner = new OpenAIImageProvider({
      apiKey: options.apiKey,
      models: options.models,
      providerId: "azure-openai",
      displayName: "Azure OpenAI",
      // Azure path: {endpoint}/openai/deployments/{deployment}/images/generations?api-version=...
      urlBuilder: (deployment) =>
        `${endpoint}/openai/deployments/${encodeURIComponent(deployment)}/images/generations?api-version=${encodeURIComponent(apiVersion)}`,
      authHeader: (k) => ({ "api-key": k }),
      ...(options.fetch !== undefined ? { fetch: options.fetch } : {}),
      ...(options.logger !== undefined ? { logger: options.logger } : {}),
    });
    this.capabilities = this.inner.capabilities;
  }

  generate(req: ImageRequest, signal?: AbortSignal): Promise<ImageGenerationResult> {
    return this.inner.generate(req, signal);
  }
}
