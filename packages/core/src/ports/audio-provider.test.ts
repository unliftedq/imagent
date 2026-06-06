import { describe, expect, it } from "vitest";
import type { AudioProvider } from "./audio-provider.js";

describe("AudioProvider port", () => {
  it("can be implemented as a minimal stub", async () => {
    const provider: AudioProvider = {
      id: "stub",
      displayName: "Stub",
      capabilities: {
        outputFormats: [{ codec: "mp3", qualities: [] }],
        supportsVoiceDiscovery: false,
      },
      models: new Map(),
      async synthesize() {
        return { output: { bytes: new Uint8Array([1]), mimeType: "audio/mpeg" } };
      },
    };
    const res = await provider.synthesize({
      prompt: "hi",
      providerId: "stub",
      model: "m",
      assetIds: [],
    });
    expect(res.output.mimeType).toBe("audio/mpeg");
  });
});
