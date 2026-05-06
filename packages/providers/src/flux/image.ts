import {
  appendImageReferenceInstructions,
  applyImageDefaults,
  type ImageCapabilities,
  type ImageGenerationResult,
  type ImageModelDef,
  type ImageOutput,
  type ImageProvider,
  type ImageRequest,
  isAbortError,
  type Logger,
  ProviderAbortError,
  ProviderError,
  ProviderHttpError,
  ProviderRequestError,
  type ProviderTestResult,
  ProviderTimeoutError,
  validateImageRequestAgainstModel,
} from "@imagent/core";
import { z } from "zod";
import { createHttpClient, type HttpClient } from "../http/index.js";
import { aggregateCapabilities, testFailureFromError } from "../openai/image.js";
import { imageDataUrl, loadImageReferences } from "../reference-images.js";

/** Canonical BFL base URL. */
export const DEFAULT_FLUX_BASE_URL = "https://api.bfl.ai";
// Polling envelope: 1s start, exponential to 5s, max 60s total.
const POLL_INITIAL_MS = 1_000;
const POLL_MAX_MS = 5_000;
const POLL_TIMEOUT_MS = 60_000;
const POLL_BACKOFF = 1.6;

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

const FluxSubmitResponseSchema = z.object({
  id: z.string(),
  polling_url: z.string(),
});

const FluxPollResponseSchema = z.object({
  id: z.string().optional(),
  status: z.string(),
  result: z
    .object({
      sample: z.string().optional(),
    })
    .nullable()
    .optional(),
  progress: z.number().optional(),
  error: z.string().nullable().optional(),
  details: z.unknown().optional(),
});

export class FluxImageProvider implements ImageProvider {
  readonly id = "flux-bfl";
  readonly displayName = "Black Forest Labs";
  readonly models: ReadonlyMap<string, ImageModelDef>;
  readonly capabilities: ImageCapabilities;
  private readonly http: HttpClient;
  private readonly baseUrl: string;
  private readonly pollIntervalMs: number;
  private readonly pollTimeoutMs: number;
  private readonly sleep: (ms: number, signal?: AbortSignal) => Promise<void>;

  constructor(options: FluxImageProviderOptions) {
    this.models = options.models;
    this.capabilities = aggregateCapabilities(options.models);
    this.baseUrl = (options.baseUrl ?? DEFAULT_FLUX_BASE_URL).replace(/\/+$/, "");
    this.http = createHttpClient({
      vendorId: this.id,
      headers: { "x-key": options.apiKey },
      ...(options.fetch !== undefined ? { fetch: options.fetch } : {}),
      ...(options.logger !== undefined ? { logger: options.logger } : {}),
    });
    this.pollIntervalMs = options.pollIntervalMs ?? POLL_INITIAL_MS;
    this.pollTimeoutMs = options.pollTimeoutMs ?? POLL_TIMEOUT_MS;
    this.sleep = options.sleep ?? defaultSleep;
  }

  async generate(req: ImageRequest, signal?: AbortSignal): Promise<ImageGenerationResult> {
    const model = this.models.get(req.model);
    if (!model) {
      throw new ProviderRequestError(`unknown model '${req.model}' for flux-bfl`, {
        vendorId: this.id,
      });
    }
    const merged = applyImageDefaults(req, model);
    validateImageRequestAgainstModel(this.id, merged, model);

    // BFL endpoints are model-named (`/v1/flux-pro-1.1`, etc.).
    const url = `${this.baseUrl}/v1/${encodeURIComponent(model.id)}`;
    const body = await this.buildSubmitBody(merged);
    const submitOpts: { signal?: AbortSignal; schema: typeof FluxSubmitResponseSchema } = {
      schema: FluxSubmitResponseSchema,
    };
    if (signal) submitOpts.signal = signal;
    const submit = await this.http.post<z.infer<typeof FluxSubmitResponseSchema>>(
      url,
      body,
      submitOpts,
    );

    // Poll until terminal.
    const pollUrl = submit.polling_url;
    const start = Date.now();
    let interval = this.pollIntervalMs;
    while (true) {
      if (signal?.aborted) {
        throw new ProviderAbortError(this.id, signal.reason);
      }
      if (Date.now() - start > this.pollTimeoutMs) {
        throw new ProviderTimeoutError(
          `flux job ${submit.id} did not complete within ${this.pollTimeoutMs}ms`,
          {
            vendorId: this.id,
          },
        );
      }
      await this.sleep(interval, signal);
      const pollOpts: { signal?: AbortSignal; schema: typeof FluxPollResponseSchema } = {
        schema: FluxPollResponseSchema,
      };
      if (signal) pollOpts.signal = signal;
      const status = await this.http.get<z.infer<typeof FluxPollResponseSchema>>(pollUrl, pollOpts);

      const s = status.status;
      if (s === "Ready") {
        const sample = status.result?.sample;
        if (!sample) {
          throw new ProviderError("flux Ready response missing result.sample url", {
            vendorId: this.id,
          });
        }
        const dl = await this.http.getBytes(sample, signal ? { signal } : {});
        const out: ImageOutput = {
          bytes: dl.bytes,
          mimeType: dl.mimeType.startsWith("image/") ? dl.mimeType : "image/png",
        };
        return { outputs: [out] };
      }
      if (
        s === "Error" ||
        s === "Failed" ||
        s === "Content Moderated" ||
        s === "Request Moderated"
      ) {
        throw new ProviderError(`flux job ended in state '${s}': ${status.error ?? ""}`, {
          vendorId: this.id,
        });
      }
      // Pending / Processing / Queued / etc. — continue polling.
      interval = Math.min(Math.round(interval * POLL_BACKOFF), POLL_MAX_MS);
    }
  }

  /**
   * BFL has no listing endpoint, so we probe `GET {baseUrl}/v1/get_result?id=<fake>`:
   * - With a valid key, BFL returns 404 ("task not found").
   * - With an invalid key, BFL returns 401 (auth rejected).
   * Anything else surfaces as a generic failure with the upstream status.
   */
  async test(signal?: AbortSignal): Promise<ProviderTestResult> {
    const started = Date.now();
    // Use a syntactically-plausible-but-impossible task id so the only way
    // we get a 200 back is if the API changes shape under us.
    const fakeId = "imagent-probe-0000-0000-0000-000000000000";
    const url = `${this.baseUrl}/v1/get_result?id=${encodeURIComponent(fakeId)}`;
    try {
      const opts: { signal?: AbortSignal } = {};
      if (signal) opts.signal = signal;
      // Hitting an unknown id should never succeed — but if it ever did, we
      // accept that as "auth ok".
      await this.http.get(url, opts);
      const latencyMs = Date.now() - started;
      return { ok: true, latencyMs };
    } catch (err) {
      // Map 404 → ok (auth fine, task missing as expected).
      if (err instanceof ProviderHttpError && err.status === 404) {
        const latencyMs = Date.now() - started;
        return { ok: true, latencyMs };
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
    if (req.seed !== undefined) out.seed = req.seed;
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

async function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const handle = setTimeout(() => {
      if (signal) signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(handle);
      reject(new ProviderAbortError("flux-bfl", signal?.reason));
    };
    if (signal) {
      if (signal.aborted) {
        clearTimeout(handle);
        reject(new ProviderAbortError("flux-bfl", signal.reason));
        return;
      }
      signal.addEventListener("abort", onAbort, { once: true });
    }
  });
}

// Re-export so tests don't need an extra import.
export { isAbortError };
