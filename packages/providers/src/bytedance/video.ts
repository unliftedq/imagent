import {
  type Logger,
  ProviderError,
  ProviderResponseError,
  type ProviderTestResult,
  type VideoGenerationResult,
  type VideoJobHandle,
  type VideoJobState,
  type VideoJobStatus,
  type VideoModelDef,
  type VideoOutput,
  type VideoRequest,
} from "@imagent/core";
import {
  aggregateVideoCapabilities,
  BaseVideoProvider,
  coerceMimeType,
  mergeRawOptions,
  runListProbe,
} from "../common/index.js";
import { createHttpClient, type HttpClient } from "../http/index.js";
import { resolveImageUrlInput } from "../reference-images.js";

export interface ByteDanceVideoProviderOptions {
  apiKey: string;
  /**
   * Ark base URL — required, mirrors Azure's `endpoint + apiKey` shape. The
   * regional info (e.g. `cn-beijing` vs `ap-southeast`) is encoded directly
   * in the URL.
   */
  endpoint: string;
  models: ReadonlyMap<string, VideoModelDef>;
  /** Override fetch for ModelArk requests and downloads (tests). */
  fetch?: typeof fetch;
  logger?: Logger;
}

interface ArkTaskCreateResponse {
  id?: string | null;
}

interface ArkTaskStatusResponse {
  id?: string | null;
  model?: string | null;
  status?: string | null;
  content?: Record<string, unknown> | null;
  usage?: Record<string, unknown> | null;
  error?: { message?: string | null; code?: string | null } | null;
  message?: string | null;
  [key: string]: unknown;
}

interface ByteDanceContentPart {
  type: string;
  text?: string;
  image_url?: { url: string };
  role?: string;
}

const TASKS_PATH = "/contents/generations/tasks";

/**
 * ByteDance video provider — backed directly by ModelArk's Seedance HTTP task
 * API. Submit creates a `/contents/generations/tasks` job, poll reads that
 * task, fetch downloads the returned `content.video_url`, and cancel attempts
 * a server-side task DELETE.
 */
export class ByteDanceVideoProvider extends BaseVideoProvider {
  private readonly http: HttpClient;
  private readonly baseUrl: string;

  constructor(options: ByteDanceVideoProviderOptions) {
    super({
      providerId: "bytedance",
      displayName: "ByteDance",
      models: options.models,
      ...(options.logger !== undefined ? { logger: options.logger } : {}),
    });
    this.baseUrl = options.endpoint.replace(/\/+$/, "");
    this.http = createHttpClient({
      vendorId: this.id,
      baseUrl: this.baseUrl,
      headers: { Authorization: `Bearer ${options.apiKey}` },
      ...(options.fetch !== undefined ? { fetch: options.fetch } : {}),
      ...(options.logger !== undefined ? { logger: options.logger } : {}),
    });
  }

  protected async doSubmit(
    merged: VideoRequest,
    modelDef: VideoModelDef,
  ): Promise<VideoJobHandle> {
    const body = await buildCreateTaskBody(merged, modelDef);
    const res = await this.http.post<ArkTaskCreateResponse>(TASKS_PATH, body);
    const taskId = res?.id;
    if (!taskId) {
      throw new ProviderResponseError("ModelArk task creation response missing id", {
        vendorId: this.id,
        bodyExcerpt: JSON.stringify(res).slice(0, 512),
      });
    }

    return {
      providerId: this.id,
      providerJobId: taskId,
      pollingUrl: taskPath(taskId),
      meta: merged.durationSec !== undefined ? { durationSec: merged.durationSec } : {},
    };
  }

  async poll(handle: VideoJobHandle): Promise<VideoJobStatus> {
    const status = await this.fetchTask(handle);
    return statusToJobStatus(status);
  }

  async fetch(handle: VideoJobHandle): Promise<VideoGenerationResult> {
    const status = await this.fetchTask(handle);
    const jobStatus = statusToJobStatus(status);
    if (jobStatus.state !== "succeeded") {
      const suffix = jobStatus.errorMessage ? `: ${jobStatus.errorMessage}` : "";
      throw new ProviderError(
        `fetch() called on non-succeeded job (state=${jobStatus.state})${suffix}`,
        {
          vendorId: this.id,
        },
      );
    }

    const videoUrl = pickVideoUrl(status);
    if (!videoUrl) {
      throw new ProviderResponseError("ModelArk succeeded task missing content.video_url", {
        vendorId: this.id,
        bodyExcerpt: JSON.stringify(status).slice(0, 512),
      });
    }

    const dl = await this.http.getBytes(videoUrl);
    const out: VideoOutput = {
      bytes: dl.bytes,
      mimeType: coerceMimeType(dl.mimeType, "video/", "video/mp4"),
      raw: {
        taskId: status.id ?? handle.providerJobId,
        ...(status.model ? { model: status.model } : {}),
        ...(status.usage ? { usage: status.usage } : {}),
      },
    };
    const durationSec = metaNumber(handle.meta, "durationSec");
    if (durationSec !== undefined) {
      out.durationMs = Math.round(durationSec * 1000);
    }
    return { output: out };
  }

  async cancel(handle: VideoJobHandle): Promise<void> {
    await this.http.del(taskPath(handle.providerJobId));
  }

