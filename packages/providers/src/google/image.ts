import {
  ProviderError,
  ProviderRequestError,
  ProviderResponseError,
  applyImageDefaults,
  type ImageCapabilities,
  type ImageGenerationResult,
  type ImageModelDef,
  type ImageOutput,
  type ImageProvider,
  type ImageRequest,
  type Logger,
  type ProviderTestResult,
  validateImageRequestAgainstModel,
} from "@imagine/core";
import { GoogleGenAI } from "@google/genai";
import { aggregateCapabilities, decodeBase64, testFailureFromError } from "../openai/image.js";

/** Canonical Google generative-language base URL (used as fallback HttpOptions). */
export const DEFAULT_GOOGLE_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

/**
 * Minimal Google GenAI client surface used by `GoogleImageProvider`. Tests
 * inject a fake; production constructs `new GoogleGenAI({ apiKey })`.
 */
export interface GoogleGenAIClientLike {
  models: {
    generateImages?: (params: {
      model: string;
      prompt: string;
      config?: Record<string, unknown>;
    }) => Promise<{
      generatedImages?: Array<{ image?: { imageBytes?: string; mimeType?: string } }>;
    }>;
    generateContent?: (params: {
      model: string;
      contents: unknown;
      config?: Record<string, unknown>;
    }) => Promise<{
      candidates?: Array<{
        content?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string }; text?: string }> };
      }>;
    }>;
    list?: (params?: Record<string, unknown>) => Promise<unknown>;
  };
}

export interface GoogleImageProviderOptions {
  apiKey: string;
  baseUrl?: string;
  models: ReadonlyMap<string, ImageModelDef>;
  /** Inject SDK client for tests. */
  client?: GoogleGenAIClientLike;
  logger?: Logger;
}

/**
 * Google image provider — Imagen + Nano Banana (`gemini-X.X-flash-image`).
 *
 *  - Imagen models use `models.generateImages` (`{numberOfImages, aspectRatio, ...}`).
 *  - Nano Banana models use `models.generateContent` with `responseModalities: ["IMAGE"]`
 *    in the config; the response carries the PNG bytes inside
 *    `candidates[0].content.parts[*].inlineData.data` (base64).
 *
 * Branch on `req.model`. The id pattern is stable: anything matching
 * `/^gemini-.*-(flash-)?image/` goes through `generateContent`; everything
 * else uses `generateImages`.
 */
export class GoogleImageProvider implements ImageProvider {
  readonly id = "google";
  readonly displayName = "Google AI Studio";
  readonly models: ReadonlyMap<string, ImageModelDef>;
  readonly capabilities: ImageCapabilities;
  private readonly client: GoogleGenAIClientLike;
  private readonly logger?: Logger;

  constructor(options: GoogleImageProviderOptions) {
    this.models = options.models;
    this.capabilities = aggregateCapabilities(options.models);
    if (options.logger) this.logger = options.logger;
    if (options.client) {
      this.client = options.client;
    } else {
      const opts: { apiKey: string; httpOptions?: { baseUrl?: string } } = {
        apiKey: options.apiKey,
      };
      if (options.baseUrl) opts.httpOptions = { baseUrl: options.baseUrl };
      this.client = new GoogleGenAI(opts) as unknown as GoogleGenAIClientLike;
    }
  }

  async generate(req: ImageRequest, signal?: AbortSignal): Promise<ImageGenerationResult> {
    const model = this.models.get(req.model);
    if (!model) {
      throw new ProviderRequestError(`unknown model '${req.model}' for google`, {
        vendorId: this.id,
      });
    }
    const merged = applyImageDefaults(req, model);
    validateImageRequestAgainstModel(this.id, merged, model);

    if (signal?.aborted) {
      throw new ProviderError("request aborted", { vendorId: this.id });
    }

    if (isNanoBananaModel(model.id)) {
      return this.generateViaContent(merged, model.id, signal);
    }
    return this.generateViaImages(merged, model.id, signal);
  }

  private async generateViaImages(
    merged: ImageRequest,
    modelId: string,
    signal?: AbortSignal,
  ): Promise<ImageGenerationResult> {
    if (!this.client.models.generateImages) {
      throw new ProviderResponseError("SDK does not expose generateImages", {
        vendorId: this.id,
      });
    }
    const config: Record<string, unknown> = {};
    if (merged.count !== undefined) config.numberOfImages = merged.count;
    if (merged.aspectRatio) config.aspectRatio = merged.aspectRatio;
    if (merged.negativePrompt) config.negativePrompt = merged.negativePrompt;
    if (merged.seed !== undefined) config.seed = merged.seed;
    if (signal) config.abortSignal = signal;

    let response: Awaited<ReturnType<NonNullable<GoogleGenAIClientLike["models"]["generateImages"]>>>;
    try {
      response = await this.client.models.generateImages({
        model: modelId,
        prompt: merged.prompt,
        config,
      });
    } catch (err) {
      throw rethrowGoogleError(err, this.id);
    }

    const outputs: ImageOutput[] = [];
    for (const g of response.generatedImages ?? []) {
      const b64 = g.image?.imageBytes;
      if (!b64) {
        throw new ProviderResponseError("generated image missing imageBytes", {
          vendorId: this.id,
        });
      }
      outputs.push({
        bytes: decodeBase64(b64),
        mimeType: g.image?.mimeType ?? "image/png",
      });
    }
    if (outputs.length === 0) {
      throw new ProviderError("no images returned", { vendorId: this.id });
    }
    return { outputs };
  }

