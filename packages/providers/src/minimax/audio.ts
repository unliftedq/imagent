import {
  type AudioGenerationResult,
  type AudioModelDef,
  type AudioRequest,
  type Logger,
  ProviderRequestError,
  ProviderResponseError,
  type ProviderTestResult,
} from "@imagent/core";
import { BaseAudioProvider } from "../common/index.js";
import { createHttpClient, type HttpClient } from "../http/index.js";
import {
  assertMiniMaxOk,
  DEFAULT_MINIMAX_BASE_URL,
  MINIMAX_AUTH_ERROR_CODES,
  type MiniMaxBaseResp,
  probeMiniMaxAuth,
} from "./shared.js";

const T2A_PATH = "/t2a_v2";

export interface MiniMaxAudioProviderOptions {
  apiKey: string;
  /** Required for T2A v2 — passed as the GroupId query param. */
  groupId: string | undefined;
  baseUrl?: string | null;
  models: ReadonlyMap<string, AudioModelDef>;
  fetch?: typeof fetch;
  logger?: Logger;
}

interface MiniMaxT2AResponse {
  data?: { audio?: string | null } | null;
  base_resp?: MiniMaxBaseResp | null;
}

export class MiniMaxAudioProvider extends BaseAudioProvider {
  private readonly http: HttpClient;
  private readonly groupId: string;

  constructor(options: MiniMaxAudioProviderOptions) {
    super({
      providerId: "minimax",
      displayName: "MiniMax",
      models: options.models,
      ...(options.logger !== undefined ? { logger: options.logger } : {}),
    });
    if (!options.groupId) {
      throw new ProviderRequestError(
        "MiniMax audio requires a groupId. Run `imagent config set minimax.groupId <GroupId>`.",
        { vendorId: "minimax" },
      );
    }
    this.groupId = options.groupId;
    const baseUrl = (options.baseUrl ?? DEFAULT_MINIMAX_BASE_URL).replace(/\/+$/, "");
    this.http = createHttpClient({
      vendorId: this.id,
      baseUrl,
      headers: { Authorization: `Bearer ${options.apiKey}` },
      ...(options.fetch !== undefined ? { fetch: options.fetch } : {}),
      ...(options.logger !== undefined ? { logger: options.logger } : {}),
    });
  }

  protected async doGenerate(
    merged: AudioRequest,
    model: AudioModelDef,
    signal?: AbortSignal,
  ): Promise<AudioGenerationResult> {
    const format = merged.outputFormat ?? "mp3";
    const voiceSetting: Record<string, unknown> = {};
    if (merged.voice) voiceSetting.voice_id = merged.voice;
    if (merged.speed !== undefined) voiceSetting.speed = merged.speed;
    if (merged.raw?.vol !== undefined) voiceSetting.vol = merged.raw.vol;
    if (merged.raw?.pitch !== undefined) voiceSetting.pitch = merged.raw.pitch;
    if (merged.raw?.emotion !== undefined) voiceSetting.emotion = merged.raw.emotion;

    const body: Record<string, unknown> = {
      model: model.id,
      text: merged.prompt,
      stream: false,
      voice_setting: voiceSetting,
      audio_setting: { format },
    };
    const opts: { signal?: AbortSignal } = {};
    if (signal) opts.signal = signal;
    const res = await this.http.post<MiniMaxT2AResponse>(
      `${T2A_PATH}?GroupId=${encodeURIComponent(this.groupId)}`,
      body,
      opts,
    );
    assertMiniMaxOk(res.base_resp, this.id);
    const hex = res.data?.audio;
    if (typeof hex !== "string" || hex.length === 0) {
      throw new ProviderResponseError("MiniMax T2A response contained no audio", {
        vendorId: this.id,
        bodyExcerpt: JSON.stringify(res).slice(0, 512),
      });
    }
    const bytes = new Uint8Array(Buffer.from(hex, "hex"));
    return { output: { bytes, mimeType: mimeForFormat(format), raw: { outputFormat: format } } };
  }

  protected async doTest(signal?: AbortSignal): Promise<ProviderTestResult> {
    const started = Date.now();
    const code = await probeMiniMaxAuth(this.http, signal);
    if (code !== undefined && MINIMAX_AUTH_ERROR_CODES.has(code)) {
      return { ok: false, reason: `MiniMax authentication failed (status_code ${code})` };
    }
    return { ok: true, latencyMs: Date.now() - started };
  }
}

function mimeForFormat(format: string): string {
  switch (format) {
    case "mp3":
      return "audio/mpeg";
    case "wav":
      return "audio/wav";
    case "pcm":
      return "audio/pcm";
    case "flac":
      return "audio/flac";
    default:
      return "application/octet-stream";
  }
}
