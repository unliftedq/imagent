import type { AudioModelDef } from "@imagent/core";
import { describe, expect, it, vi } from "vitest";
import { MiniMaxAudioProvider } from "./audio.js";

const models = new Map<string, AudioModelDef>([
  [
    "speech-02-hd",
    {
      id: "speech-02-hd",
      baseModelId: "minimax-speech-02",
      capabilities: { supportsVoiceDiscovery: false, outputFormats: ["mp3"], voices: [{ id: "presenter_female", name: "PF" }] },
      defaults: { outputFormat: "mp3", voice: "presenter_female", speed: 1 },
    },
  ],
]);

describe("MiniMaxAudioProvider", () => {
  it("requires groupId", () => {
    expect(() => new MiniMaxAudioProvider({ apiKey: "k", models, groupId: undefined })).toThrow(/groupId/i);
  });

  it("POSTs t2a_v2 with GroupId query and decodes hex audio", async () => {
    // "010203" hex → bytes [1,2,3]
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ data: { audio: "010203" }, base_resp: { status_code: 0 } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ) as unknown as typeof fetch;
    const provider = new MiniMaxAudioProvider({ apiKey: "k", models, groupId: "g1", fetch: fetchMock });
    const res = await provider.generate({
      prompt: "hi",
      providerId: "minimax",
      model: "speech-02-hd",
      voice: "presenter_female",
      assetIds: [],
    });
    expect(res.output.bytes).toEqual(new Uint8Array([1, 2, 3]));
    const url = (fetchMock as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]?.[0] as string;
    expect(url).toContain("/t2a_v2");
    expect(url).toContain("GroupId=g1");
  });
});