  private async generateViaContent(
    merged: ImageRequest,
    modelId: string,
    signal?: AbortSignal,
  ): Promise<ImageGenerationResult> {
    if (!this.client.models.generateContent) {
      throw new ProviderResponseError("SDK does not expose generateContent", {
        vendorId: this.id,
      });
    }
    const config: Record<string, unknown> = {
      responseModalities: ["IMAGE"],
    };
    if (signal) config.abortSignal = signal;
    if (merged.aspectRatio) config.imageConfig = { aspectRatio: merged.aspectRatio };

    let response: Awaited<ReturnType<NonNullable<GoogleGenAIClientLike["models"]["generateContent"]>>>;
    try {
      response = await this.client.models.generateContent({
        model: modelId,
        contents: merged.prompt,
        config,
      });
    } catch (err) {
      throw rethrowGoogleError(err, this.id);
    }

    const outputs: ImageOutput[] = [];
    for (const cand of response.candidates ?? []) {
      for (const part of cand.content?.parts ?? []) {
        const b64 = part.inlineData?.data;
        if (b64) {
          outputs.push({
            bytes: decodeBase64(b64),
            mimeType: part.inlineData?.mimeType ?? "image/png",
          });
        }
      }
    }
    if (outputs.length === 0) {
      this.logger?.warn?.("nano-banana response missing inline image", { response });
      throw new ProviderResponseError("Gemini response carried no image bytes", {
        vendorId: this.id,
      });
    }
    return { outputs };
  }

  /**
   * Probe the API by listing models. The SDK's `models.list()` returns an
   * async-iterable Pager; we drain a single page and look for one of our
   * configured ids.
   */
  async test(_signal?: AbortSignal): Promise<ProviderTestResult> {
    const started = Date.now();
    try {
      const names = await listGoogleModelIds(this.client);
      const latencyMs = Date.now() - started;
      if (names.length === 0) {
        return { ok: false, reason: "model list returned no entries" };
      }
      const configured = [...this.models.keys()];
      const matched = configured.find((id) => names.some((n) => n === id || n.endsWith(`/${id}`) || n.endsWith(id)));
      const out: ProviderTestResult = matched
        ? { ok: true, latencyMs, sampleModelId: matched }
        : { ok: true, latencyMs };
      return out;
    } catch (err) {
      this.logger?.debug?.("google test() failed", { err: String(err) });
      return testFailureFromError(err);
    }
  }
}

/**
 * Branch helper. Nano Banana ships under the `gemini-*-flash-image` and
 * `gemini-*-pro-image` ids and takes the `generateContent` path. Imagen-style
 * ids (`imagen-*`) take the `generateImages` path.
 */
export function isNanoBananaModel(modelId: string): boolean {
  return /^gemini-.*-image/i.test(modelId);
}

/**
 * Drain the first page of `models.list()` into a flat list of names. The SDK
 * may return either an array-shaped `{ data }` value (test fakes) or a Pager
 * exposing `.page` plus AsyncIterable.
 */
export async function listGoogleModelIds(client: GoogleGenAIClientLike): Promise<string[]> {
  if (!client.models.list) return [];
  const page = await client.models.list();
  if (Array.isArray((page as { data?: unknown }).data)) {
    const arr = (page as { data?: Array<{ name?: string }> }).data ?? [];
    return arr.map((m) => m?.name).filter((s): s is string => typeof s === "string");
  }
  // Pager exposes `.page` getter once awaited.
  const fromPage = (page as { page?: Array<{ name?: string }> }).page;
  if (Array.isArray(fromPage)) {
    return fromPage.map((m) => m?.name).filter((s): s is string => typeof s === "string");
  }
  // Fall back to AsyncIterable single-page drain (bounded — we never want all).
  if (typeof (page as AsyncIterable<{ name?: string }>)[Symbol.asyncIterator] === "function") {
    const out: string[] = [];
    let count = 0;
    for await (const m of page as AsyncIterable<{ name?: string }>) {
      if (typeof m?.name === "string") out.push(m.name);
      count += 1;
      if (count >= 200) break;
    }
    return out;
  }
  return [];
}

function rethrowGoogleError(err: unknown, vendorId: string): Error {
  if (err instanceof Error) {
    return new ProviderError(err.message, { vendorId, cause: err });
  }
  return new ProviderError(String(err), { vendorId });
}
