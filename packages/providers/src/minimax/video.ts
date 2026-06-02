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
  BaseVideoProvider,
  coerceMimeType,
  mergeRawOptions,
  testFailureFromError,
} from "../common/index.js";
import { createHttpClient, type HttpClient } from "../http/index.js";
import { resolveImageUrlInput } from "../reference-images.js";
import {
  assertMiniMaxOk,
  DEFAULT_MINIMAX_BASE_URL,
  type MiniMaxBaseResp,
  MINIMAX_AUTH_ERROR_CODES,
  probeMiniMaxAuth,
} from "./shared.js";

const SUBMIT_PATH = "/video_generation";
const QUERY_PATH = "/query/video_generation";
const FILE_RETRIEVE_PATH = "/files/retrieve";

export interface MiniMaxVideoProviderOptions {
  apiKey: string;
  baseUrl?: string | null;
  models: ReadonlyMap<string, VideoModelDef>;
  /** Override fetch for MiniMax requests and downloads (tests). */
  fetch?: typeof fetch;
  logger?: Logger;
}

interface MiniMaxSubmitResponse {
  task_id?: string | null;
  base_resp?: MiniMaxBaseResp | null;
}

interface MiniMaxQueryResponse {
  task_id?: string | null;
  status?: string | null;
  file_id?: string | null;
  base_resp?: MiniMaxBaseResp | null;
}

interface MiniMaxFileResponse {
  file?: { file_id?: number | string | null; download_url?: string | null } | null;
  base_resp?: MiniMaxBaseResp | null;
}

/**
 * MiniMax video provider — backed by MiniMax's async Hailuo video API
 * (`MiniMax-Hailuo-2.3`). The flow is three calls:
 *   - `submit` → `POST /v1/video_generation` returns a `task_id`
 *   - `poll`   → `GET /v1/query/video_generation?task_id=...` returns a status
 *     and, on success, a `file_id`
 *   - `fetch`  → `GET /v1/files/retrieve?file_id=...` returns a `download_url`
 *     we stream the bytes from
 *
 * MiniMax exposes no task-cancel endpoint, so `cancel` is a best-effort no-op.
 */
export class MiniMaxVideoProvider extends BaseVideoProvider {
  private readonly http: HttpClient;
  private readonly baseUrl: string;

  constructor(options: MiniMaxVideoProviderOptions) {
    super({
      providerId: "minimax",
      displayName: "MiniMax",
      models: options.models,
      ...(options.logger !== undefined ? { logger: options.logger } : {}),
    });
    this.baseUrl = (options.baseUrl ?? DEFAULT_MINIMAX_BASE_URL).replace(/\/+$/, "");
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
    const body = await buildSubmitBody(merged, modelDef, this.id);
    const res = await this.http.post<MiniMaxSubmitResponse>(SUBMIT_PATH, body);
    assertMiniMaxOk(res.base_resp, this.id);
    const taskId = res?.task_id;
    if (!taskId) {
      throw new ProviderResponseError("MiniMax video submission missing task_id", {
        vendorId: this.id,
        bodyExcerpt: JSON.stringify(res).slice(0, 512),
      });
    }
    return {
      providerId: this.id,
      providerJobId: taskId,
      meta: merged.durationSec !== undefined ? { durationSec: merged.durationSec } : {},
    };
  }

  async poll(handle: VideoJobHandle): Promise<VideoJobStatus> {
    const res = await this.query(handle.providerJobId);
    return statusToJobStatus(res);
  }

  async fetch(handle: VideoJobHandle): Promise<VideoGenerationResult> {
    const res = await this.query(handle.providerJobId);
    const jobStatus = statusToJobStatus(res);
    if (jobStatus.state !== "succeeded") {
      const suffix = jobStatus.errorMessage ? `: ${jobStatus.errorMessage}` : "";
      throw new ProviderError(
        `fetch() called on non-succeeded job (state=${jobStatus.state})${suffix}`,
        { vendorId: this.id },
      );
    }
    const fileId = res.file_id;
    if (!fileId) {
      throw new ProviderResponseError("MiniMax succeeded task missing file_id", {
        vendorId: this.id,
        bodyExcerpt: JSON.stringify(res).slice(0, 512),
      });
    }

    const file = await this.http.get<MiniMaxFileResponse>(
      `${FILE_RETRIEVE_PATH}?file_id=${encodeURIComponent(fileId)}`,
    );
    assertMiniMaxOk(file.base_resp, this.id);
    const downloadUrl = file.file?.download_url;
    if (!downloadUrl) {
      throw new ProviderResponseError("MiniMax file retrieve missing download_url", {
        vendorId: this.id,
        bodyExcerpt: JSON.stringify(file).slice(0, 512),
      });
    }

    const dl = await this.http.getBytes(downloadUrl);
    const out: VideoOutput = {
      bytes: dl.bytes,
      mimeType: coerceMimeType(dl.mimeType, "video/", "video/mp4"),
      raw: {
        taskId: handle.providerJobId,
        fileId: String(fileId),
      },
    };
    const durationSec = metaNumber(handle.meta, "durationSec");
    if (durationSec !== undefined) {
      out.durationMs = Math.round(durationSec * 1000);
    }
    return { output: out };
  }

  /** MiniMax has no server-side cancel endpoint; best-effort no-op. */
  async cancel(_handle: VideoJobHandle): Promise<void> {
    return;
  }

  protected async doTest(signal?: AbortSignal): Promise<ProviderTestResult> {
    const started = Date.now();
    try {
      const code = await probeMiniMaxAuth(this.http, signal);
      if (code !== undefined && MINIMAX_AUTH_ERROR_CODES.has(code)) {
        return { ok: false, reason: `MiniMax authentication failed (status_code ${code})` };
      }
      return { ok: true, latencyMs: Date.now() - started };
    } catch (err) {
      return testFailureFromError(err);
    }
  }

  private async query(taskId: string): Promise<MiniMaxQueryResponse> {
    const res = await this.http.get<MiniMaxQueryResponse>(
      `${QUERY_PATH}?task_id=${encodeURIComponent(taskId)}`,
    );
    assertMiniMaxOk(res.base_resp, this.id);
    return res;
  }
}

async function buildSubmitBody(
  req: VideoRequest,
  model: VideoModelDef,
  vendorId: string,
): Promise<Record<string, unknown>> {
  const body: Record<string, unknown> = {
    model: model.id,
    prompt: req.prompt,
  };
  if (req.durationSec !== undefined) body.duration = req.durationSec;
  if (req.resolution) body.resolution = req.resolution;
  if (req.firstFrame) {
    body.first_frame_image = await resolveImageUrlInput(req.firstFrame, vendorId);
  }
  mergeRawOptions(body, req.raw);
  return body;
}

/**
 * Map MiniMax's `status` enum (`Queueing | Preparing | Processing | Success |
 * Fail`) onto our internal {@link VideoJobState}.
 */
function statusToJobStatus(res: MiniMaxQueryResponse): VideoJobStatus {
  const status = String(res.status ?? "").toLowerCase();
  if (status === "success") return { state: "succeeded" };
  if (status === "fail") {
    const out: VideoJobStatus = { state: "failed" };
    const message = res.base_resp?.status_msg;
    if (message) out.errorMessage = message;
    return out;
  }
  if (status === "queueing" || status === "preparing") return { state: "queued" };
  if (status === "processing" || status === "") return { state: "running" };
  const out: VideoJobStatus = { state: status as VideoJobState };
  if (!isKnownState(out.state)) return { state: "running" };
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

function metaNumber(meta: VideoJobHandle["meta"], key: string): number | undefined {
  const value = meta?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
