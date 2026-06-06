import type { AudioModelDef } from "@imagent/core";
import { describe, expect, it, vi } from "vitest";
import { MiniMaxAudioProvider } from "./audio.js";

const models = new Map<string, AudioModelDef>([
  [
    "speech-2.8-hd",
    {
      id: "speech-2.8-hd",
      baseModelId: "minimax-speech-2.8-hd",
      capabilities: {
        supportsVoiceDiscovery: false,
        outputFormats: [{ codec: "mp3", qualities: [] }],
        voices: [{ id: "presenter_female", name: "PF", description: "", previewUrl: null }],
      },
      defaults: { codec: "mp3", voice: "presenter_female", speed: 1 },
    },
  ],
]);

describe("MiniMaxAudioProvider", () => {
  it("requires groupId", () => {
    expect(() => new MiniMaxAudioProvider({ apiKey: "k", models, groupId: undefined })).toThrow(
      /groupId/i,
    );
  });

  it("POSTs t2a_v2 with GroupId query and decodes hex audio", async () => {
    // "010203" hex → bytes [1,2,3]
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ data: { audio: "010203" }, base_resp: { status_code: 0 } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    ) as unknown as typeof fetch;
    const provider = new MiniMaxAudioProvider({
      apiKey: "k",
      models,
      groupId: "g1",
      fetch: fetchMock,
    });
    const res = await provider.synthesize({
      prompt: "hi",
      providerId: "minimax",
      model: "speech-2.8-hd",
      voice: "presenter_female",
      assetIds: [],
    });
    expect(res.output.bytes).toEqual(new Uint8Array([1, 2, 3]));
    const url = (fetchMock as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0]?.[0] as string;
    expect(url).toContain("/t2a_v2");
    expect(url).toContain("GroupId=g1");
    const init = (fetchMock as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0]?.[1] as RequestInit;
    expect((JSON.parse(init.body as string) as { model: string }).model).toBe("speech-2.8-hd");
  });

  it("lists voices from /get_voice (system + cloned + generated)", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            system_voice: [
              {
                voice_id: "presenter_female",
                voice_name: "Presenter (F)",
                description: ["A warm presenter voice"],
              },
            ],
            voice_cloning: [{ voice_id: "my-clone-1", description: [] }],
            voice_generation: [{ voice_id: "ttv-voice-123" }],
            base_resp: { status_code: 0 },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    ) as unknown as typeof fetch;
    const provider = new MiniMaxAudioProvider({
      apiKey: "k",
      models,
      groupId: "g1",
      fetch: fetchMock,
    });
    const voices = await provider.listVoices();
    expect(voices).toEqual([
      {
        id: "presenter_female",
        name: "Presenter (F)",
        description: "A warm presenter voice",
        previewUrl: null,
        category: "system",
      },
      {
        id: "my-clone-1",
        name: "my-clone-1",
        description: "",
        previewUrl: null,
        category: "cloned",
      },
      {
        id: "ttv-voice-123",
        name: "ttv-voice-123",
        description: "",
        previewUrl: null,
        category: "generated",
      },
    ]);
    const url = (fetchMock as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0]?.[0] as string;
    expect(url).toContain("/get_voice");
    expect(url).toContain("GroupId=g1");
    const init = (fetchMock as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0]?.[1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual({ voice_type: "all" });
  });
});
