import {
  ProviderError,
  ProviderHttpError,
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
import { createHttpClient, type HttpClient } from "../http/index.js";
import { z } from "zod";

/**
 * URL strategy. OpenAI default = `${baseUrl}/images/generations`. Azure
 * composes its own `urlBuilder` to inject deployment + api-version.
 */
export type OpenAIUrlBuilder = (modelOrDeployment: string) => string;

/**
 * Auth header strategy. OpenAI uses `Authorization: Bearer ...`; Azure swaps
 * for `api-key`. Seedream reuses `Bearer` against a different baseUrl.
 */
export type OpenAIAuthHeader = (apiKey: string) => Record<string, string>;

export interface OpenAIImageProviderOptions {
  apiKey: string;
  baseUrl?: string | null;
  models: ReadonlyMap<string, ImageModelDef>;
  /** Override the provider id when composing for Azure / Seedream. */
  providerId?: string;
  displayName?: string;
  /** URL builder; defaults to `${baseUrl}/images/generations`. */
  urlBuilder?: OpenAIUrlBuilder;
  /** Auth header builder; defaults to Bearer. */
  authHeader?: OpenAIAuthHeader;
  /** Inject a fetch (tests). */
  fetch?: typeof fetch;
  logger?: Logger;
}

/** Vendor response schema for the b64-style response_format. */
const OpenAIImageResponseSchema = z.object({
  created: z.number().optional(),
  data: z
    .array(
      z.object({
        b64_json: z.string().optional(),
        url: z.string().optional(),
        revised_prompt: z.string().optional(),
      }),
    )
    .min(1),
});

const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";

export class OpenAIImageProvider implements ImageProvider {
  readonly id: string;
  readonly displayName: string;
  readonly capabilities: ImageCapabilities;
  readonly models: ReadonlyMap<string, ImageModelDef>;
  protected readonly http: HttpClient;
  protected readonly options: OpenAIImageProviderOptions;
  protected readonly urlBuilder: OpenAIUrlBuilder;

  constructor(options: OpenAIImageProviderOptions) {
    this.options = options;
    this.id = options.providerId ?? "openai";
    this.displayName = options.displayName ?? "OpenAI";
    this.models = options.models;
    this.capabilities = aggregateCapabilities(options.models);
    const baseUrl = options.baseUrl ?? DEFAULT_OPENAI_BASE_URL;
    const auth = options.authHeader ?? defaultBearerAuth;
    this.urlBuilder = options.urlBuilder ?? ((_model: string) => `${baseUrl}/images/generations`);
    this.http = createHttpClient({
      baseUrl: undefined, // url builder returns absolute URLs
      headers: auth(options.apiKey),
      vendorId: this.id,
      ...(options.fetch !== undefined ? { fetch: options.fetch } : {}),
      ...(options.logger !== undefined ? { logger: options.logger } : {}),
    });
  }

  async generate(req: ImageRequest, signal?: AbortSignal): Promise<ImageGenerationResult> {
    const model = this.models.get(req.model);
    if (!model) {
      throw new ProviderRequestError(`unknown model '${req.model}' for ${this.id}`, {
        vendorId: this.id,
      });
    }

    // Apply defaults, then validate.
    const merged = applyImageDefaults(req, model);
    validateImageRequestAgainstModel(this.id, merged, model);

    const body = this.buildRequestBody(merged, model);
    const url = this.urlBuilder(model.id);
    const opts: { signal?: AbortSignal; schema: typeof OpenAIImageResponseSchema } = {
      schema: OpenAIImageResponseSchema,
    };
    if (signal) opts.signal = signal;
    const response = await this.http.post<z.infer<typeof OpenAIImageResponseSchema>>(url, body, opts);

    const outputs: ImageOutput[] = [];
    for (const entry of response.data) {
      if (entry.b64_json) {
        const bytes = decodeBase64(entry.b64_json);
        outputs.push({
          bytes,
          mimeType: "image/png",
          ...parseSize(merged.size),
          ...(entry.revised_prompt ? { raw: { revised_prompt: entry.revised_prompt } } : {}),
        });
      } else if (entry.url) {
        // Some deployments return URLs even when b64 is requested.
        const dl = await this.http.getBytes(entry.url, signal ? { signal } : {});
        outputs.push({
          bytes: dl.bytes,
          mimeType: dl.mimeType.startsWith("image/") ? dl.mimeType : "image/png",
          ...parseSize(merged.size),
        });
      } else {
        throw new ProviderResponseError("response entry missing both b64_json and url", {
          vendorId: this.id,
        });
      }
    }
    if (outputs.length === 0) {
      throw new ProviderError("no image outputs returned", { vendorId: this.id });
    }
    return { outputs };
  }

  /**
   * Minimal auth probe — `GET {baseUrl}/models`. A 200 with at least one of
   * the configured model ids present (if any) is a strong signal that the key
   * is valid; otherwise we accept any 200 as authenticated.
   */
  async test(signal?: AbortSignal): Promise<ProviderTestResult> {
    const started = Date.now();
    const baseUrl = this.options.baseUrl ?? DEFAULT_OPENAI_BASE_URL;
    const url = `${baseUrl.replace(/\/+$/, "")}/models`;
    try {
      const opts: { signal?: AbortSignal } = {};
      if (signal) opts.signal = signal;
      const response = await this.http.get<{ data?: Array<{ id?: string }> }>(url, opts);
      const latencyMs = Date.now() - started;
      const ids = (response?.data ?? [])
        .map((m) => m.id)
        .filter((s): s is string => typeof s === "string");
      const configured = [...this.models.keys()];
      const matched = configured.find((id) => ids.includes(id));
      const out: ProviderTestResult = matched
        ? { ok: true, latencyMs, sampleModelId: matched }
        : { ok: true, latencyMs };
      return out;
    } catch (err) {
      return testFailureFromError(err);
    }
  }

  protected buildRequestBody(req: ImageRequest, model: ImageModelDef): Record<string, unknown> {
    const caps = model.capabilities;
    const body: Record<string, unknown> = {
      model: model.id,
      prompt: req.prompt,
      n: req.count,
      response_format: "b64_json",
    };
    if (req.size) body.size = req.size;
    // `quality` and `style` are dall-e-3 specific and gated on caps.supportsStyleRef.
    const raw = (req.raw ?? {}) as { quality?: string; style?: string };
    if (raw.quality) body.quality = raw.quality;
    if (raw.style && caps?.supportsStyleRef) body.style = raw.style;
    return body;
  }
}

function defaultBearerAuth(apiKey: string): Record<string, string> {
  return { Authorization: `Bearer ${apiKey}` };
}

export function aggregateCapabilities(
  models: ReadonlyMap<string, ImageModelDef>,
): ImageCapabilities {
  const sizes = new Set<string>();
  const aspectRatios = new Set<string>();
  let maxReferences = 0;
  let maxOutputs = 1;
  let supportsNegativePrompt = false;
  let supportsSeed = false;
  let supportsStyleRef = false;
  for (const m of models.values()) {
    const c = m.capabilities;
    if (!c) continue;
    for (const s of c.sizes ?? []) sizes.add(s);
    for (const a of c.aspectRatios ?? []) aspectRatios.add(a);
    maxReferences = Math.max(maxReferences, c.maxReferences ?? 0);
    maxOutputs = Math.max(maxOutputs, c.maxOutputs);
    supportsNegativePrompt ||= c.supportsNegativePrompt;
    supportsSeed ||= c.supportsSeed;
    supportsStyleRef ||= c.supportsStyleRef;
  }
  return {
    sizes: [...sizes],
    aspectRatios: [...aspectRatios],
    maxReferences,
    maxOutputs,
    supportsNegativePrompt,
    supportsSeed,
    supportsStyleRef,
  };
}

function decodeBase64(s: string): Uint8Array<ArrayBuffer> {
  // Buffer.from(...) yields Uint8Array<ArrayBufferLike>; copy into a fresh
  // ArrayBuffer so the resulting Uint8Array is the strictly-typed variant.
  const b = Buffer.from(s, "base64");
  const ab = new ArrayBuffer(b.byteLength);
  const out = new Uint8Array(ab);
  out.set(b);
  return out;
}

function parseSize(size: string | undefined): { width?: number; height?: number } {
  if (!size) return {};
  const m = /^(\d+)x(\d+)$/.exec(size);
  if (!m) return {};
  return { width: Number(m[1]), height: Number(m[2]) };
}

/**
 * Convert any thrown error into a `ProviderTestResult` failure shape.
 * Shared by every vendor's `test()` so they have identical never-throws
 * semantics.
 */
export function testFailureFromError(err: unknown): ProviderTestResult {
  if (err instanceof ProviderHttpError) {
    return { ok: false, reason: err.message, status: err.status ?? 0 };
  }
  if (err instanceof ProviderError) {
    const out: ProviderTestResult = err.status !== undefined
      ? { ok: false, reason: err.message, status: err.status }
      : { ok: false, reason: err.message };
    return out;
  }
  if (err instanceof Error) {
    return { ok: false, reason: err.message };
  }
  return { ok: false, reason: String(err) };
}
