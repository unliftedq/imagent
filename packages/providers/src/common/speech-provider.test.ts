import type { SpeechGenerationResult, SpeechModelDef, SpeechRequest } from "@imagent/core";
import { describe, expect, it } from "vitest";
import { BaseSpeechProvider } from "./speech-provider.js";

class StubAudio extends BaseSpeechProvider {
  lastModelId?: string;
  protected async doSynthesize(
    req: SpeechRequest,
    model: SpeechModelDef,
  ): Promise<SpeechGenerationResult> {
    this.lastModelId = model.id;
    return { output: { bytes: new Uint8Array([1]), mimeType: "audio/mpeg" } };
  }
  protected async doTest() {
    return { ok: true as const, latencyMs: 1 };
  }
}

const models = new Map<string, SpeechModelDef>([
  [
    "m",
    {
      id: "m",
      capabilities: {
        supportsVoiceDiscovery: false,
        outputFormats: [{ codec: "mp3", qualities: [] }],
        voices: [{ id: "v", name: "V", description: "", previewUrl: null }],
      },
      defaults: { voice: "v", codec: "mp3" },
    },
  ],
]);

describe("BaseSpeechProvider", () => {
  it("applies defaults + validates, then calls doSynthesize", async () => {
    const p = new StubAudio({ providerId: "p", displayName: "P", models });
    const res = await p.synthesize({ prompt: "hi", providerId: "p", model: "m", assetIds: [] });
    expect(res.output.mimeType).toBe("audio/mpeg");
    expect(p.lastModelId).toBe("m");
    expect(p.capabilities.outputFormats.map((f) => f.codec)).toContain("mp3");
  });

  it("rejects an unknown model", async () => {
    const p = new StubAudio({ providerId: "p", displayName: "P", models });
    await expect(
      p.synthesize({ prompt: "hi", providerId: "p", model: "nope", assetIds: [] }),
    ).rejects.toThrow();
  });

  it("rejects an unsupported voice via validation", async () => {
    const p = new StubAudio({ providerId: "p", displayName: "P", models });
    await expect(
      p.synthesize({ prompt: "hi", providerId: "p", model: "m", voice: "bad", assetIds: [] }),
    ).rejects.toThrow(/voice/);
  });
});
