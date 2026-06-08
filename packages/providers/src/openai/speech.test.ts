import type { SpeechModelDef } from "@imagent/core";
import { describe, expect, it, vi } from "vitest";
import { OpenAISpeechProvider, type OpenAISpeechClientLike } from "./speech.js";

const models = new Map<string, SpeechModelDef>([
  [
    "gpt-4o-mini-tts",
    {
      id: "gpt-4o-mini-tts",
      capabilities: {
        supportsVoiceDiscovery: false,
        outputFormats: [
          { codec: "mp3", qualities: [] },
          { codec: "wav", qualities: [] },
        ],
        speedRange: { min: 0.25, max: 4 },
        voices: [{ id: "alloy", name: "Alloy", description: "", previewUrl: null }],
      },
      defaults: { codec: "mp3", voice: "alloy", speed: 1 },
    },
  ],
]);

function makeClient(bytes = new Uint8Array([1, 2, 3])) {
  const create = vi.fn(async () => ({
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  }));
  const list = vi.fn(async () => ({ data: [{ id: "gpt-4o-mini-tts" }] }));
  const client = {
    audio: { speech: { create } },
    models: { list },
  } as unknown as OpenAISpeechClientLike;
  return { client, create, list };
}

describe("OpenAISpeechProvider", () => {
  it("calls audio.speech.create with model, voice, format and speed", async () => {
    const { client, create } = makeClient();
    const provider = new OpenAISpeechProvider({ apiKey: "k", models, client });
    const res = await provider.synthesize({
      prompt: "hello",
      providerId: "openai",
      model: "gpt-4o-mini-tts",
      voice: "alloy",
      assetIds: [],
    });
    expect(res.output.mimeType).toBe("audio/mpeg");
    expect(res.output.bytes).toEqual(new Uint8Array([1, 2, 3]));
    expect(create).toHaveBeenCalledWith({
      model: "gpt-4o-mini-tts",
      input: "hello",
      voice: "alloy",
      response_format: "mp3",
      speed: 1,
    });
  });

  it("forwards the instructions knob from raw", async () => {
    const { client, create } = makeClient();
    const provider = new OpenAISpeechProvider({ apiKey: "k", models, client });
    await provider.synthesize({
      prompt: "hi",
      providerId: "openai",
      model: "gpt-4o-mini-tts",
      voice: "alloy",
      codec: "wav",
      raw: { instructions: "speak cheerfully" },
      assetIds: [],
    });
    const body = (create as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]![0] as Record<
      string,
      unknown
    >;
    expect(body.response_format).toBe("wav");
    expect(body.instructions).toBe("speak cheerfully");
  });

  it("rejects unknown voices from the static list", async () => {
    const { client } = makeClient();
    const provider = new OpenAISpeechProvider({ apiKey: "k", models, client });
    await expect(
      provider.synthesize({
        prompt: "hi",
        providerId: "openai",
        model: "gpt-4o-mini-tts",
        voice: "not-a-voice",
        assetIds: [],
      }),
    ).rejects.toThrow(/voice/i);
  });
});
