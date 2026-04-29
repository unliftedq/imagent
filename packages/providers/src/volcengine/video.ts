import {
  ProviderError,
  ProviderHttpError,
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
} from "@imagine-studio/core";
import { z } from "zod";
import { createHttpClient, type HttpClient } from "../http/index.js";
import { testFailureFromError } from "../openai/image.js";

const DEFAULT_SEEDANCE_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";

export interface SeedanceVideoProviderOptions {
  apiKey: string;
  baseUrl?: string;
  region?: string;
  models: ReadonlyMap<string, VideoModelDef>;
  fetch?: typeof fetch;
  logger?: Logger;
}

// TODO(verify endpoint shape) — confirmed convention from Volcengine Ark
// `contents/generations/tasks` flow: submit, poll, fetch on success. Status
// values mapped to our VideoJobState below.
const SeedanceSubmitResponseSchema = z.object({
  id: z.string(),
});

const SeedanceTaskResponseSchema = z.object({
  id: z.string().optional(),
  status: z.string(),
  // Different revisions return progress in different shapes; accept both.
  progress: z.number().optional(),
  error: z
    .object({
      code: z.string().optional(),
      message: z.string().optional(),
    })
    .optional(),
  content: z
    .object({
      video_url: z.string().optional(),
      duration_ms: z.number().optional(),
      width: z.number().optional(),
      height: z.number().optional(),
    })
    .optional(),
});

export class SeedanceVideoProvider implements VideoProvider {
  readonly id = "seedance";
  readonly displayName = "Seedance (Volcengine)";
  readonly models: ReadonlyMap<string, VideoModelDef>;
  readonly capabilities: VideoCapabilities;
  private readonly http: HttpClient;
  private readonly baseUrl: string;

  constructor(options: SeedanceVideoProviderOptions) {
    this.models = options.models;
    this.capabilities = aggregateVideoCapabilities(options.models);
    this.baseUrl = (options.baseUrl ?? DEFAULT_SEEDANCE_BASE_URL).replace(/\/+$/, "");
    this.http = createHttpClient({
      vendorId: this.id,
      headers: { Authorization: `Bearer ${options.apiKey}` },
      ...(options.fetch !== undefined ? { fetch: options.fetch } : {}),
      ...(options.logger !== undefined ? { logger: options.logger } : {}),
    });
  }

  async submit(req: VideoRequest): Promise<VideoJobHandle> {
    const model = this.models.get(req.model);
    if (!model) {
      throw new ProviderRequestError(`unknown video model '${req.model}' for seedance`, {
        vendorId: this.id,
      });
    }
    const merged = applyVideoDefaults(req, model);
    validateVideoRequestAgainstModel(this.id, merged, model);

    const content: Array<Record<string, unknown>> = [{ type: "text", text: merged.prompt }];
    if (merged.firstFrame) content.push({ type: "image", role: "first_frame", url: merged.firstFrame });
    if (merged.lastFrame) content.push({ type: "image", role: "last_frame", url: merged.lastFrame });
    for (const ref of merged.references) {
      content.push({ type: "image", role: ref.role, url: ref.path });
    }

    const parameters: Record<string, unknown> = {};
    if (merged.durationSec !== undefined) parameters.duration = merged.durationSec;
    if (merged.fps !== undefined) parameters.fps = merged.fps;
    if (merged.resolution) parameters.resolution = merged.resolution;
    if (merged.aspectRatio) parameters.aspect_ratio = merged.aspectRatio;

    const body = {
      model: model.id,
      content,
      parameters,
      ...(merged.raw ?? {}),
    };

    const url = `${this.baseUrl}/contents/generations/tasks`;
    const response = await this.http.post<z.infer<typeof SeedanceSubmitResponseSchema>>(url, body, {
      schema: SeedanceSubmitResponseSchema,
    });

    return { providerId: this.id, providerJobId: response.id };
  }

  async poll(handle: VideoJobHandle): Promise<VideoJobStatus> {
    const url = `${this.baseUrl}/contents/generations/tasks/${encodeURIComponent(handle.providerJobId)}`;
    const response = await this.http.get<z.infer<typeof SeedanceTaskResponseSchema>>(url, {
      schema: SeedanceTaskResponseSchema,
    });
    const state = mapStatus(response.status);
    const out: VideoJobStatus = { state };
    if (response.progress !== undefined) {
      out.progress = clamp01(response.progress);
    }
    if (response.error?.message) {
      out.errorMessage = response.error.message;
    }
    return out;
  }

