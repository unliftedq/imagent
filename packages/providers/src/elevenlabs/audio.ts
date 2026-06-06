import { type ElevenLabs, ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import {
  type AudioGenerationResult,
  type AudioModelDef,
  type AudioRequest,
  combineAudioFormat,
  type Logger,
  ProviderResponseError,
  type ProviderTestResult,
  type VoiceInfo,
} from "@imagent/core";
import { BaseAudioProvider } from "../common/index.js";

export const DEFAULT_ELEVENLABS_BASE_URL = "https://api.elevenlabs.io";

export interface ElevenLabsAudioProviderOptions {
  apiKey: string;
  baseUrl?: string | null;
  models: ReadonlyMap<string, AudioModelDef>;
  /** Inject a preconfigured client (used in tests). Defaults to a real SDK client. */
  client?: ElevenLabsClient;
  logger?: Logger;
}

export class ElevenLabsAudioProvider extends BaseAudioProvider {
  private readonly client: ElevenLabsClient;

  constructor(options: ElevenLabsAudioProviderOptions) {
    super({
      providerId: "elevenlabs",
      displayName: "ElevenLabs",
      models: options.models,
      ...(options.logger !== undefined ? { logger: options.logger } : {}),
    });
    const baseUrl = (options.baseUrl ?? DEFAULT_ELEVENLABS_BASE_URL).replace(/\/+$/, "");
    this.client = options.client ?? new ElevenLabsClient({ apiKey: options.apiKey, baseUrl });
  }

  protected async doSynthesize(
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
    const format = combineAudioFormat(merged.codec ?? "mp3", merged.formatQuality ?? "44100_128");
    const voiceSettings = buildVoiceSettings(merged);
    const body: ElevenLabs.BodyTextToSpeechFull = {
      text: merged.prompt,
      modelId: model.baseModelId ?? model.id,
      outputFormat: format as ElevenLabs.TextToSpeechConvertRequestOutputFormat,
      ...(voiceSettings ? { voiceSettings } : {}),
    };
    let stream: ReadableStream<Uint8Array>;
    try {
      stream = await this.client.textToSpeech.convert(
        voiceId,
        body,
        signal ? { abortSignal: signal } : {},
      );
    } catch (err) {
      throw wrapError(err, this.id, "ElevenLabs text-to-speech failed");
    }
    const bytes = await collectStream(stream);
    if (bytes.byteLength === 0) {
      throw new ProviderResponseError("ElevenLabs returned empty audio", { vendorId: this.id });
    }
    return { output: { bytes, mimeType: mimeForFormat(format), raw: { outputFormat: format } } };
  }

  override async listVoices(signal?: AbortSignal): Promise<VoiceInfo[]> {
    let res: ElevenLabs.GetVoicesResponse;
    try {
      res = await this.client.voices.getAll(undefined, signal ? { abortSignal: signal } : {});
    } catch (err) {
      throw wrapError(err, this.id, "ElevenLabs voice discovery failed");
    }
    return (res.voices ?? [])
      .filter((v): v is ElevenLabs.Voice => typeof v.voiceId === "string")
      .map((v) => normalizeVoice(v));
  }

  protected async doTest(signal?: AbortSignal): Promise<ProviderTestResult> {
    const started = Date.now();
    await this.client.voices.getAll(undefined, signal ? { abortSignal: signal } : {});
    return { ok: true, latencyMs: Date.now() - started };
  }
}

/** Maps an ElevenLabs voice payload into the provider-agnostic {@link VoiceInfo}. */
function normalizeVoice(v: ElevenLabs.Voice): VoiceInfo {
  const voice: VoiceInfo = {
    id: v.voiceId,
    name: v.name || v.voiceId,
    description: v.description ?? "",
    previewUrl: v.previewUrl ?? null,
  };
  if (typeof v.category === "string") voice.category = v.category;
  if (v.labels && Object.keys(v.labels).length > 0) voice.labels = v.labels;
  return voice;
}

function buildVoiceSettings(merged: AudioRequest): ElevenLabs.VoiceSettings | undefined {
  const out: ElevenLabs.VoiceSettings = {};
  const raw = merged.raw;
  if (raw) {
    if (typeof raw.stability === "number") out.stability = raw.stability;
    if (typeof raw.similarity_boost === "number") out.similarityBoost = raw.similarity_boost;
    if (typeof raw.style === "number") out.style = raw.style;
    if (typeof raw.use_speaker_boost === "boolean") out.useSpeakerBoost = raw.use_speaker_boost;
  }
  // ElevenLabs exposes playback speed via voice_settings.speed (0.7–1.2). The
  // request carries it as the top-level `speed`, so forward it here.
  if (typeof merged.speed === "number") out.speed = merged.speed;
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Collects a web ReadableStream of bytes into a single Uint8Array. */
async function collectStream(stream: ReadableStream<Uint8Array>): Promise<Uint8Array<ArrayBuffer>> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = stream.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        total += value.byteLength;
      }
    }
  } finally {
    reader.releaseLock();
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

function wrapError(err: unknown, vendorId: string, fallback: string): ProviderResponseError {
  const message = err instanceof Error ? err.message : String(err);
  return new ProviderResponseError(`${fallback}: ${message}`, { vendorId });
}

function mimeForFormat(format: string): string {
  if (format.startsWith("mp3")) return "audio/mpeg";
  if (format.startsWith("wav")) return "audio/wav";
  if (format.startsWith("pcm")) return "audio/pcm";
  if (format.startsWith("opus")) return "audio/opus";
  if (format.startsWith("ulaw") || format.startsWith("alaw")) return "audio/basic";
  return "application/octet-stream";
}
