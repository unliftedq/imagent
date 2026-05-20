import {
  applyVideoDefaults,
  type Logger,
  ProviderError,
  ProviderRequestError,
  ProviderResponseError,
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
} from "@imagent/core";
import { createHttpClient, type HttpClient } from "../http/index.js";
import { testFailureFromError } from "../openai/image.js";

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

const RESOLUTION_MAP: Record<string, string> = {
  "864x496": "480p",
  "496x864": "480p",
  "752x560": "480p",
  "560x752": "480p",
  "640x640": "480p",
  "992x432": "480p",
  "432x992": "480p",
  "864x480": "480p",
  "480x864": "480p",
  "736x544": "480p",
  "544x736": "480p",
  "960x416": "480p",
  "416x960": "480p",
  "832x480": "480p",
  "480x832": "480p",
  "624x624": "480p",
  "1280x720": "720p",
  "720x1280": "720p",
  "1112x834": "720p",
  "834x1112": "720p",
  "960x960": "720p",
  "1470x630": "720p",
  "630x1470": "720p",
  "1248x704": "720p",
  "704x1248": "720p",
  "1120x832": "720p",
  "832x1120": "720p",
  "1504x640": "720p",
  "640x1504": "720p",
  "1920x1080": "1080p",
  "1080x1920": "1080p",
  "1664x1248": "1080p",
  "1248x1664": "1080p",
  "1440x1440": "1080p",
  "2206x946": "1080p",
  "946x2206": "1080p",
  "1920x1088": "1080p",
  "1088x1920": "1080p",
  "2176x928": "1080p",
  "928x2176": "1080p",
};

/**
 * ByteDance video provider — backed directly by ModelArk's Seedance HTTP task
 * API. Submit creates a `/contents/generations/tasks` job, poll reads that
 * task, fetch downloads the returned `content.video_url`, and cancel attempts
 * a server-side task DELETE.
 */
export class ByteDanceVideoProvider implements VideoProvider {
  readonly id = "bytedance";
  readonly displayName = "ByteDance";
  readonly models: ReadonlyMap<string, VideoModelDef>;
  readonly capabilities: VideoCapabilities;
  private readonly http: HttpClient;
  private readonly baseUrl: string;
  private readonly logger?: Logger;

  constructor(options: ByteDanceVideoProviderOptions) {
    this.models = options.models;
    this.capabilities = aggregateVideoCapabilities(options.models);
    if (options.logger) this.logger = options.logger;
    this.baseUrl = options.endpoint.replace(/\/+$/, "");
    this.http = createHttpClient({
      vendorId: this.id,
      baseUrl: this.baseUrl,
      headers: { Authorization: `Bearer ${options.apiKey}` },
      ...(options.fetch !== undefined ? { fetch: options.fetch } : {}),
      ...(options.logger !== undefined ? { logger: options.logger } : {}),
    });
  }

  async submit(req: VideoRequest): Promise<VideoJobHandle> {
    const modelDef = this.models.get(req.model);
    if (!modelDef) {
      throw new ProviderRequestError(`unknown video model '${req.model}' for bytedance`, {
        vendorId: this.id,
      });
    }
    const merged = applyVideoDefaults(req, modelDef);
    validateVideoRequestAgainstModel(this.id, merged, modelDef);

    const body = buildCreateTaskBody(merged, modelDef);
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
      mimeType: dl.mimeType.startsWith("video/") ? dl.mimeType : "video/mp4",
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
  async test(signal?: AbortSignal): Promise<ProviderTestResult> {
    const started = Date.now();
    const probeSignal = signal ?? AbortSignal.timeout(8000);
    try {
      const res = await this.http.get<{ data?: Array<{ id?: string }> }>("/models", {
        signal: probeSignal,
      });
      const latencyMs = Date.now() - started;
      const ids = (res?.data ?? [])
        .map((m) => m?.id)
        .filter((s): s is string => typeof s === "string");
      const configured = [...this.models.keys()];
      const matched = configured.find((id) => ids.includes(id));
      const out: ProviderTestResult = matched
        ? { ok: true, latencyMs, sampleModelId: matched }
        : { ok: true, latencyMs };
      return out;
    } catch (err) {
      this.logger?.debug?.("bytedance video test() failed", { err: String(err) });
      return testFailureFromError(err);
    }
  }

  private async fetchTask(handle: VideoJobHandle): Promise<ArkTaskStatusResponse> {
    const path =
      typeof handle.pollingUrl === "string" ? handle.pollingUrl : taskPath(handle.providerJobId);
    return this.http.get<ArkTaskStatusResponse>(path);
  }
}

function buildCreateTaskBody(req: VideoRequest, model: VideoModelDef): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: model.id,
    content: buildContent(req),
  };
  if (req.aspectRatio) body.ratio = req.aspectRatio;
  if (req.durationSec !== undefined) body.duration = req.durationSec;
  if (req.fps !== undefined) body.fps = req.fps;
  if (req.resolution) body.resolution = normalizeResolution(req.resolution);
  mergeRawOptions(body, req.raw);
  return body;
}

