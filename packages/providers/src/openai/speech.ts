import {
  type SpeechGenerationResult,
  type SpeechModelDef,
  type SpeechRequest,
  type Logger,
  ProviderResponseError,
  type ProviderTestResult,
} from "@imagent/core";
import OpenAI from "openai";
import {
  BaseSpeechProvider,
  listOpenAIModelIds,
  type OpenAIClientLike,
  runListProbe,
} from "../common/index.js";
import { DEFAULT_OPENAI_BASE_URL } from "./image.js";

/**
 * Minimal OpenAI client surface used by {@link OpenAISpeechProvider}. Tests
 * inject a fake; production constructs `new OpenAI({ apiKey })`.
 */
export interface OpenAISpeechClientLike {
  audio: {
    speech: {
      create(body: {
        model: string;
        input: string;
        voice: string;
        response_format?: string;
        speed?: number;
        instructions?: string;
      }): Promise<{ arrayBuffer(): Promise<ArrayBuffer> }>;
    };
  };
  models: { list: (options?: { signal?: AbortSignal }) => Promise<unknown> };
}

export interface OpenAISpeechProviderOptions {
  apiKey: string;
  baseUrl?: string | null;
  models: ReadonlyMap<string, SpeechModelDef>;
  /** Inject a SDK client (tests). In production we construct one. */
  client?: OpenAISpeechClientLike;
  logger?: Logger;
}

/**
 * OpenAI text-to-speech provider — `POST /v1/audio/speech` via the SDK's
 * `audio.speech.create`. The newer `gpt-4o-mini-tts` model additionally
 * supports a free-form `instructions` knob (forwarded from `req.raw`).
 */
export class OpenAISpeechProvider extends BaseSpeechProvider {
  private readonly client: OpenAISpeechClientLike;

  constructor(options: OpenAISpeechProviderOptions) {
    super({
      providerId: "openai",
      displayName: "OpenAI",
      models: options.models,
      ...(options.logger !== undefined ? { logger: options.logger } : {}),
    });
    this.client =
      options.client ??
      (new OpenAI({
        apiKey: options.apiKey,
        baseURL: options.baseUrl ?? DEFAULT_OPENAI_BASE_URL,
      }) as unknown as OpenAISpeechClientLike);
  }

  protected async doSynthesize(
    merged: SpeechRequest,
    model: SpeechModelDef,
    _signal?: AbortSignal,
  ): Promise<SpeechGenerationResult> {
    const voice = merged.voice;
    if (!voice) {
      throw new ProviderResponseError("OpenAI requires a voice (set --option voice=<id>)", {
        vendorId: this.id,
      });
    }
    const codec = merged.codec ?? "mp3";
    const body: Parameters<OpenAISpeechClientLike["audio"]["speech"]["create"]>[0] = {
      model: model.baseModelId ?? model.id,
      input: merged.prompt,
      voice,
      response_format: codec,
    };
    if (merged.speed !== undefined) body.speed = merged.speed;
    const instructions = merged.raw?.instructions;
    if (typeof instructions === "string" && instructions.length > 0) {
      body.instructions = instructions;
    }
    let response: { arrayBuffer(): Promise<ArrayBuffer> };
    try {
      response = await this.client.audio.speech.create(body);
    } catch (err) {
      throw wrapError(err, this.id, "OpenAI text-to-speech failed");
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength === 0) {
      throw new ProviderResponseError("OpenAI returned empty speech", { vendorId: this.id });
    }
    return { output: { bytes, mimeType: mimeForCodec(codec), raw: { outputFormat: codec } } };
  }

  protected async doTest(signal?: AbortSignal): Promise<ProviderTestResult> {
    const probeSignal = signal ?? AbortSignal.timeout(8000);
    return runListProbe({
      listIds: (s) => listOpenAIModelIds(this.client as unknown as OpenAIClientLike, s),
      configuredIds: [...this.models.keys()],
      signal: probeSignal,
    });
  }
}

function wrapError(err: unknown, vendorId: string, fallback: string): ProviderResponseError {
  const message = err instanceof Error ? err.message : String(err);
  return new ProviderResponseError(`${fallback}: ${message}`, { vendorId });
}

function mimeForCodec(codec: string): string {
  switch (codec) {
    case "mp3":
      return "audio/mpeg";
    case "opus":
      return "audio/opus";
    case "aac":
      return "audio/aac";
    case "flac":
      return "audio/flac";
    case "wav":
      return "audio/wav";
    case "pcm":
      return "audio/pcm";
    default:
      return "application/octet-stream";
  }
}