  /** Auth probe via ModelArk's OpenAI-compatible model listing endpoint. */
  protected async doTest(signal?: AbortSignal): Promise<ProviderTestResult> {
    const probeSignal = signal ?? AbortSignal.timeout(8000);
    return runListProbe({
      listIds: async (s) => {
        const opts: { signal?: AbortSignal } = {};
        if (s) opts.signal = s;
        const res = await this.http.get<{ data?: Array<{ id?: string }> }>("/models", opts);
        return (res?.data ?? [])
          .map((m) => m?.id)
          .filter((v): v is string => typeof v === "string");
      },
      configuredIds: [...this.models.keys()],
      signal: probeSignal,
    });
  }

  private async fetchTask(handle: VideoJobHandle): Promise<ArkTaskStatusResponse> {
    const path =
      typeof handle.pollingUrl === "string" ? handle.pollingUrl : taskPath(handle.providerJobId);
    return this.http.get<ArkTaskStatusResponse>(path);
  }
}

async function buildCreateTaskBody(
  req: VideoRequest,
  model: VideoModelDef,
): Promise<Record<string, unknown>> {
  const body: Record<string, unknown> = {
    model: model.id,
    content: await buildContent(req),
  };
  if (req.aspectRatio) body.ratio = req.aspectRatio;
  if (req.durationSec !== undefined) body.duration = req.durationSec;
  if (req.fps !== undefined) body.fps = req.fps;
  if (req.resolution) body.resolution = req.resolution;
  mergeRawOptions(body, req.raw);
  return body;
}

async function buildContent(req: VideoRequest): Promise<ByteDanceContentPart[]> {
  const content: ByteDanceContentPart[] = [{ type: "text", text: req.prompt }];
  if (req.firstFrame) {
    content.push({
      type: "image_url",
      image_url: { url: await resolveImageUrlInput(req.firstFrame, "bytedance") },
      role: "first_frame",
    });
  }
  if (req.lastFrame) {
    content.push({
      type: "image_url",
      image_url: { url: await resolveImageUrlInput(req.lastFrame, "bytedance") },
      role: "last_frame",
    });
  }
  for (const ref of req.references) {
    content.push({
      type: "image_url",
      image_url: { url: await resolveImageUrlInput(ref.path, "bytedance") },
      role: "reference_image",
    });
  }
  return content;
}

function taskPath(taskId: string): string {
  return `${TASKS_PATH}/${encodeURIComponent(taskId)}`;
}

function statusToJobStatus(res: ArkTaskStatusResponse): VideoJobStatus {
  const status = String(res.status ?? "").toLowerCase();
  const errorMessage = pickErrorMessage(res);
  if (["succeeded", "success", "completed", "complete", "done"].includes(status)) {
    return { state: "succeeded" };
  }
  if (["failed", "error"].includes(status)) {
    const out: VideoJobStatus = { state: "failed" };
    if (errorMessage) out.errorMessage = errorMessage;
    return out;
  }
  if (["cancelled", "canceled"].includes(status)) {
    const out: VideoJobStatus = { state: "cancelled" };
    if (errorMessage) out.errorMessage = errorMessage;
    return out;
  }
  if (["queued", "pending", "created"].includes(status)) {
    return { state: "queued" };
  }
  if (["running", "processing", "in_progress", "generating", ""].includes(status)) {
    return { state: "running" };
  }
  const out: VideoJobStatus = { state: status as VideoJobState };
  if (!isKnownState(out.state)) return { state: "running" };
  if (errorMessage) out.errorMessage = errorMessage;
  return out;
}

function isKnownState(value: string): value is VideoJobState {
  return (
    value === "queued" ||
    value === "running" ||
    value === "succeeded" ||
    value === "failed" ||
    value === "cancelled"
  );
}

function pickErrorMessage(res: ArkTaskStatusResponse): string | undefined {
  if (typeof res.error?.message === "string" && res.error.message) return res.error.message;
  if (typeof res.message === "string" && res.message) return res.message;
  return undefined;
}

function pickVideoUrl(res: ArkTaskStatusResponse): string | undefined {
  const candidates: unknown[] = [
    res.content?.video_url,
    res.content?.videoUrl,
    (res.output as Record<string, unknown> | undefined)?.video_url,
    (res.output as Record<string, unknown> | undefined)?.videoUrl,
    (res.result as Record<string, unknown> | undefined)?.video_url,
    (res.result as Record<string, unknown> | undefined)?.videoUrl,
    (res.data as Record<string, unknown> | undefined)?.video_url,
    (res.data as Record<string, unknown> | undefined)?.videoUrl,
  ];
  const choices = res.choices;
  if (Array.isArray(choices)) {
    const first = choices[0] as { message?: { content?: unknown } } | undefined;
    const content = first?.message?.content;
    if (content && typeof content === "object") {
      candidates.push(
        (content as Record<string, unknown>).video_url,
        (content as Record<string, unknown>).videoUrl,
      );
    }
  }
  return candidates.find((v): v is string => typeof v === "string" && v.length > 0);
}

function metaNumber(meta: VideoJobHandle["meta"], key: string): number | undefined {
  const value = meta?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

// Re-export so vendors that previously cross-imported from here continue to
// resolve `aggregateVideoCapabilities` without churn. Canonical home is
// `../common/capabilities.js`.
export { aggregateVideoCapabilities };
