import type {
  ImageCapabilities,
  ImageGenerationResult,
  ImageModelDef,
  ImageProvider,
  ImageRequest,
  Logger,
  ProviderTestResult,
} from "@imagine-studio/core";
import { OpenAIImageProvider } from "../openai/image.js";

const DEFAULT_SEEDREAM_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";

export interface SeedreamImageProviderOptions {
  apiKey: string;
  baseUrl?: string | null;
  region?: string;
  models: ReadonlyMap<string, ImageModelDef>;
  fetch?: typeof fetch;
  logger?: Logger;
}

/**
 * Seedream — Volcengine Ark image API. The Ark image surface is documented as
 * OpenAI-compatible (POST /images/generations with `Authorization: Bearer`).
 * We compose the OpenAI provider with a different baseUrl and keep the Bearer
 * auth strategy unchanged.
 *
 * TODO(verify endpoint shape) — confirm against
 *   https://www.volcengine.com/docs/82379 image generation page when network
 *   access permits. Defaults follow the documented OpenAI-compatible shape.
 */
export class SeedreamImageProvider implements ImageProvider {
  private readonly inner: OpenAIImageProvider;
  readonly id = "seedream";
  readonly displayName = "Seedream (Volcengine)";
  readonly models: ReadonlyMap<string, ImageModelDef>;
  readonly capabilities: ImageCapabilities;

  constructor(options: SeedreamImageProviderOptions) {
    const baseUrl = (options.baseUrl ?? DEFAULT_SEEDREAM_BASE_URL).replace(/\/+$/, "");
    this.models = options.models;
    this.inner = new OpenAIImageProvider({
      apiKey: options.apiKey,
      models: options.models,
      providerId: "seedream",
      displayName: "Seedream (Volcengine)",
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
   * Seedream test piggybacks on the OpenAI-compatible inner provider's
   * `GET /models` probe — Ark is OpenAI-compatible and exposes the same shape.
   */
  test(signal?: AbortSignal): Promise<ProviderTestResult> {
    if (!this.inner.test) {
      // Should never happen — OpenAIImageProvider always has test() — but
      // satisfy the optional-method contract regardless.
      return Promise.resolve({ ok: false, reason: "test() unavailable" });
    }
    return this.inner.test(signal);
  }
}
