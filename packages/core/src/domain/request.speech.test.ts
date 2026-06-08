import { describe, expect, it } from "vitest";
import { SpeechRequestSchema, GenerationIntentSchema } from "./request.js";

describe("SpeechRequest", () => {
  it("requires non-empty prompt and defaults assetIds", () => {
    const req = SpeechRequestSchema.parse({
      prompt: "Hello world",
      providerId: "elevenlabs",
      model: "tts-rachel",
    });
    expect(req.assetIds).toEqual([]);
  });

  it("rejects empty text", () => {
    expect(() =>
      SpeechRequestSchema.parse({ prompt: "", providerId: "elevenlabs", model: "x" }),
    ).toThrow();
  });

  it("is a valid speech generation intent", () => {
    const intent = GenerationIntentSchema.parse({
      kind: "speech",
      request: { prompt: "hi", providerId: "minimax", model: "speech-02" },
    });
    expect(intent.kind).toBe("speech");
  });
});
