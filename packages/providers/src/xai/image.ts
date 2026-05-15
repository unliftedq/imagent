import { createXai } from "@ai-sdk/xai";
import {
  appendImageReferenceInstructions,
  applyImageDefaults,
  type ImageCapabilities,
  type ImageGenerationResult,
  type ImageModelDef,
  type ImageOutput,
  type ImageProvider,
  type ImageRequest,
  type Logger,
  ProviderError,
  ProviderHttpError,
  ProviderRequestError,
  ProviderResponseError,
  type ProviderTestResult,
  validateImageRequestAgainstModel,
} from "@imagent/core";
import { generateImage, type ImageModel } from "ai";
import { createHttpClient, type HttpClient } from "../http/index.js";
import { aggregateCapabilities, parseSize, testFailureFromError } from "../openai/image.js";
import { imageDataUrl, loadImageReferences } from "../reference-images.js";

/** Canonical xAI base URL. OpenAI-compatible. */
export const DEFAULT_XAI_BASE_URL = "https://api.x.ai/v1";

/**
 * Test seam — production code passes `(modelId) => createXai({...}).image(modelId)`.
 * Tests inject a factory that returns a fake `ImageModelV3` with a stubbed
 * `doGenerate` so we don't hit the network.
 */
export type XaiImageModelFactory = (modelId: string) => ImageModel;

export interface XaiImageProviderOptions {
  apiKey: string;
  baseUrl?: string | null;
  models: ReadonlyMap<string, ImageModelDef>;
  /** Inject the Vercel AI SDK image model factory (tests). In production we build one from `createXai`. */
  modelFactory?: XaiImageModelFactory;
  /** Override fetch for the auth probe (tests). The Vercel SDK has its own fetch slot we don't reuse. */
  fetch?: typeof fetch;
  logger?: Logger;
}

/**
 * xAI image provider — uses the Vercel AI SDK (`@ai-sdk/xai` + `ai`) to call
 * Grok Imagine. Default catalog model is `grok-imagine-image`.
 *
 * The Vercel SDK exposes `provider.image(modelId)` returning an `ImageModelV3`,
 * which we feed into `generateImage({ model, prompt, n, size, abortSignal })`.
 * Result `images` is an array of `GeneratedFile` (`uint8Array` / `base64` /
 * `mediaType`); we copy each into a Buffer-backed `Uint8Array<ArrayBuffer>`
 * for our `ImageGenerationResult` shape.
 *
 * The Vercel SDK has no `models.list()` equivalent, so the auth probe in
 * `test()` falls back to a raw `GET /v1/models` via our in-house httpClient.
 */
export class XaiImageProvider implements ImageProvider {
  readonly id = "xai";
  readonly displayName = "xAI";
  readonly models: ReadonlyMap<string, ImageModelDef>;
  readonly capabilities: ImageCapabilities;
  private readonly modelFactory: XaiImageModelFactory;
  private readonly probeHttp: HttpClient;
  private readonly baseUrl: string;
  private readonly logger?: Logger;

  constructor(options: XaiImageProviderOptions) {
    this.models = options.models;
    this.capabilities = aggregateCapabilities(options.models);
    if (options.logger) this.logger = options.logger;
    this.baseUrl = (options.baseUrl ?? DEFAULT_XAI_BASE_URL).replace(/\/+$/, "");

    if (options.modelFactory) {
      this.modelFactory = options.modelFactory;
    } else {
      const provider = createXai({
        apiKey: options.apiKey,
        baseURL: this.baseUrl,
      });
      // `@ai-sdk/xai@4-beta` returns `ImageModelV4` from `provider.image(...)`,
      // and `ai@7-beta`'s `ImageModel` union accepts V2/V3/V4 — assignment is
      // direct, no cast needed.
      this.modelFactory = (modelId: string) => provider.image(modelId);
    }

    this.probeHttp = createHttpClient({
      vendorId: this.id,
      headers: { Authorization: `Bearer ${options.apiKey}` },
      ...(options.fetch !== undefined ? { fetch: options.fetch } : {}),
      ...(options.logger !== undefined ? { logger: options.logger } : {}),
    });
  }