  async fetch(handle: VideoJobHandle): Promise<VideoGenerationResult> {
    const url = `${this.baseUrl}/contents/generations/tasks/${encodeURIComponent(handle.providerJobId)}`;
    const response = await this.http.get<z.infer<typeof SeedanceTaskResponseSchema>>(url, {
      schema: SeedanceTaskResponseSchema,
    });
    if (mapStatus(response.status) !== "succeeded") {
      throw new ProviderError(`fetch() called on non-succeeded task (status=${response.status})`, {
        vendorId: this.id,
      });
    }
    const videoUrl = response.content?.video_url;
    if (!videoUrl) {
      throw new ProviderError("succeeded task missing content.video_url", { vendorId: this.id });
    }
    const dl = await this.http.getBytes(videoUrl);
    const out: VideoOutput = {
      bytes: dl.bytes,
      mimeType: dl.mimeType.startsWith("video/") ? dl.mimeType : "video/mp4",
    };
    if (response.content?.duration_ms !== undefined) out.durationMs = response.content.duration_ms;
    if (response.content?.width !== undefined) out.width = response.content.width;
    if (response.content?.height !== undefined) out.height = response.content.height;
    return { output: out };
  }

  /**
   * Seedance shares Ark base URL + API key with Seedream; the OpenAI-compatible
   * `GET /models` listing endpoint serves as the auth probe.
   */
  async test(signal?: AbortSignal): Promise<ProviderTestResult> {
    const started = Date.now();
    const url = `${this.baseUrl}/models`;
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

  async cancel(handle: VideoJobHandle): Promise<void> {
    const url = `${this.baseUrl}/contents/generations/tasks/${encodeURIComponent(handle.providerJobId)}`;
    try {
      await this.http.del(url);
    } catch (err) {
      // If the API doesn't support cancel (e.g. 404 / 405), surface a clear
      // message; the JobRunner is allowed to drop the polling loop regardless.
      if (err instanceof ProviderHttpError && (err.status === 404 || err.status === 405)) {
        throw new ProviderError("not supported by Seedance", { vendorId: this.id, status: err.status });
      }
      throw err;
    }
  }
}

function mapStatus(s: string): VideoJobState {
  switch (s.toLowerCase()) {
    case "queued":
    case "pending":
      return "queued";
    case "running":
    case "in_progress":
    case "processing":
      return "running";
    case "succeeded":
    case "success":
    case "completed":
      return "succeeded";
    case "failed":
    case "error":
      return "failed";
    case "cancelled":
    case "canceled":
      return "cancelled";
    default:
      // Unknown vendor status — treat as running so polling continues.
      return "running";
  }
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n > 1) return Math.min(1, n / 100);
  if (n < 0) return 0;
  return n;
}

export function aggregateVideoCapabilities(
  models: ReadonlyMap<string, VideoModelDef>,
): VideoCapabilities {
  const durationsSec = new Set<number>();
  const fpsOptions = new Set<number>();
  const resolutions = new Set<string>();
  let maxDurationSec = 0;
  let supportsFirstFrame = false;
  let supportsLastFrame = false;
  let supportsRefImages = false;
  for (const m of models.values()) {
    const c = m.capabilities;
    if (!c) continue;
    for (const d of c.durationsSec ?? []) durationsSec.add(d);
    for (const f of c.fpsOptions ?? []) fpsOptions.add(f);
    for (const r of c.resolutions ?? []) resolutions.add(r);
    if (c.maxDurationSec !== undefined) maxDurationSec = Math.max(maxDurationSec, c.maxDurationSec);
    supportsFirstFrame ||= c.supportsFirstFrame;
    supportsLastFrame ||= c.supportsLastFrame;
    supportsRefImages ||= c.supportsRefImages;
  }
  return {
    durationsSec: [...durationsSec].sort((a, b) => a - b),
    maxDurationSec,
    fpsOptions: [...fpsOptions].sort((a, b) => a - b),
    resolutions: [...resolutions],
    supportsFirstFrame,
    supportsLastFrame,
    supportsRefImages,
  };
}
