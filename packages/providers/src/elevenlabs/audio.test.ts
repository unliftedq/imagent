import type { AudioModelDef } from "@imagent/core";
import { describe, expect, it, vi } from "vitest";
import { ElevenLabsAudioProvider } from "./audio.js";

const models = new Map<string, AudioModelDef>([
  [
    "eleven_multilingual_v2",
    {
      id: "eleven_multilingual_v2",
      capabilities: { supportsVoiceDiscovery: true, outputFormats: ["mp3_44100_128"] },
      defaults: { outputFormat: "mp3_44100_128", voice: "rachel" },
    },
  ],
]);

function mockFetch(body: string | Uint8Array, init?: ResponseInit): typeof fetch {
  return vi.fn(async () => new Response(body, { status: 200, ...init })) as unknown as typeof fetch;
}

describe("ElevenLabsAudioProvider", () => {
  it("POSTs to /v1/text-to-speech/{voice} with output_format query and returns bytes", async () => {
    const fetchMock = mockFetch(new Uint8Array([1, 2, 3]), {
      headers: { "content-type": "audio/mpeg" },
    });
    const provider = new ElevenLabsAudioProvider({ apiKey: "k", models, fetch: fetchMock });
    const res = await provider.generate({
      prompt: "hello",
      providerId: "elevenlabs",
      model: "eleven_multilingual_v2",
      voice: "rachel",
      assetIds: [],
    });
    expect(res.output.mimeType).toBe("audio/mpeg");
    expect(res.output.bytes).toEqual(new Uint8Array([1, 2, 3]));
    const url = (fetchMock as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0]?.[0] as string;
    expect(url).toContain("/v1/text-to-speech/rachel");
    expect(url).toContain("output_format=mp3_44100_128");
    const init = (fetchMock as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0]?.[1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get("xi-api-key")).toBe("k");
    expect(headers.get("content-type")).toBe("application/json");
    expect(JSON.parse(init.body as string)).toEqual({
      text: "hello",
      model_id: "eleven_multilingual_v2",
    });
  });

  it("forwards speed and voice_settings knobs into voice_settings", async () => {
    const fetchMock = mockFetch(new Uint8Array([1]), {
      headers: { "content-type": "audio/mpeg" },
    });
    const provider = new ElevenLabsAudioProvider({ apiKey: "k", models, fetch: fetchMock });
    await provider.generate({
      prompt: "hi",
      providerId: "elevenlabs",
      model: "eleven_multilingual_v2",
      voice: "rachel",
      speed: 1.1,
      raw: { stability: 0.4 },
      assetIds: [],
    });
    const init = (fetchMock as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0]?.[1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual({
      text: "hi",
      model_id: "eleven_multilingual_v2",
      voice_settings: { stability: 0.4, speed: 1.1 },
    });
  });

  it("lists voices from /v1/voices", async () => {
    const fetchMock = mockFetch(
      JSON.stringify({ voices: [{ voice_id: "rachel", name: "Rachel", preview_url: "u" }] }),
      { headers: { "content-type": "application/json" } },
    );
    const provider = new ElevenLabsAudioProvider({ apiKey: "k", models, fetch: fetchMock });
    const voices = await provider.listVoices();
    expect(voices[0]).toEqual({ id: "rachel", name: "Rachel", previewUrl: "u" });
  });
});
