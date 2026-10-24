import { GoogleGenAI } from "@google/genai";
import {
  type Logger,
  ProviderResponseError,
  type ProviderTestResult,
  type SpeechGenerationResult,
  type SpeechModelDef,
  type SpeechRequest,
} from "@imagent/core";
import { BaseSpeechProvider, decodeBase64, rethrowGenericSdkError } from "../common/index.js";
import type { GoogleGenAIClientLike } from "./image.js";
import {
  assertInteractionCompleted,
  createInteraction,
  interactionContent,
} from "./interactions.js";

/**
 * Current TTS uses Interactions with native WAV or explicit PCM output.
 * Legacy user-catalog models retain the generateContent / PCM path.
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
    const modelId = model.baseModelId ?? model.id;
    if (/^gemini-3\.8-.*tts$/.test(modelId)) {
      const response = await createInteraction(
        this.client.interactions,
        {
          model: model.id,
          input: merged.prompt,
          store: false,
          response_format: { type: "audio" },
          generation_config: {
            speech_config: merged.voice ? [{ voice: merged.voice }] : [],
          },
        },
        signal,
      );
      assertInteractionCompleted(response);
      const audio = interactionContent(response).find((part) => part.type === "audio" && part.data);
      if (!audio || audio.type !== "audio" || !audio.data) {
        throw new ProviderResponseError("Gemini interaction carried no audio bytes", {
          vendorId: this.id,
        });
      }
      const bytes = decodeBase64(audio.data);
      const mime = audio.mime_type?.toLowerCase();
      if (mime === "audio/wav" || mime === "audio/x-wav") {
        return { output: { bytes, mimeType: "audio/wav" } };
      }
      if (mime?.startsWith("audio/l16") || mime?.startsWith("audio/pcm")) {
        if (audio.channels !== undefined && audio.channels !== 1) {
          throw new ProviderResponseError("Gemini returned unsupported multichannel PCM", {
            vendorId: this.id,
          });
        }
        const rate = audio.sample_rate ?? sampleRateFromMime(mime) ?? 24000;
        if (!Number.isSafeInteger(rate) || rate <= 0) {
          throw new ProviderResponseError("Gemini returned an invalid PCM sample rate", {
            vendorId: this.id,
          });
        }
        return { output: { bytes: pcmToWav(bytes, rate), mimeType: "audio/wav" } };
      }
      throw new ProviderResponseError(`Gemini returned unsupported audio format '${mime}'`, {
        vendorId: this.id,
      });
    }
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
