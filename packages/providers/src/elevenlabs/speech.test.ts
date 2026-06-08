import type { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import type { SpeechModelDef } from "@imagent/core";
import { describe, expect, it, vi } from "vitest";
import { ElevenLabsSpeechProvider } from "./speech.js";

const models = new Map<string, SpeechModelDef>([
  [
    "eleven_multilingual_v2",
    {
      id: "eleven_multilingual_v2",
      capabilities: {
        supportsVoiceDiscovery: true,
        outputFormats: [{ codec: "mp3", qualities: ["44100_128"] }],
      },
      defaults: { codec: "mp3", formatQuality: "44100_128", voice: "rachel" },
    },
  ],
]);

function streamOf(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

function makeClient(getAllResult: unknown = { voices: [] }) {
  const convert = vi.fn(async () => streamOf(new Uint8Array([1, 2, 3])));
  const getAll = vi.fn(async () => getAllResult);
  const client = {
    textToSpeech: { convert },
    voices: { getAll },
  } as unknown as ElevenLabsClient;
  return { client, convert, getAll };
}

describe("ElevenLabsSpeechProvider", () => {
  it("calls textToSpeech.convert with the voice id, model, and output format", async () => {
    const { client, convert } = makeClient();
    const provider = new ElevenLabsSpeechProvider({ apiKey: "k", models, client });
    const res = await provider.synthesize({
      prompt: "hello",
      providerId: "elevenlabs",
      model: "eleven_multilingual_v2",
      voice: "rachel",
      assetIds: [],
    });
    expect(res.output.mimeType).toBe("audio/mpeg");
    expect(res.output.bytes).toEqual(new Uint8Array([1, 2, 3]));
    expect(convert).toHaveBeenCalledWith(
      "rachel",
      {
        text: "hello",
        modelId: "eleven_multilingual_v2",
        outputFormat: "mp3_44100_128",
      },
      {},
    );
  });

  it("forwards speed and voice settings knobs as camelCase voiceSettings", async () => {
    const { client, convert } = makeClient();
    const provider = new ElevenLabsSpeechProvider({ apiKey: "k", models, client });
    await provider.synthesize({
      prompt: "hi",
      providerId: "elevenlabs",
      model: "eleven_multilingual_v2",
      voice: "rachel",
      speed: 1.1,
      raw: { stability: 0.4, similarity_boost: 0.8, use_speaker_boost: true },
      assetIds: [],
    });
    expect(convert).toHaveBeenCalledWith(
      "rachel",
      {
        text: "hi",
        modelId: "eleven_multilingual_v2",
        outputFormat: "mp3_44100_128",
        voiceSettings: {
          stability: 0.4,
          similarityBoost: 0.8,
          useSpeakerBoost: true,
          speed: 1.1,
        },
      },
      {},
    );
  });

  it("normalizes voices into the provider-agnostic VoiceInfo shape", async () => {
    const { client } = makeClient({
      voices: [
        {
          voiceId: "rachel",
          name: "Rachel",
          description: "A calm narrator",
          previewUrl: "https://preview/rachel.mp3",
          category: "premade",
          labels: { gender: "female", accent: "american" },
        },
        { voiceId: "bare" },
      ],
    });
    const provider = new ElevenLabsSpeechProvider({ apiKey: "k", models, client });
    const voices = await provider.listVoices();
    expect(voices).toEqual([
      {
        id: "rachel",
        name: "Rachel",
        description: "A calm narrator",
        previewUrl: "https://preview/rachel.mp3",
        category: "premade",
        labels: { gender: "female", accent: "american" },
      },
      { id: "bare", name: "bare", description: "", previewUrl: null },
    ]);
  });
});
