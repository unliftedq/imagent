import {
  ProviderError,
  ProviderHttpError,
  ProviderResponseError,
  type Logger,
  type ProviderTestResult,
  type VideoGenerationResult,
  type VideoJobHandle,
  type VideoJobStatus,
  type VideoModelDef,
  type VideoOutput,
  type VideoRequest,
} from "@imagent/core";
import { GoogleGenAI } from "@google/genai";
import {
  BaseVideoProvider,
  coerceMimeType,
  decodeBase64,
  mergeRawOptions,
  rethrowGenericSdkError,
  runListProbe,
} from "../common/index.js";
import { createHttpClient, type HttpClient } from "../http/index.js";
import {
  DEFAULT_GOOGLE_BASE_URL,
  listGoogleModelIds,
  type GoogleGenAIClientLike,
} from "./image.js";

/**
 * Minimal SDK surface used by `GoogleVideoProvider`. Tests inject a fake.
 * In production we construct `new GoogleGenAI({ apiKey })`.
 */
export interface GoogleGenAIVideoClientLike extends GoogleGenAIClientLike {
  models: GoogleGenAIClientLike["models"] & {
    generateVideos?: (params: {
      model: string;
      prompt?: string;
      config?: Record<string, unknown>;
    }) => Promise<{
      name?: string;
      done?: boolean;
      response?: unknown;
      error?: { code?: number; message?: string; status?: string };
    }>;
  };
  operations: {
    getVideosOperation: (params: {
      operation: { name?: string };
    }) => Promise<{
      name?: string;
      done?: boolean;
      response?: unknown;
      error?: { code?: number; message?: string; status?: string };
    }>;
  };
}

export interface GoogleVideoProviderOptions {
  apiKey: string;
  baseUrl?: string;
  models: ReadonlyMap<string, VideoModelDef>;
  client?: GoogleGenAIVideoClientLike;
  /** Inject fetch for raw downloads (tests). */
  fetch?: typeof fetch;
  logger?: Logger;
}

interface GeneratedVideoLike {
  generatedVideos?: Array<{
    video?: { uri?: string; videoBytes?: string; mimeType?: string };
  }>;
  generateVideoResponse?: {
    generatedSamples?: Array<{ video?: { uri?: string; videoBytes?: string; mimeType?: string } }>;
  };
  predictions?: Array<{ video?: { uri?: string } }>;
}

/**
 * Google Veo video provider — backed by the `@google/genai` SDK's
 * `models.generateVideos` long-running operation. Submit returns an
 * operation `name` we round-trip as `providerJobId`; poll/fetch hit
 * `operations.getVideosOperation`.
 *
 * Auth: apiKey at SDK construction time; the resulting MP4 URL still
 * requires `?key=` for download (which we tack on manually since the SDK's
 * `downloadFile` writes to disk and we want bytes).
 */
