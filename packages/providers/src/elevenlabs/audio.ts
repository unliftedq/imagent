import {
  type AudioGenerationResult,
  type AudioModelDef,
  type AudioRequest,
  type Logger,
  ProviderResponseError,
  type ProviderTestResult,
  type VoiceInfo,
} from "@imagent/core";
import { BaseAudioProvider } from "../common/index.js";
import { createHttpClient, type HttpClient } from "../http/index.js";

export const DEFAULT_ELEVENLABS_BASE_URL = "https://api.elevenlabs.io";

export interface ElevenLabsAudioProviderOptions {
  apiKey: string;
  baseUrl?: string | null;
  models: ReadonlyMap<string, AudioModelDef>;
  fetch?: typeof fetch;
  logger?: Logger;
}

interface ElevenVoicesResponse {
  voices?: Array<{
    voice_id?: string;
    name?: string;
    preview_url?: string;
    labels?: Record<string, string>;
  }> | null;
}

export class ElevenLabsAudioProvider extends BaseAudioProvider {
  private readonly http: HttpClient;

  constructor(options: ElevenLabsAudioProviderOptions) {
    super({
      providerId: "elevenlabs",
      displayName: "ElevenLabs",
      models: options.models,
      ...(options.logger !== undefined ? { logger: options.logger } : {}),
    });
    const baseUrl = (options.baseUrl ?? DEFAULT_ELEVENLABS_BASE_URL).replace(/\/+$/, "");
    this.http = createHttpClient({
      vendorId: this.id,
      baseUrl,
      headers: { "xi-api-key": options.apiKey },
      ...(options.fetch !== undefined ? { fetch: options.fetch } : {}),
      ...(options.logger !== undefined ? { logger: options.logger } : {}),
    });
  }

  protected async doGenerate(
    merged: AudioRequest,
    model: AudioModelDef,
    signal?: AbortSignal,
  ): Promise<AudioGenerationResult> {
    const voiceId = merged.voice;
    if (!voiceId) {
      throw new ProviderResponseError("ElevenLabs requires a voice id (set --option voice=<id>)", {
        vendorId: this.id,
      });
    }
    const format = merged.outputFormat ?? "mp3_44100_128";
    const path = `/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${encodeURIComponent(format)}`;
    const voiceSettings = pickVoiceSettings(merged.raw);
    const body: Record<string, unknown> = {
      text: merged.prompt,
      model_id: model.baseModelId ?? model.id,
      ...(voiceSettings ? { voice_settings: voiceSettings } : {}),
    };
    const init: RequestInit = { method: "POST", body: JSON.stringify(body) };
    const opts: { signal?: AbortSignal } = {};
    if (signal) opts.signal = signal;
    const res = await this.http.raw(path, init, opts);
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    if (bytes.byteLength === 0) {
      throw new ProviderResponseError("ElevenLabs returned empty audio", { vendorId: this.id });
    }
    const mimeType = res.headers.get("content-type") ?? mimeForFormat(format);
    return { output: { bytes, mimeType, raw: { outputFormat: format } } };
  }

  async listVoices(signal?: AbortSignal): Promise<VoiceInfo[]> {
    const opts: { signal?: AbortSignal } = {};
    if (signal) opts.signal = signal;
    const res = await this.http.get<ElevenVoicesResponse>("/v1/voices", opts);
    return (res.voices ?? [])
      .filter((v): v is { voice_id: string; name?: string } => typeof v.voice_id === "string")
      .map((v) => ({
        id: v.voice_id,
        name: v.name ?? v.voice_id,
        ...(typeof (v as { preview_url?: string }).preview_url === "string"
          ? { previewUrl: (v as { preview_url?: string }).preview_url }
          : {}),
        ...((v as { labels?: Record<string, string> }).labels
          ? { labels: (v as { labels?: Record<string, string> }).labels }
          : {}),
      }));
  }

  protected async doTest(signal?: AbortSignal): Promise<ProviderTestResult> {
    const started = Date.now();
    const opts: { signal?: AbortSignal } = {};
    if (signal) opts.signal = signal;
    await this.http.get("/v1/voices", opts);
    return { ok: true, latencyMs: Date.now() - started };
  }
}

function pickVoiceSettings(raw: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!raw) return undefined;
  const keys = ["stability", "similarity_boost", "style", "use_speaker_boost"] as const;
  const out: Record<string, unknown> = {};
  for (const k of keys) if (raw[k] !== undefined) out[k] = raw[k];
  return Object.keys(out).length > 0 ? out : undefined;
}

function mimeForFormat(format: string): string {
  if (format.startsWith("mp3")) return "audio/mpeg";
  if (format.startsWith("wav")) return "audio/wav";
  if (format.startsWith("pcm")) return "audio/pcm";
  if (format.startsWith("opus")) return "audio/opus";
  if (format.startsWith("ulaw") || format.startsWith("alaw")) return "audio/basic";
  return "application/octet-stream";
}
