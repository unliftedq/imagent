import {
  appendImageReferenceInstructions,
  type ImageGenerationResult,
  type ImageModelDef,
  type ImageRequest,
  isAbortError,
  type Logger,
  ProviderError,
  ProviderHttpError,
  type ProviderTestResult,
} from "@imagent/core";
import {
  BaseImageProvider,
  createAbortableSleep,
  DEFAULT_FLUX_POLL_ENVELOPE,
  type FluxPollEnvelope,
  FluxSubmitResponseSchema,
  pollFluxJob,
  testFailureFromError,
} from "../common/index.js";
import { createHttpClient, type HttpClient } from "../http/index.js";
import { imageDataUrl, loadImageReferences } from "../reference-images.js";

/** Canonical BFL base URL. */
export const DEFAULT_FLUX_BASE_URL = "https://api.bfl.ai";

export interface FluxImageProviderOptions {
  apiKey: string;
  baseUrl?: string;
  models: ReadonlyMap<string, ImageModelDef>;
  fetch?: typeof fetch;
  logger?: Logger;
  /** Override the polling envelope (mostly for tests). */
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
  /** Sleep injection for tests. */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

export class FluxImageProvider extends BaseImageProvider {
  private readonly http: HttpClient;
  private readonly baseUrl: string;
  private readonly envelope: FluxPollEnvelope;
  private readonly sleep: (ms: number, signal?: AbortSignal) => Promise<void>;

  constructor(options: FluxImageProviderOptions) {
    super({
      providerId: "flux-bfl",
      displayName: "Black Forest Labs",
      models: options.models,
      ...(options.logger !== undefined ? { logger: options.logger } : {}),
    });
    this.baseUrl = (options.baseUrl ?? DEFAULT_FLUX_BASE_URL).replace(/\/+$/, "");
    this.http = createHttpClient({
      vendorId: this.id,
      headers: { "x-key": options.apiKey },
      ...(options.fetch !== undefined ? { fetch: options.fetch } : {}),
      ...(options.logger !== undefined ? { logger: options.logger } : {}),
    });
    this.envelope = {
      ...DEFAULT_FLUX_POLL_ENVELOPE,
      ...(options.pollIntervalMs !== undefined ? { intervalMs: options.pollIntervalMs } : {}),
      ...(options.pollTimeoutMs !== undefined ? { timeoutMs: options.pollTimeoutMs } : {}),
    };
    this.sleep = options.sleep ?? createAbortableSleep(this.id);
  }

  protected async doGenerate(
    merged: ImageRequest,
    model: ImageModelDef,
    signal?: AbortSignal,
  ): Promise<ImageGenerationResult> {
    // BFL endpoints are model-named (`/v1/flux-2-pro`, etc.).
    const url = `${this.baseUrl}/v1/${encodeURIComponent(model.id)}`;
    const body = await this.buildSubmitBody(merged);
    const submitOpts: { signal?: AbortSignal; schema: typeof FluxSubmitResponseSchema } = {
      schema: FluxSubmitResponseSchema,
    };
    if (signal) submitOpts.signal = signal;
    const submit = await this.http.post<{ id?: string; polling_url?: string }>(
      url,
      body,
      submitOpts,
    );
    if (!submit.polling_url || !submit.id) {
      throw new ProviderError("flux submit response missing id or polling_url", {
        vendorId: this.id,
      });
    }
    const outputs = await pollFluxJob({
      pollUrl: submit.polling_url,
      jobId: submit.id,
      vendorId: this.id,
      http: this.http,
      sleep: this.sleep,
      envelope: this.envelope,
      ...(signal !== undefined ? { signal } : {}),
    });
    return { outputs };
  }

  /**
   * BFL has no listing endpoint, so we probe `GET {baseUrl}/v1/get_result?id=<fake>`:
   * - With a valid key, BFL returns 404 ("task not found").
   * - With an invalid key, BFL returns 401 (auth rejected).
   * Anything else surfaces as a generic failure with the upstream status.
   */
  protected async doTest(signal?: AbortSignal): Promise<ProviderTestResult> {
    const started = Date.now();
    const fakeId = "imagent-probe-0000-0000-0000-000000000000";
    const url = `${this.baseUrl}/v1/get_result?id=${encodeURIComponent(fakeId)}`;
    try {
      const opts: { signal?: AbortSignal } = {};
      if (signal) opts.signal = signal;
      await this.http.get(url, opts);
      return { ok: true, latencyMs: Date.now() - started };
    } catch (err) {
      if (err instanceof ProviderHttpError && err.status === 404) {
        return { ok: true, latencyMs: Date.now() - started };
      }
      return testFailureFromError(err);
    }
  }

  private async buildSubmitBody(req: ImageRequest): Promise<Record<string, unknown>> {
    const out: Record<string, unknown> = {
      prompt: appendImageReferenceInstructions(req.prompt, req.references),
    };
    if (req.aspectRatio) out.aspect_ratio = req.aspectRatio;
    if (req.size) {
      const m = /^(\d+)x(\d+)$/.exec(req.size);
      if (m) {
        out.width = Number(m[1]);
        out.height = Number(m[2]);
      }
    }
    if (req.references.length > 0) {
      const refs = await loadImageReferences(req.references, this.id);
      const dataUrls = refs.map(imageDataUrl);
      out.input_images = dataUrls;
      if (dataUrls[0]) out.input_image = dataUrls[0];
    }
    if (req.raw) Object.assign(out, req.raw);
    return out;
  }
}

// Re-export so tests don't need an extra import.
export { isAbortError };
