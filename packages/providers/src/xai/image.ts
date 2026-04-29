import type {
  ImageCapabilities,
  ImageGenerationResult,
  ImageModelDef,
  ImageProvider,
  ImageRequest,
  Logger,
  ProviderTestResult,
} from "@imagine/core";
import { OpenAIImageProvider } from "../openai/image.js";

const DEFAULT_XAI_BASE_URL = "https://api.x.ai/v1";

export interface XaiImageProviderOptions {
  apiKey: string;
  baseUrl?: string | null;
  models: ReadonlyMap<string, ImageModelDef>;
  fetch?: typeof fetch;
  logger?: Logger;
}

/**
 * xAI image provider — OpenAI-compatible image API against
 * `https://api.x.ai/v1/images/generations` with `Authorization: Bearer`.
 * Default catalog model is `grok-2-image-1212`. Composes the OpenAI
 * provider with a different base URL (same wire shape).
 */
export class XaiImageProvider implements ImageProvider {
  private readonly inner: OpenAIImageProvider;
  readonly id = "xai";
  readonly displayName = "xAI";
  readonly models: ReadonlyMap<string, ImageModelDef>;
  readonly capabilities: ImageCapabilities;

  constructor(options: XaiImageProviderOptions) {
    const baseUrl = (options.baseUrl ?? DEFAULT_XAI_BASE_URL).replace(/\/+$/, "");
    this.models = options.models;
    this.inner = new OpenAIImageProvider({
      apiKey: options.apiKey,
      // Pass baseUrl through so the inner's GET /models test() probe hits
      // xAI rather than OpenAI's default endpoint.
      baseUrl,
      models: options.models,
      providerId: "xai",
      displayName: "xAI",
      urlBuilder: () => `${baseUrl}/images/generations`,
      ...(options.fetch !== undefined ? { fetch: options.fetch } : {}),
      ...(options.logger !== undefined ? { logger: options.logger } : {}),
    });
    this.capabilities = this.inner.capabilities;
  }

  generate(req: ImageRequest, signal?: AbortSignal): Promise<ImageGenerationResult> {
    return this.inner.generate(req, signal);
  }

  /** xAI exposes an OpenAI-compatible `GET /models` listing. */
  test(signal?: AbortSignal): Promise<ProviderTestResult> {
    if (!this.inner.test) {
      return Promise.resolve({ ok: false, reason: "test() unavailable" });
    }
    return this.inner.test(signal);
  }
}