function buildContent(req: VideoRequest): ByteDanceContentPart[] {
  const content: ByteDanceContentPart[] = [{ type: "text", text: req.prompt }];
  if (req.firstFrame) {
    content.push({ type: "image_url", image_url: { url: req.firstFrame }, role: "first_frame" });
  }
  if (req.lastFrame) {
    content.push({ type: "image_url", image_url: { url: req.lastFrame }, role: "last_frame" });
  }
  for (const ref of req.references) {
    content.push({ type: "image_url", image_url: { url: ref.path }, role: "reference_image" });
  }
  return content;
}

function mergeRawOptions(body: Record<string, unknown>, raw: VideoRequest["raw"]): void {
  if (!raw || typeof raw !== "object") return;
  const rawObj = raw as { parameters?: Record<string, unknown> } & Record<string, unknown>;
  if (rawObj.parameters && typeof rawObj.parameters === "object") {
    Object.assign(body, rawObj.parameters);
  }
  for (const [key, value] of Object.entries(rawObj)) {
    if (key !== "parameters") body[key] = value;
  }
}

function normalizeResolution(value: string): string {
  return RESOLUTION_MAP[value] ?? value;
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

export function aggregateVideoCapabilities(
  models: ReadonlyMap<string, VideoModelDef>,
): VideoCapabilities {
  const durationsSec = new Set<number>();
  const fpsOptions = new Set<number>();
  const resolutions = new Set<string>();
  const aspectRatios = new Set<string>();
  let maxDurationSec = 0;
  let maxReferences: number | undefined;
  let maxReferenceSizeMb: number | undefined;
  let supportsFirstFrame = false;
  let supportsLastFrame = false;
  let supportsRefImages = false;
  for (const m of models.values()) {
    const c = m.capabilities;
    if (!c) continue;
    for (const d of c.durationsSec ?? []) durationsSec.add(d);
    for (const f of c.fpsOptions ?? []) fpsOptions.add(f);
    for (const r of c.resolutions ?? []) resolutions.add(r);
    for (const a of c.aspectRatios ?? []) aspectRatios.add(a);
    if (c.maxDurationSec !== undefined) maxDurationSec = Math.max(maxDurationSec, c.maxDurationSec);
    if (c.maxReferences !== undefined)
      maxReferences = Math.max(maxReferences ?? 0, c.maxReferences);
    if (c.maxReferenceSizeMb !== undefined) {
      maxReferenceSizeMb = Math.max(maxReferenceSizeMb ?? 0, c.maxReferenceSizeMb);
    }
    supportsFirstFrame ||= c.supportsFirstFrame;
    supportsLastFrame ||= c.supportsLastFrame;
    supportsRefImages ||= c.supportsRefImages;
  }
  return {
    durationsSec: [...durationsSec].sort((a, b) => a - b),
    maxDurationSec,
    fpsOptions: [...fpsOptions].sort((a, b) => a - b),
    resolutions: [...resolutions],
    ...(aspectRatios.size > 0 ? { aspectRatios: [...aspectRatios] } : {}),
    ...(maxReferences !== undefined ? { maxReferences } : {}),
    ...(maxReferenceSizeMb !== undefined ? { maxReferenceSizeMb } : {}),
    supportsFirstFrame,
    supportsLastFrame,
    supportsRefImages,
  };
}
