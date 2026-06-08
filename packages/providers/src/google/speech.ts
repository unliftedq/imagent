import { GoogleGenAI } from "@google/genai";
import {
  type Logger,
  ProviderResponseError,
  type SpeechGenerationResult,
  type SpeechModelDef,
  type SpeechRequest,
  type ProviderTestResult,
} from "@imagent/core";
import { BaseSpeechProvider, decodeBase64, rethrowGenericSdkError } from "../common/index.js";
import { DEFAULT_GOOGLE_BASE_URL, type GoogleGenAIClientLike } from "./image.js";

/**
 * Google Gemini text-to-speech provider — `models.generateContent` with
 * `responseModalities: ["AUDIO"]` and a single-speaker `speechConfig`. The
 * backend always returns 16-bit signed little-endian PCM (mono, 24 kHz) inside
 * `candidates[0].content.parts[*].inlineData.data` (base64). We wrap it in a
 * WAV container so the saved asset is directly playable.
 */
export class GoogleSpeechProvider extends BaseSpeechProvider {
  protected readonly client: GoogleGenAIClientLike;

  constructor(options: {
    apiKey: string;
    baseUrl?: string;
    models: ReadonlyMap<string, SpeechModelDef>;
    client?: GoogleGenAIClientLike;
    logger?: Logger;
  }) {
    super({
      providerId: "google",
      displayName: "Google AI Studio",
      models: options.models,
      ...(options.logger !== undefined ? { logger: options.logger } : {}),
    });
    if (options.client) {
      this.client = options.client;
    } else {
      const opts: { apiKey: string; httpOptions?: { baseUrl?: string } } = {
        apiKey: options.apiKey,
      };
      if (options.baseUrl) opts.httpOptions = { baseUrl: options.baseUrl };
      this.client = new GoogleGenAI(opts) as unknown as GoogleGenAIClientLike;
    }
  }

  protected async doSynthesize(
    merged: SpeechRequest,
    model: SpeechModelDef,
    signal?: AbortSignal,
  ): Promise<SpeechGenerationResult> {
    if (!this.client.models.generateContent) {
      throw new ProviderResponseError("SDK does not expose generateContent", { vendorId: this.id });
    }
    const config: Record<string, unknown> = { responseModalities: ["AUDIO"] };
    if (merged.voice) {
      config.speechConfig = {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: merged.voice } },
      };
    }
    if (signal) config.abortSignal = signal;

    let response: Awaited<
      ReturnType<NonNullable<GoogleGenAIClientLike["models"]["generateContent"]>>
    >;
    try {
      response = await this.client.models.generateContent({
        model: model.baseModelId ?? model.id,
        contents: merged.prompt,
        config,
      });
    } catch (err) {
      rethrowGenericSdkError(err, this.id);
    }

    for (const cand of response.candidates ?? []) {
      for (const part of cand.content?.parts ?? []) {
        const b64 = part.inlineData?.data;
        if (b64) {
          const pcm = decodeBase64(b64);
          const rate = sampleRateFromMime(part.inlineData?.mimeType) ?? 24000;
          const wav = pcmToWav(pcm, rate);
          return {
            output: {
              bytes: wav,
              mimeType: "audio/wav",
              raw: { sampleRate: rate, sourceMimeType: part.inlineData?.mimeType ?? null },
            },
          };
        }
      }
    }
    this.logger?.warn?.("gemini tts response missing inline audio", { response });
    throw new ProviderResponseError("Gemini response carried no audio bytes", {
      vendorId: this.id,
    });
  }

  protected async doTest(_signal?: AbortSignal): Promise<ProviderTestResult> {
    const started = Date.now();
    try {
      if (this.client.models.list) await this.client.models.list();
      return { ok: true, latencyMs: Date.now() - started };
    } catch (err) {
      return { ok: false, reason: err instanceof Error ? err.message : String(err) };
    }
  }
}

/** Parse the `rate=NNNNN` qualifier from a Gemini audio mime (e.g. `audio/L16;codec=pcm;rate=24000`). */
function sampleRateFromMime(mime?: string | null): number | undefined {
  if (!mime) return undefined;
  const m = /rate=(\d+)/.exec(mime);
  if (!m) return undefined;
  const rate = Number.parseInt(m[1]!, 10);
  return Number.isFinite(rate) && rate > 0 ? rate : undefined;
}

/**
 * Wrap raw 16-bit signed little-endian mono PCM in a minimal WAV (RIFF)
 * container so players recognise the sample rate and bit depth.
 */
export function pcmToWav(pcm: Uint8Array, sampleRate: number): Uint8Array<ArrayBuffer> {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = pcm.byteLength;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeString = (offset: number, str: string): void => {
    for (let i = 0; i < str.length; i += 1) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true); // PCM fmt chunk size
  view.setUint16(20, 1, true); // audio format = PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);
  new Uint8Array(buffer, 44).set(pcm);
  return new Uint8Array(buffer);
}
