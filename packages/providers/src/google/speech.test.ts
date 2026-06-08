import type { SpeechModelDef } from "@imagent/core";
import { describe, expect, it, vi } from "vitest";
import type { GoogleGenAIClientLike } from "./image.js";
import { GoogleSpeechProvider, pcmToWav } from "./speech.js";

const models = new Map<string, SpeechModelDef>([
  [
    "gemini-3.1-flash-tts-preview",
    {
      id: "gemini-3.1-flash-tts-preview",
      capabilities: {
        supportsVoiceDiscovery: false,
        outputFormats: [{ codec: "wav", qualities: [] }],
        voices: [{ id: "Zephyr", name: "Zephyr", description: "", previewUrl: null }],
      },
      defaults: { codec: "wav", voice: "Zephyr" },
    },
  ],
]);

function makeClient(data: string, mimeType = "audio/L16;codec=pcm;rate=24000") {
  const generateContent = vi.fn(async () => ({
    candidates: [{ content: { parts: [{ inlineData: { data, mimeType } }] } }],
  }));
  const client = { models: { generateContent } } as unknown as GoogleGenAIClientLike;
  return { client, generateContent };
}

describe("GoogleSpeechProvider", () => {
  it("calls generateContent with AUDIO modality and voice config, wrapping PCM in WAV", async () => {
    // base64 of bytes [0,1,2,3]
    const pcm = new Uint8Array([0, 1, 2, 3]);
    const b64 = Buffer.from(pcm).toString("base64");
    const { client, generateContent } = makeClient(b64);
    const provider = new GoogleSpeechProvider({ apiKey: "k", models, client });
    const res = await provider.synthesize({
      prompt: "hello",
      providerId: "google",
      model: "gemini-3.1-flash-tts-preview",
      voice: "Zephyr",
      assetIds: [],
    });
    expect(res.output.mimeType).toBe("audio/wav");
    // WAV header (44 bytes) + 4 PCM bytes
    expect(res.output.bytes.byteLength).toBe(48);
    expect(new TextDecoder().decode(res.output.bytes.slice(0, 4))).toBe("RIFF");
    const call = (generateContent as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0]![0] as { model: string; config: Record<string, unknown> };
    expect(call.model).toBe("gemini-3.1-flash-tts-preview");
    expect(call.config.responseModalities).toEqual(["AUDIO"]);
    expect(call.config.speechConfig).toEqual({
      voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } },
    });
  });

  it("throws when the response has no audio bytes", async () => {
    const generateContent = vi.fn(async () => ({ candidates: [{ content: { parts: [] } }] }));
    const client = { models: { generateContent } } as unknown as GoogleGenAIClientLike;
    const provider = new GoogleSpeechProvider({ apiKey: "k", models, client });
    await expect(
      provider.synthesize({
        prompt: "hi",
        providerId: "google",
        model: "gemini-3.1-flash-tts-preview",
        voice: "Zephyr",
        assetIds: [],
      }),
    ).rejects.toThrow(/no audio/i);
  });
});

describe("pcmToWav", () => {
  it("prepends a 44-byte RIFF/WAVE header with the given sample rate", () => {
    const wav = pcmToWav(new Uint8Array([10, 20]), 24000);
    expect(wav.byteLength).toBe(46);
    const view = new DataView(wav.buffer);
    expect(new TextDecoder().decode(wav.slice(0, 4))).toBe("RIFF");
    expect(new TextDecoder().decode(wav.slice(8, 12))).toBe("WAVE");
    expect(view.getUint32(24, true)).toBe(24000);
  });
});
