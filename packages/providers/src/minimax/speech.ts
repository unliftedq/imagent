import {
  type SpeechGenerationResult,
  type SpeechModelDef,
  type SpeechRequest,
  combineSpeechFormat,
  type Logger,
  ProviderRequestError,
  ProviderResponseError,
  type ProviderTestResult,
  type VoiceInfo,
} from "@imagent/core";
import { BaseSpeechProvider } from "../common/index.js";
import { createHttpClient, type HttpClient } from "../http/index.js";
import {
  assertMiniMaxOk,
  DEFAULT_MINIMAX_BASE_URL,
  MINIMAX_AUTH_ERROR_CODES,
  type MiniMaxBaseResp,
  probeMiniMaxAuth,
} from "./shared.js";

const T2A_PATH = "/t2a_v2";
const GET_VOICE_PATH = "/get_voice";

export interface MiniMaxSpeechProviderOptions {
  apiKey: string;
  /** Required for T2A v2 — passed as the GroupId query param. */
  groupId: string | undefined;
  baseUrl?: string | null;
  models: ReadonlyMap<string, SpeechModelDef>;
  fetch?: typeof fetch;
  logger?: Logger;
}

interface MiniMaxT2AResponse {
  data?: { audio?: string | null } | null;
  base_resp?: MiniMaxBaseResp | null;
}

interface MiniMaxVoiceEntry {
  voice_id?: string | null;
  voice_name?: string | null;
  description?: string[] | null;
}

interface MiniMaxGetVoiceResponse {
  system_voice?: MiniMaxVoiceEntry[] | null;
  voice_cloning?: MiniMaxVoiceEntry[] | null;
  voice_generation?: MiniMaxVoiceEntry[] | null;
  base_resp?: MiniMaxBaseResp | null;
}

export class MiniMaxSpeechProvider extends BaseSpeechProvider {
  private readonly http: HttpClient;
  private readonly groupId: string;

  constructor(options: MiniMaxSpeechProviderOptions) {
    super({
      providerId: "minimax",
      displayName: "MiniMax",
      models: options.models,
      ...(options.logger !== undefined ? { logger: options.logger } : {}),
    });
    if (!options.groupId) {
      throw new ProviderRequestError(
        "MiniMax speech requires a groupId. Run `imagent config set minimax.groupId <GroupId>`.",
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

  protected async doSynthesize(
    merged: SpeechRequest,
    model: SpeechModelDef,
    signal?: AbortSignal,
  ): Promise<SpeechGenerationResult> {
    const format = combineSpeechFormat(merged.codec ?? "mp3", merged.formatQuality);
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
      throw new ProviderResponseError("MiniMax T2A response contained no speech", {
        vendorId: this.id,
        bodyExcerpt: JSON.stringify(res).slice(0, 512),
      });
    }
    const bytes = new Uint8Array(Buffer.from(hex, "hex"));
    return { output: { bytes, mimeType: mimeForFormat(format), raw: { outputFormat: format } } };
  }

  /**
   * Live voice discovery via MiniMax `POST /v1/get_voice` with
   * `voice_type: "all"` — returns system voices plus any quick-cloned and
   * text-to-voice voices on the account. System voices carry a `voice_name`;
   * cloned/generated voices expose only the `voice_id`.
   */
  override async listVoices(signal?: AbortSignal): Promise<VoiceInfo[]> {
    const opts: { signal?: AbortSignal } = {};
    if (signal) opts.signal = signal;
    const res = await this.http.post<MiniMaxGetVoiceResponse>(
      `${GET_VOICE_PATH}?GroupId=${encodeURIComponent(this.groupId)}`,
      { voice_type: "all" },
      opts,
    );
    assertMiniMaxOk(res.base_resp, this.id);
    const groups: ReadonlyArray<[readonly MiniMaxVoiceEntry[], string]> = [
      [res.system_voice ?? [], "system"],
      [res.voice_cloning ?? [], "cloned"],
      [res.voice_generation ?? [], "generated"],
    ];
    const voices: VoiceInfo[] = [];
    for (const [entries, category] of groups) {
      for (const entry of entries) {
        const id = entry.voice_id;
        if (typeof id !== "string" || id.length === 0) continue;
        const description =
          entry.description?.filter((d) => typeof d === "string" && d.length > 0).join(" ") ?? "";
        voices.push({
          id,
          name: entry.voice_name || id,
          description,
          previewUrl: null,
          category,
        });
      }
    }
    return voices;
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
