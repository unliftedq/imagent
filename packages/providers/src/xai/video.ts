import { randomUUID } from "node:crypto";
import {
  ProviderError,
  ProviderRequestError,
  applyVideoDefaults,
  type Logger,
  type ProviderTestResult,
  type VideoCapabilities,
  type VideoGenerationResult,
  type VideoJobHandle,
  type VideoJobState,
  type VideoJobStatus,
  type VideoModelDef,
  type VideoOutput,
  type VideoProvider,
  type VideoRequest,
  validateVideoRequestAgainstModel,
} from "@imagine/core";
import { createXai, type XaiProvider } from "@ai-sdk/xai";
import { experimental_generateVideo, type GenerateVideoResult } from "ai";

/**
 * `XaiVideoModel` is not re-exported by `ai`, so we lift the model
 * type from the xAI provider's own `.video(...)` return type. Stays accurate
 * across SDK minor bumps.
 */
type XaiVideoModel = ReturnType<XaiProvider["video"]>;
import { createHttpClient, type HttpClient } from "../http/index.js";
import { testFailureFromError } from "../openai/image.js";
import { DEFAULT_XAI_BASE_URL } from "./image.js";
import { aggregateVideoCapabilities } from "../bytedance/video.js";

/**
 * Test seam — production code passes `(modelId) => createXai({...}).video(modelId)`.
 * Tests inject a factory returning a fake `XaiVideoModel` whose
 * `doGenerate` resolves/rejects on demand so we don't hit the network.
 */
export type XaiVideoModelFactory = (modelId: string) => XaiVideoModel;

export interface XaiVideoProviderOptions {
  apiKey: string;
  baseUrl?: string;
  models: ReadonlyMap<string, VideoModelDef>;
  /** Inject the Vercel AI SDK video model factory (tests). In production we build one from `createXai`. */
  modelFactory?: XaiVideoModelFactory;
  /** Override fetch for the auth probe (tests). The Vercel SDK has its own fetch slot we don't reuse. */
  fetch?: typeof fetch;
  logger?: Logger;
}

interface PendingEntry {
  promise: Promise<GenerateVideoResult>;
  state: VideoJobState;
  result?: GenerateVideoResult;
  error?: Error;
  abort: AbortController;
  durationSec?: number;
}

/**
 * xAI Grok Imagine video provider — uses the Vercel AI SDK
 * (`@ai-sdk/xai@4-beta` + `ai@7-beta`) to call Grok Imagine video. Default
 * catalog model is `grok-imagine-video`.
 *
 * The Vercel SDK exposes a single blocking call (`experimental_generateVideo`)
 * that internally polls and downloads the video. Our `VideoProvider` port
 * however is split into `submit` / `poll` / `fetch` / `cancel`. We bridge with
 * an in-memory `Map` keyed by a synthetic `providerJobId`: `submit` kicks off
 * the SDK promise and stores it; `poll` reads the current settled state;
 * `fetch` reads the cached result and removes the entry; `cancel` aborts the
 * underlying signal. Entries that never reach `fetch` are dropped on
 * `cancel()`; this keeps the map bounded.
 *
 * The SDK has no `models.list()` equivalent, so the auth probe in `test()`
 * falls back to a raw `GET /v1/models` via the in-house httpClient — same
 * pattern as `image.ts`.
 */
export class XaiVideoProvider implements VideoProvider {
  readonly id = "xai";
  readonly displayName = "xAI";
  readonly models: ReadonlyMap<string, VideoModelDef>;
  readonly capabilities: VideoCapabilities;
  private readonly modelFactory: XaiVideoModelFactory;
  private readonly probeHttp: HttpClient;
  private readonly baseUrl: string;
  private readonly logger?: Logger;
  /** Pending submissions keyed by synthetic providerJobId. */
  private readonly pending = new Map<string, PendingEntry>();

  constructor(options: XaiVideoProviderOptions) {
    this.models = options.models;
    this.capabilities = aggregateVideoCapabilities(options.models);
    if (options.logger) this.logger = options.logger;
    this.baseUrl = (options.baseUrl ?? DEFAULT_XAI_BASE_URL).replace(/\/+$/, "");

    if (options.modelFactory) {
      this.modelFactory = options.modelFactory;
    } else {
      const provider = createXai({
        apiKey: options.apiKey,
        baseURL: this.baseUrl,
      });
      this.modelFactory = (modelId: string) => provider.video(modelId);
    }

    this.probeHttp = createHttpClient({
      vendorId: this.id,
      headers: { Authorization: `Bearer ${options.apiKey}` },
      ...(options.fetch !== undefined ? { fetch: options.fetch } : {}),
      ...(options.logger !== undefined ? { logger: options.logger } : {}),
    });
  }

