import type { AudioGenerationResult, AudioModelDef, AudioRequest } from "@imagent/core";
import { describe, expect, it } from "vitest";
import { BaseAudioProvider } from "./audio-provider.js";

class StubAudio extends BaseAudioProvider {
  lastModelId?: string;
  protected async doGenerate(
    req: AudioRequest,
    model: AudioModelDef,
  ): Promise<AudioGenerationResult> {
    this.lastModelId = model.id;
    return { output: { bytes: new Uint8Array([1]), mimeType: "audio/mpeg" } };
  }
  protected async doTest() {
    return { ok: true as const, latencyMs: 1 };
  }
}

const models = new Map<string, AudioModelDef>([
  [
    "m",
    {
      id: "m",
      capabilities: {
        supportsVoiceDiscovery: false,
        outputFormats: ["mp3"],
        voices: [{ id: "v", name: "V" }],
      },
      defaults: { voice: "v", outputFormat: "mp3" },
    },
  ],
]);

describe("BaseAudioProvider", () => {
  it("applies defaults + validates, then calls doGenerate", async () => {
    const p = new StubAudio({ providerId: "p", displayName: "P", models });
    const res = await p.generate({ prompt: "hi", providerId: "p", model: "m", assetIds: [] });
    expect(res.output.mimeType).toBe("audio/mpeg");
    expect(p.lastModelId).toBe("m");
    expect(p.capabilities.outputFormats).toContain("mp3");
  });

  it("rejects an unknown model", async () => {
    const p = new StubAudio({ providerId: "p", displayName: "P", models });
    await expect(
      p.generate({ prompt: "hi", providerId: "p", model: "nope", assetIds: [] }),
    ).rejects.toThrow();
  });

  it("rejects an unsupported voice via validation", async () => {
    const p = new StubAudio({ providerId: "p", displayName: "P", models });
    await expect(
      p.generate({ prompt: "hi", providerId: "p", model: "m", voice: "bad", assetIds: [] }),
    ).rejects.toThrow(/voice/);
  });
});
