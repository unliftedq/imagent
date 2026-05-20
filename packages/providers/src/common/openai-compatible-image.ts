import {
  type ImageGenerationResult,
  type ImageModelDef,
  type ImageOutput,
  type ImageRequest,
  type Logger,
  ProviderError,
  ProviderHttpError,
  ProviderRequestError,
  ProviderResponseError,
} from "@imagent/core";
import { coerceMimeType, decodeBase64 } from "./bytes.js";
import { BaseImageProvider, type BaseImageProviderOptions } from "./image-provider.js";
import { mimeTypeForOutputFormat, parseSize } from "./size.js";

/**
 * Minimal SDK client surface used by every OpenAI-compatible image provider.
 * Tests inject a fake; production constructs a real `OpenAI` instance.
 * Defined structurally so test fakes don't need to satisfy the full `OpenAI`
 * shape.
 */
export interface OpenAIClientLike {
  images: {
    generate: OpenAIImageMethod;
    edit?: OpenAIImageMethod;
  };
  models: {
    list: (options?: {
      signal?: AbortSignal;
    }) => Promise<{ data?: Array<{ id?: string }> }> | AsyncIterable<{ id?: string }>;
  };
}

export type OpenAIImageResponse = {
  data?: Array<{ b64_json?: string; url?: string; revised_prompt?: string }>;
};
export type OpenAIImageMethod = (
  body: Record<string, unknown>,
  options?: { signal?: AbortSignal },
) => Promise<OpenAIImageResponse>;

/**
 * Body envelope returned by subclasses' `buildBody()`. `outputSize` overrides
 * the size string used when emitting `ImageOutput.{width,height}`; subclasses
 * that derive a different size than `req.size` (e.g. ByteDance's Seedream
 * aspect-ratio table) set it explicitly.
 */
export interface OpenAICompatibleBody {
  body: Record<string, unknown>;
  /** Override the `WIDTHxHEIGHT` used to compute `width`/`height` on outputs. */
  outputSize?: string | undefined;
  /** Override per-output MIME. Defaults to `mimeTypeForOutputFormat(req.outputFormat)`. */
  mimeType?: string;
}

export interface OpenAICompatibleImageProviderOptions extends BaseImageProviderOptions {
  client: OpenAIClientLike;
  /**
   * Enable the `url → fetch(url)` fallback for responses that ignore
   * `response_format` and return a URL instead of `b64_json`. Only the
   * canonical OpenAI provider currently sets this — Azure / ByteDance always
   * return base64.
   */
  supportsUrlFallback?: boolean;
  /**
   * When `supportsUrlFallback` is true, the function used to download bytes
   * for the URL path. Allows subclasses to share their existing fetcher.
   */
  fetchBytesFromUrl?: (
    url: string,
    signal?: AbortSignal,
  ) => Promise<{ bytes: Uint8Array<ArrayBuffer>; mimeType: string }>;
  /** Map any vendor SDK error to our ProviderError hierarchy. */
  rethrowSdkError: (err: unknown, vendorId: string) => never;
}

/**
 * Shared base for OpenAI / Azure (openai-images family) / ByteDance image
 * providers. Hosts the SDK client, the references→edit() vs generate()
 * branch, and the `response.data → ImageOutput[]` decoding loop so each
 * vendor's class collapses to "build body + handle URL fallback if any".
 */
export abstract class OpenAICompatibleImageProvider extends BaseImageProvider {
  protected readonly client: OpenAIClientLike;
  protected readonly supportsUrlFallback: boolean;
  private readonly fetchBytesFromUrl?: (
    url: string,
    signal?: AbortSignal,
  ) => Promise<{ bytes: Uint8Array<ArrayBuffer>; mimeType: string }>;
  protected readonly rethrowSdkError: (err: unknown, vendorId: string) => never;

  constructor(
    options: OpenAICompatibleImageProviderOptions & { logger?: Logger | undefined },
  ) {
    super(options);
    this.client = options.client;
    this.supportsUrlFallback = options.supportsUrlFallback ?? false;
    if (options.fetchBytesFromUrl) this.fetchBytesFromUrl = options.fetchBytesFromUrl;
    this.rethrowSdkError = options.rethrowSdkError;
  }

  protected async doGenerate(
    merged: ImageRequest,
    model: ImageModelDef,
    signal?: AbortSignal,
  ): Promise<ImageGenerationResult> {
    const { body, outputSize, mimeType } = await this.buildBody(merged, model);
    const response = await callOpenAIImageEndpoint({
      client: this.client,
      body,
      hasReferences: merged.references.length > 0,
      vendorId: this.id,
      rethrowSdkError: this.rethrowSdkError,
      ...(signal !== undefined ? { signal } : {}),
    });
    const outputs = await decodeOpenAIImageResponse(response, {
      vendorId: this.id,
      ...(outputSize ?? merged.size
        ? { sizeForOutput: (outputSize ?? merged.size) as string }
        : {}),
      defaultMimeType: mimeType ?? mimeTypeForOutputFormat(merged.outputFormat),
      ...(this.supportsUrlFallback && this.fetchBytesFromUrl
        ? { fetchBytesFromUrl: this.fetchBytesFromUrl }
        : {}),
      ...(signal !== undefined ? { signal } : {}),
    });
    if (outputs.length === 0) {
      throw new ProviderError("no image outputs returned", { vendorId: this.id });
    }
    return { outputs };
  }

