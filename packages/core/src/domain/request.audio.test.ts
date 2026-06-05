import { describe, expect, it } from "vitest";
import { AudioRequestSchema, GenerationIntentSchema } from "./request.js";

describe("AudioRequest", () => {
  it("requires non-empty prompt and defaults assetIds", () => {
    const req = AudioRequestSchema.parse({
      prompt: "Hello world",
      providerId: "elevenlabs",
      model: "tts-rachel",
    });
    expect(req.assetIds).toEqual([]);
  });

  it("rejects empty text", () => {
    expect(() =>
      AudioRequestSchema.parse({ prompt: "", providerId: "elevenlabs", model: "x" }),
    ).toThrow();
  });

  it("is a valid audio generation intent", () => {
    const intent = GenerationIntentSchema.parse({
      kind: "audio",
      request: { prompt: "hi", providerId: "minimax", model: "speech-02" },
    });
    expect(intent.kind).toBe("audio");
  });
});
