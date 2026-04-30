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
import OpenAI, { APIError } from "openai";

/**
 * Canonical OpenAI base URL. Hardcoded — users configure auth only. A
 * power-user override is available via `secrets.openai.baseUrl` (not
 * surfaced in the desktop UI).
 */
export const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";

/**
 * Minimal SDK client surface used by `OpenAIImageProvider`. Tests inject a
 * fake; production constructs a real `OpenAI` instance. Defined structurally
 * so test fakes don't need to satisfy the full `OpenAI` shape.
 */
export interface OpenAIClientLike {
  images: {
    generate: (
      body: Record<string, unknown>,
      options?: { signal?: AbortSignal },
    ) => Promise<{ data?: Array<{ b64_json?: string; url?: string; revised_prompt?: string }> }>;
  };
  models: {
    list: (
      options?: { signal?: AbortSignal },
    ) => Promise<{ data?: Array<{ id?: string }> }> | AsyncIterable<{ id?: string }>;
  };
}

export interface OpenAIImageProviderOptions {
  apiKey: string;
  baseUrl?: string | null;
  models: ReadonlyMap<string, ImageModelDef>;
  /** Inject a SDK client (tests). In production we construct one. */
  client?: OpenAIClientLike;
  logger?: Logger;
}

export class OpenAIImageProvider implements ImageProvider {
  readonly id = "openai";
  readonly displayName = "OpenAI";
  readonly capabilities: ImageCapabilities;
  readonly models: ReadonlyMap<string, ImageModelDef>;
  protected readonly client: OpenAIClientLike;
  protected readonly logger?: Logger;

  constructor(options: OpenAIImageProviderOptions) {
    this.models = options.models;
    this.capabilities = aggregateCapabilities(options.models);
    if (options.logger) this.logger = options.logger;
    this.client =
      options.client ??
      (new OpenAI({
        apiKey: options.apiKey,
        baseURL: options.baseUrl ?? DEFAULT_OPENAI_BASE_URL,
      }) as unknown as OpenAIClientLike);
  }