export class GoogleVideoProvider extends BaseVideoProvider {
  private readonly client: GoogleGenAIVideoClientLike;
  private readonly http: HttpClient;
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(options: GoogleVideoProviderOptions) {
    super({
      providerId: "google",
      displayName: "Google AI Studio",
      models: options.models,
      ...(options.logger !== undefined ? { logger: options.logger } : {}),
    });
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_GOOGLE_BASE_URL).replace(/\/+$/, "");
    if (options.client) {
      this.client = options.client;
    } else {
      const opts: { apiKey: string; httpOptions?: { baseUrl?: string } } = {
        apiKey: options.apiKey,
      };
      if (options.baseUrl) opts.httpOptions = { baseUrl: options.baseUrl };
      this.client = new GoogleGenAI(opts) as unknown as GoogleGenAIVideoClientLike;
    }
    this.http = createHttpClient({
      vendorId: this.id,
      ...(options.fetch !== undefined ? { fetch: options.fetch } : {}),
      ...(options.logger !== undefined ? { logger: options.logger } : {}),
    });
  }

  protected async doSubmit(merged: VideoRequest, model: VideoModelDef): Promise<VideoJobHandle> {
    const config: Record<string, unknown> = {};
    if (merged.aspectRatio) config.aspectRatio = merged.aspectRatio;
    if (merged.durationSec !== undefined) config.durationSeconds = merged.durationSec;
    if (merged.resolution) config.resolution = merged.resolution;
    config.personGeneration = "allow_all";

    if (model.id.startsWith("veo-2.")) {
      const count = (model.defaults as { count?: number } | undefined)?.count;
      if (count !== undefined) config.numberOfVideos = count;
    }

    mergeRawOptions(config, merged.raw);

    if (!this.client.models.generateVideos) {
      throw new ProviderResponseError("SDK does not expose generateVideos", {
        vendorId: this.id,
      });
    }

    let op: Awaited<ReturnType<NonNullable<GoogleGenAIVideoClientLike["models"]["generateVideos"]>>>;
    try {
      op = await this.client.models.generateVideos({
        model: model.id,
        prompt: merged.prompt,
        config,
      });
    } catch (err) {
      rethrowGenericSdkError(err, this.id);
    }
    if (!op.name) {
      throw new ProviderResponseError("Veo submit response missing operation name", {
        vendorId: this.id,
      });
    }
    return { providerId: this.id, providerJobId: op.name };
  }

  async poll(handle: VideoJobHandle): Promise<VideoJobStatus> {
    const op = await this.fetchOperation(handle.providerJobId);
    if (op.done !== true) {
      return { state: "running" };
    }
    if (op.error) {
      const out: VideoJobStatus = { state: "failed" };
      if (op.error.message) out.errorMessage = op.error.message;
      return out;
    }
    return { state: "succeeded" };
  }

  async fetch(handle: VideoJobHandle): Promise<VideoGenerationResult> {
    const op = await this.fetchOperation(handle.providerJobId);
    if (op.done !== true) {
      throw new ProviderError("fetch() called before operation done", { vendorId: this.id });
    }
    if (op.error) {
      throw new ProviderError(`Veo operation failed: ${op.error.message ?? "unknown error"}`, {
        vendorId: this.id,
      });
    }
    const resp = (op.response ?? {}) as GeneratedVideoLike;
    // Inline base64 path — preferred when the SDK already returned bytes.
    const inlineBytes = pickInlineVideoBytes(resp);
    if (inlineBytes) {
      const out: VideoOutput = {
        bytes: decodeBase64(inlineBytes.data),
        mimeType: inlineBytes.mimeType ?? "video/mp4",
      };
      return { output: out };
    }
    const uri = pickVideoUri(resp);
    if (!uri) {
      this.logger?.warn?.("veo response missing video uri", { resp });
      throw new ProviderResponseError("Veo response missing video uri", {
        vendorId: this.id,
        bodyExcerpt: JSON.stringify(resp).slice(0, 512),
      });
    }
    const downloadUrl = appendApiKey(uri, this.apiKey);
    const dl = await this.http.getBytes(downloadUrl);
    const out: VideoOutput = {
      bytes: dl.bytes,
      mimeType: coerceMimeType(dl.mimeType, "video/", "video/mp4"),
    };
    return { output: out };
  }

  /**
   * The SDK doesn't surface a Veo cancel; the underlying long-running
   * operations API does support DELETE on the operation name. We try it via
   * raw HTTP and surface "not supported" on 404/405.
   */
  async cancel(handle: VideoJobHandle): Promise<void> {
    const opName = handle.providerJobId.replace(/^\/+/, "");
    const url = `${this.baseUrl}/${opName}?key=${encodeURIComponent(this.apiKey)}`;
    try {
      await this.http.del(url);
    } catch (err) {
      if (
        err instanceof ProviderHttpError &&
        (err.status === 404 || err.status === 405 || err.status === 501)
      ) {
        throw new ProviderError("cancel not supported by Veo", {
          vendorId: this.id,
          status: err.status,
        });
      }
      throw err;
    }
  }

  /**
   * Auth probe — drain a page from `models.list()` and look for at least one
   * `veo*` entry (or one of the configured ids).
   */
  protected async doTest(_signal?: AbortSignal): Promise<ProviderTestResult> {
    return runListProbe({
      listIds: () => listGoogleModelIds(this.client),
      configuredIds: [...this.models.keys()],
      matcher: (id, listed) => listed === id || listed.endsWith(`/${id}`) || listed.endsWith(id),
      failOnEmptyList: true,
    });
  }

  private async fetchOperation(opName: string): Promise<{
    name?: string;
    done?: boolean;
    response?: unknown;
    error?: { code?: number; message?: string; status?: string };
  }> {
    try {
      return await this.client.operations.getVideosOperation({ operation: { name: opName } });
    } catch (err) {
      rethrowGenericSdkError(err, this.id);
    }
  }
}

/**
 * Find the video URI inside a Veo operation response. Accept the canonical
 * SDK `generatedVideos[]` shape, the documented v1beta
 * `generateVideoResponse.generatedSamples[]`, and the legacy
 * `predictions[]` shape (defensive — older SDK rev'd doc snippets).
 */
function pickVideoUri(resp: GeneratedVideoLike): string | undefined {
  const fromGenerated = resp.generatedVideos?.[0]?.video?.uri;
  if (fromGenerated) return fromGenerated;
  const fromSamples = resp.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
  if (fromSamples) return fromSamples;
  const fromPredictions = resp.predictions?.[0]?.video?.uri;
  if (fromPredictions) return fromPredictions;
  return undefined;
}

/**
 * If the Veo response carried inline base64 bytes (rare but possible
 * depending on config / SDK version), return them so the caller skips the
 * download round-trip.
 */
function pickInlineVideoBytes(
  resp: GeneratedVideoLike,
): { data: string; mimeType?: string } | undefined {
  const fromGenerated = resp.generatedVideos?.[0]?.video;
  if (fromGenerated?.videoBytes) {
    return fromGenerated.mimeType
      ? { data: fromGenerated.videoBytes, mimeType: fromGenerated.mimeType }
      : { data: fromGenerated.videoBytes };
  }
  const fromSamples = resp.generateVideoResponse?.generatedSamples?.[0]?.video;
  if (fromSamples?.videoBytes) {
    return fromSamples.mimeType
      ? { data: fromSamples.videoBytes, mimeType: fromSamples.mimeType }
      : { data: fromSamples.videoBytes };
  }
  return undefined;
}

function appendApiKey(url: string, apiKey: string): string {
  if (/[?&]key=/.test(url)) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}key=${encodeURIComponent(apiKey)}`;
}

// (BaseVideoProvider handles applyVideoDefaults + validateVideoRequestAgainstModel
// before calling doSubmit, so this file no longer needs to import them.)