  async submit(req: VideoRequest): Promise<VideoJobHandle> {
    const modelDef = this.models.get(req.model);
    if (!modelDef) {
      throw new ProviderRequestError(`unknown video model '${req.model}' for xai`, {
        vendorId: this.id,
      });
    }
    const merged = applyVideoDefaults(req, modelDef);
    validateVideoRequestAgainstModel(this.id, merged, modelDef);

    let model: XaiVideoModel;
    try {
      model = this.modelFactory(modelDef.id);
    } catch (err) {
      throw rethrowSdkError(err, this.id);
    }

    const providerJobId = randomUUID();
    const abort = new AbortController();

    // xAI accepts `480p`/`720p` only (its provider-specific resolution shape),
    // not the SDK-level `${number}x${number}` literal. We therefore route
    // resolution through `providerOptions.xai.resolution`.
    const xaiOpts: Record<string, string> = {};
    if (merged.resolution) {
      xaiOpts.resolution = merged.resolution;
    }

    const args: Parameters<typeof experimental_generateVideo>[0] = {
      model,
      prompt: merged.prompt,
      abortSignal: abort.signal,
      providerOptions: { xai: xaiOpts },
    };
    if (merged.durationSec !== undefined) args.duration = merged.durationSec;
    if (merged.aspectRatio && /^\d+:\d+$/.test(merged.aspectRatio)) {
      args.aspectRatio = merged.aspectRatio as `${number}:${number}`;
    }

    const promise = experimental_generateVideo(args);
    const entry: PendingEntry = {
      promise,
      state: "running",
      abort,
      ...(merged.durationSec !== undefined ? { durationSec: merged.durationSec } : {}),
    };
    this.pending.set(providerJobId, entry);

    // Settle the promise into the entry asynchronously. We must catch here so
    // the rejection doesn't surface as an unhandled rejection — `poll()` /
    // `fetch()` will read the settled state.
    promise.then(
      (result) => {
        entry.result = result;
        entry.state = "succeeded";
      },
      (error: unknown) => {
        const e = error instanceof Error ? error : new Error(String(error));
        entry.error = e;
        entry.state = abort.signal.aborted ? "cancelled" : "failed";
      },
    );

    return { providerId: this.id, providerJobId };
  }

  async poll(handle: VideoJobHandle): Promise<VideoJobStatus> {
    const entry = this.pending.get(handle.providerJobId);
    if (!entry) {
      return { state: "failed", errorMessage: "unknown providerJobId" };
    }
    const out: VideoJobStatus = { state: entry.state };
    if (entry.state === "failed" && entry.error) {
      out.errorMessage = entry.error.message;
    }
    return out;
  }

  async fetch(handle: VideoJobHandle): Promise<VideoGenerationResult> {
    const entry = this.pending.get(handle.providerJobId);
    if (!entry) {
      throw new ProviderError(`fetch() on unknown providerJobId '${handle.providerJobId}'`, {
        vendorId: this.id,
      });
    }
    if (entry.state !== "succeeded" || !entry.result) {
      throw new ProviderError(
        `fetch() called on non-succeeded job (state=${entry.state})`,
        { vendorId: this.id },
      );
    }
    const result = entry.result;
    // GenerateVideoResult shape (ai@7-beta): `result.video` is a single
    // `GeneratedFile { base64, uint8Array, mediaType }`; `result.videos` is
    // the full array (always populated when SDK call succeeds).
    const file = result.video;
    if (!file || !file.uint8Array) {
      throw new ProviderError("succeeded job produced no video bytes", {
        vendorId: this.id,
      });
    }
    const bytes = toAbBytes(file.uint8Array);
    const mimeType = file.mediaType?.startsWith("video/") ? file.mediaType : "video/mp4";
    const out: VideoOutput = { bytes, mimeType };
    if (entry.durationSec !== undefined) {
      out.durationMs = Math.round(entry.durationSec * 1000);
    }
    // Drop the entry now that the consumer has the bytes — keeps the map
    // bounded across long-lived provider lifetimes.
    this.pending.delete(handle.providerJobId);
    return { output: out };
  }

  /**
   * Aborts the underlying SDK call. xAI does not document a server-side cancel
   * endpoint as of 2026-04-28; the abort only short-circuits local polling.
   */
  async cancel(handle: VideoJobHandle): Promise<void> {
    const entry = this.pending.get(handle.providerJobId);
    if (!entry) return;
    entry.abort.abort();
    if (entry.state === "running") {
      entry.state = "cancelled";
    }
    // Swallow the rejection so it doesn't surface as unhandled.
    entry.promise.catch(() => {});
    this.pending.delete(handle.providerJobId);
  }

  /**
   * Auth probe. Vercel AI SDK doesn't expose a list-models call, so we drop
   * down to `GET https://api.x.ai/v1/models` via the in-house httpClient —
   * same pattern as `image.ts`.
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
      this.logger?.debug?.("xai video test() failed", { err: String(err) });
      return testFailureFromError(err);
    }
  }
}

/**
 * Map Vercel AI SDK / `ai` errors onto our ProviderError hierarchy. Mirrors
 * the helper in `image.ts`.
 */
function rethrowSdkError(err: unknown, vendorId: string): never {
  if (err instanceof Error) throw new ProviderError(err.message, { vendorId, cause: err });
  throw new ProviderError(String(err), { vendorId });
}

/**
 * Copy a possibly SharedArrayBuffer-backed `Uint8Array` into a fresh
 * `Uint8Array<ArrayBuffer>` matching our `VideoOutput.bytes` shape.
 */
function toAbBytes(src: Uint8Array): Uint8Array<ArrayBuffer> {
  const ab = new ArrayBuffer(src.byteLength);
  const out = new Uint8Array(ab);
  out.set(src);
  return out;
}