  /**
   * Build the wire body sent to `images.generate` / `images.edit`. Subclasses
   * may pre-load references etc. since this is async.
   */
  protected abstract buildBody(
    merged: ImageRequest,
    model: ImageModelDef,
  ): Promise<OpenAICompatibleBody>;
}

export interface CallOpenAIImageEndpointOptions {
  client: OpenAIClientLike;
  body: Record<string, unknown>;
  hasReferences: boolean;
  vendorId: string;
  rethrowSdkError: (err: unknown, vendorId: string) => never;
  signal?: AbortSignal;
}

/**
 * Dispatch a built body to `images.edit` (when there are references) or
 * `images.generate` (when there aren't), routing SDK errors through the
 * vendor-supplied `rethrowSdkError`. Shared by `OpenAICompatibleImageProvider`
 * and `AzureImageProvider`'s OpenAI-family branch.
 */
export async function callOpenAIImageEndpoint(
  opts: CallOpenAIImageEndpointOptions,
): Promise<OpenAIImageResponse> {
  const reqOpts: { signal?: AbortSignal } = {};
  if (opts.signal) reqOpts.signal = opts.signal;
  try {
    if (opts.hasReferences) {
      if (!opts.client.images.edit) {
        throw new ProviderRequestError(
          `${opts.vendorId} SDK client does not support image references via images.edit API. Ensure you are using an SDK version that includes the edit method.`,
          { vendorId: opts.vendorId },
        );
      }
      return await opts.client.images.edit(opts.body, reqOpts);
    }
    return await opts.client.images.generate(opts.body, reqOpts);
  } catch (err) {
    opts.rethrowSdkError(err, opts.vendorId);
  }
}

export interface DecodeOpenAIImageResponseOptions {
  vendorId: string;
  sizeForOutput?: string;
  defaultMimeType: string;
  /** Optional URL-fallback bytes fetcher. Omit to reject `url`-only entries. */
  fetchBytesFromUrl?: (
    url: string,
    signal?: AbortSignal,
  ) => Promise<{ bytes: Uint8Array<ArrayBuffer>; mimeType: string }>;
  signal?: AbortSignal;
}

/**
 * Convert the `response.data[]` from an OpenAI-compatible images endpoint
 * into `ImageOutput[]`. Honours the optional `fetchBytesFromUrl` hook for
 * deployments that return `url` instead of `b64_json`.
 */
export async function decodeOpenAIImageResponse(
  response: OpenAIImageResponse,
  opts: DecodeOpenAIImageResponseOptions,
): Promise<ImageOutput[]> {
  const data = response?.data ?? [];
  const outputs: ImageOutput[] = [];
  for (const entry of data) {
    if (entry.b64_json) {
      outputs.push({
        bytes: decodeBase64(entry.b64_json),
        mimeType: opts.defaultMimeType,
        ...parseSize(opts.sizeForOutput),
        ...(entry.revised_prompt ? { raw: { revised_prompt: entry.revised_prompt } } : {}),
      });
      continue;
    }
    if (entry.url) {
      if (!opts.fetchBytesFromUrl) {
        throw new ProviderResponseError("response entry missing b64_json", {
          vendorId: opts.vendorId,
        });
      }
      const dl = await opts.fetchBytesFromUrl(entry.url, opts.signal);
      outputs.push({
        bytes: dl.bytes,
        mimeType: coerceMimeType(dl.mimeType, "image/", "image/png"),
        ...parseSize(opts.sizeForOutput),
      });
      continue;
    }
    throw new ProviderResponseError(
      opts.fetchBytesFromUrl
        ? "response entry missing both b64_json and url"
        : "response entry missing b64_json",
      { vendorId: opts.vendorId },
    );
  }
  return outputs;
}

/**
 * Default URL → bytes fetcher used by the canonical OpenAI provider. Other
 * providers can pass their own (e.g. one that talks through an in-house
 * `HttpClient` for retries).
 */
export async function fetchBytesViaFetch(
  url: string,
  vendorId: string,
  signal?: AbortSignal,
): Promise<{ bytes: Uint8Array<ArrayBuffer>; mimeType: string }> {
  const init: RequestInit = signal ? { signal } : {};
  const res = await fetch(url, init);
  if (!res.ok) {
    throw new ProviderHttpError(`HTTP ${res.status} downloading ${url}`, {
      vendorId,
      status: res.status,
    });
  }
  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf as ArrayBuffer);
  const mimeType = res.headers.get("content-type") ?? "image/png";
  return { bytes, mimeType: coerceMimeType(mimeType, "image/", "image/png") };
}

/**
 * `models.list()` returns a `PagePromise` (async iterable) in the real SDK.
 * For tests we accept either an array-shaped `{ data }` value or an async
 * iterable. Either path returns the model id list.
 */
export async function listOpenAIModelIds(
  client: OpenAIClientLike,
  signal?: AbortSignal,
): Promise<string[]> {
  const opts: { signal?: AbortSignal } = {};
  if (signal) opts.signal = signal;
  const result = await client.models.list(opts);
  if (result && typeof (result as { data?: unknown }).data !== "undefined") {
    const data = (result as { data?: Array<{ id?: string }> }).data ?? [];
    return data.map((m) => m?.id).filter((s): s is string => typeof s === "string");
  }
  const ids: string[] = [];
  if (typeof (result as AsyncIterable<{ id?: string }>)[Symbol.asyncIterator] === "function") {
    for await (const m of result as AsyncIterable<{ id?: string }>) {
      if (typeof m?.id === "string") ids.push(m.id);
    }
  }
  return ids;
}