  async generate(req: ImageRequest, signal?: AbortSignal): Promise<ImageGenerationResult> {
    const model = this.models.get(req.model);
    if (!model) {
      throw new ProviderRequestError(`unknown model '${req.model}' for ${this.id}`, {
        vendorId: this.id,
      });
    }

    const merged = applyImageDefaults(req, model);
    validateImageRequestAgainstModel(this.id, merged, model);

    const body = buildOpenAIImageBody(merged, model);
    const opts: { signal?: AbortSignal } = {};
    if (signal) opts.signal = signal;

    let response: { data?: Array<{ b64_json?: string; url?: string; revised_prompt?: string }> };
    try {
      response = await this.client.images.generate(body, opts);
    } catch (err) {
      throw rethrowOpenAIError(err, this.id);
    }

    const data = response?.data ?? [];
    const outputs: ImageOutput[] = [];
    for (const entry of data) {
      if (entry.b64_json) {
        const bytes = decodeBase64(entry.b64_json);
        outputs.push({
          bytes,
          mimeType: "image/png",
          ...parseSize(merged.size),
          ...(entry.revised_prompt ? { raw: { revised_prompt: entry.revised_prompt } } : {}),
        });
      } else if (entry.url) {
        // Fallback for deployments that ignore response_format and return URLs.
        const dl = await fetchBytesFromUrl(entry.url, signal);
        outputs.push({
          bytes: dl.bytes,
          mimeType: dl.mimeType,
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
   * Auth probe — `client.models.list()`. A response with at least one entry
   * means the key is valid. We additionally annotate the response when one of
   * our configured model ids is present in the listing.
   */
  async test(signal?: AbortSignal): Promise<ProviderTestResult> {
    const started = Date.now();
    const probeSignal = signal ?? AbortSignal.timeout(8000);
    try {
      const ids = await listModelIds(this.client, probeSignal);
      const latencyMs = Date.now() - started;
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
}

/**
 * Build the OpenAI-compatible images.generate body. Shared by Azure / xAI /
 * ByteDance via direct import (each provider stays its own class but doesn't
 * need to re-derive what defaults to forward).
 */
export function buildOpenAIImageBody(
  req: ImageRequest,
  model: ImageModelDef,
): Record<string, unknown> {
  const caps = model.capabilities;
  const body: Record<string, unknown> = {
    model: model.id,
    prompt: req.prompt,
    n: req.count,
    response_format: "b64_json",
  };
  if (req.size) body.size = req.size;
  // Quality flows through when the model declares a non-empty `qualities`
  // list (validated upstream against `caps.qualities`). Falls back to
  // `req.raw.quality` for power-user requests that bypass the schema field.
  const raw = (req.raw ?? {}) as { quality?: string; style?: string };
  if (req.quality && caps?.qualities && caps.qualities.length > 0) {
    body.quality = req.quality;
  } else if (raw.quality) {
    body.quality = raw.quality;
  }
  if (raw.style && caps?.supportsStyleRef) body.style = raw.style;
  return body;
}

/**
 * Convert SDK errors (or anything else) into our ProviderError hierarchy so
 * callers see consistent shapes regardless of which path threw.
 */
export function rethrowOpenAIError(err: unknown, vendorId: string): never {
  if (err instanceof APIError) {
    if (typeof err.status === "number") {
      throw new ProviderHttpError(`HTTP ${err.status} from openai SDK: ${err.message}`, {
        vendorId,
        status: err.status,
      });
    }
    throw new ProviderError(err.message, { vendorId });
  }
  if (err instanceof Error) throw new ProviderError(err.message, { vendorId, cause: err });
  throw new ProviderError(String(err), { vendorId });
}

/**
 * `models.list()` returns a `PagePromise` (async iterable) in the real SDK.
 * For tests we accept either an array-shaped `{ data }` value or an async
 * iterable. Either path returns the model id list.
 */
export async function listModelIds(
  client: OpenAIClientLike,
  signal?: AbortSignal,
): Promise<string[]> {
  const opts: { signal?: AbortSignal } = {};
  if (signal) opts.signal = signal;
  const result = await client.models.list(opts);
  // Real SDK PagePromise: has both AsyncIterable<Item> AND a resolved Page that
  // exposes `data`. The resolved value (after await) IS the page; PagePromise's
  // resolution exposes `data`. Tests typically return `{ data: [...] }`.
  if (result && typeof (result as { data?: unknown }).data !== "undefined") {
    const data = (result as { data?: Array<{ id?: string }> }).data ?? [];
    return data.map((m) => m?.id).filter((s): s is string => typeof s === "string");
  }
  // Fall back: drain the async iterable.
  const ids: string[] = [];
  if (typeof (result as AsyncIterable<{ id?: string }>)[Symbol.asyncIterator] === "function") {
    for await (const m of result as AsyncIterable<{ id?: string }>) {
      if (typeof m?.id === "string") ids.push(m.id);
    }
  }
  return ids;
}

async function fetchBytesFromUrl(
  url: string,
  signal?: AbortSignal,
): Promise<{ bytes: Uint8Array<ArrayBuffer>; mimeType: string }> {
  const init: RequestInit = signal ? { signal } : {};
  const res = await fetch(url, init);
  if (!res.ok) {
    throw new ProviderHttpError(`HTTP ${res.status} downloading ${url}`, {
      vendorId: "openai",
      status: res.status,
    });
  }
  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf as ArrayBuffer);
  const mimeType = res.headers.get("content-type") ?? "image/png";
  return { bytes, mimeType: mimeType.startsWith("image/") ? mimeType : "image/png" };
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

export function decodeBase64(s: string): Uint8Array<ArrayBuffer> {
  const b = Buffer.from(s, "base64");
  const ab = new ArrayBuffer(b.byteLength);
  const out = new Uint8Array(ab);
  out.set(b);
  return out;
}

export function parseSize(size: string | undefined): { width?: number; height?: number } {
  if (!size) return {};
  const m = /^(\d+)x(\d+)$/.exec(size);
  if (!m) return {};
  return { width: Number(m[1]), height: Number(m[2]) };
}

/**
 * Convert any thrown error into a `ProviderTestResult` failure shape. Shared
 * by every vendor's `test()` so they have identical never-throws semantics.
 */
export function testFailureFromError(err: unknown): ProviderTestResult {
  if (err instanceof APIError && typeof err.status === "number") {
    return { ok: false, reason: `HTTP ${err.status}: ${err.message}`, status: err.status };
  }
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