  async generate(req: ImageRequest, signal?: AbortSignal): Promise<ImageGenerationResult> {
    const modelDef = this.models.get(req.model);
    if (!modelDef) {
      throw new ProviderRequestError(`unknown model '${req.model}' for ${this.id}`, {
        vendorId: this.id,
      });
    }
    const merged = applyImageDefaults(req, modelDef);
    validateImageRequestAgainstModel(this.id, merged, modelDef);

    let model: ImageModel;
    try {
      model = this.modelFactory(modelDef.id);
    } catch (err) {
      throw rethrowSdkError(err, this.id);
    }

    const args: Parameters<typeof generateImage>[0] = {
      model,
      prompt: appendImageReferenceInstructions(merged.prompt, merged.references),
      n: merged.count,
    };
    if (merged.size && /^\d+x\d+$/.test(merged.size)) {
      args.size = merged.size as `${number}x${number}`;
    }
    // Grok Imagine rejects `size`; aspectRatio is the primary dimensional knob
    // (forwarded by `@ai-sdk/xai` as `aspect_ratio`). We also surface `quality`
    // ("1k"/"2k") to users and route it through `providerOptions.xai.resolution`,
    // which is the SDK's xAI-specific resolution enum.
    if (merged.aspectRatio && /^[\w.]+:[\w.]+$/.test(merged.aspectRatio)) {
      args.aspectRatio = merged.aspectRatio as `${number}:${number}`;
    }
    const xaiOpts: Record<string, unknown> = {};
    if (merged.quality) xaiOpts.resolution = merged.quality;
    if (merged.references.length > 0) {
      const dataUrls = (await loadImageReferences(merged.references, this.id)).map(imageDataUrl);
      xaiOpts.referenceImages = dataUrls;
    }
    if (Object.keys(xaiOpts).length > 0) {
      (args as Record<string, unknown>).providerOptions = {
        ...((args as { providerOptions?: Record<string, unknown> }).providerOptions ?? {}),
        xai: xaiOpts,
      };
    }
    if (signal) args.abortSignal = signal;

    let result: Awaited<ReturnType<typeof generateImage>>;
    try {
      result = await generateImage(args);
    } catch (err) {
      throw rethrowSdkError(err, this.id);
    }

    const files = result.images ?? (result.image ? [result.image] : []);
    if (files.length === 0) {
      throw new ProviderError("no image outputs returned", { vendorId: this.id });
    }

    const outputs: ImageOutput[] = [];
    for (const file of files) {
      const bytes = toAbBytes(file.uint8Array);
      const mimeType = file.mediaType?.startsWith("image/") ? file.mediaType : "image/png";
      outputs.push({
        bytes,
        mimeType,
        ...parseSize(merged.size),
      });
    }
    return { outputs };
  }

  /**
   * Auth probe. Vercel AI SDK doesn't expose a list-models call, so we drop
   * down to `GET https://api.x.ai/v1/models` via the in-house httpClient.
   * 200 with at least one entry → `{ ok: true }`. Annotates `sampleModelId`
   * if any of our configured ids is in the listing.
   */
  async test(signal?: AbortSignal): Promise<ProviderTestResult> {
    const started = Date.now();
    const probeSignal = signal ?? AbortSignal.timeout(8000);
    try {
      const res = await this.probeHttp.get<{ data?: Array<{ id?: string }> }>(
        `${this.baseUrl}/models`,
        { signal: probeSignal },
      );
      const latencyMs = Date.now() - started;
      const ids = (res?.data ?? [])
        .map((m) => m?.id)
        .filter((s): s is string => typeof s === "string");
      if (ids.length === 0) {
        return { ok: false, reason: "no models returned", status: 0 };
      }
      const configured = [...this.models.keys()];
      const matched = configured.find((id) => ids.includes(id));
      const out: ProviderTestResult = matched
        ? { ok: true, latencyMs, sampleModelId: matched }
        : { ok: true, latencyMs };
      return out;
    } catch (err) {
      this.logger?.debug?.("xai test() failed", { err: String(err) });
      return testFailureFromError(err);
    }
  }
}

/**
 * Map Vercel AI SDK / `ai` errors onto our ProviderError hierarchy. The SDK
 * surfaces HTTP failures as `APICallError` with a `statusCode` field; other
 * errors come through as plain Error.
 */
function rethrowSdkError(err: unknown, vendorId: string): never {
  if (err && typeof err === "object") {
    const e = err as { statusCode?: number; status?: number; message?: string; name?: string };
    const status = typeof e.statusCode === "number" ? e.statusCode : e.status;
    if (typeof status === "number") {
      throw new ProviderHttpError(`HTTP ${status} from xai SDK: ${e.message ?? "request failed"}`, {
        vendorId,
        status,
      });
    }
    if (e.name === "AI_NoImageGeneratedError") {
      throw new ProviderResponseError(e.message ?? "no image generated", { vendorId });
    }
  }
  if (err instanceof Error) throw new ProviderError(err.message, { vendorId, cause: err });
  throw new ProviderError(String(err), { vendorId });
}

/**
 * Copy a possibly SharedArrayBuffer-backed `Uint8Array` into a fresh
 * `Uint8Array<ArrayBuffer>` matching our `ImageOutput.bytes` shape.
 */
function toAbBytes(src: Uint8Array): Uint8Array<ArrayBuffer> {
  const ab = new ArrayBuffer(src.byteLength);
  const out = new Uint8Array(ab);
  out.set(src);
  return out;
}
