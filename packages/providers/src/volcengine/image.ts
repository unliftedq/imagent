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

const DEFAULT_VOLCENGINE_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";

export interface VolcengineImageProviderOptions {
  apiKey: string;
  baseUrl?: string | null;
  region?: string;
  models: ReadonlyMap<string, ImageModelDef>;
  fetch?: typeof fetch;
  logger?: Logger;
}

/**
 * Volcengine image provider — backed by Ark's OpenAI-compatible image API
 * (`POST /images/generations` with `Authorization: Bearer`). The default
 * model family is Seedream (see catalog.ts). Shares an Ark API key with
 * `VolcengineVideoProvider`; both report `id = "volcengine"`.
 */
export class VolcengineImageProvider implements ImageProvider {
  private readonly inner: OpenAIImageProvider;
  readonly id = "volcengine";
  readonly displayName = "Volcengine";
  readonly models: ReadonlyMap<string, ImageModelDef>;
  readonly capabilities: ImageCapabilities;

  constructor(options: VolcengineImageProviderOptions) {
    const baseUrl = (options.baseUrl ?? DEFAULT_VOLCENGINE_BASE_URL).replace(/\/+$/, "");
    this.models = options.models;
    this.inner = new OpenAIImageProvider({
      apiKey: options.apiKey,
      // Pass baseUrl through so the inner's GET /models test() probe hits
      // Ark rather than OpenAI's default endpoint.
      baseUrl,
      models: options.models,
      providerId: "volcengine",
      displayName: "Volcengine",
      urlBuilder: () => `${baseUrl}/images/generations`,
      // Bearer is the documented Ark scheme; same as OpenAI default.
      ...(options.fetch !== undefined ? { fetch: options.fetch } : {}),
      ...(options.logger !== undefined ? { logger: options.logger } : {}),
    });
    this.capabilities = this.inner.capabilities;
  }

  generate(req: ImageRequest, signal?: AbortSignal): Promise<ImageGenerationResult> {
    return this.inner.generate(req, signal);
  }

  /**
   * Volcengine test piggybacks on the OpenAI-compatible inner provider's
   * `GET /models` probe.
   */
  test(signal?: AbortSignal): Promise<ProviderTestResult> {
    if (!this.inner.test) {
      return Promise.resolve({ ok: false, reason: "test() unavailable" });
    }
    return this.inner.test(signal);
  }
}
