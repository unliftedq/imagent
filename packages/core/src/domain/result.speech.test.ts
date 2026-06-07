import { describe, expect, it } from "vitest";
import { SpeechGenerationResultSchema, SpeechOutputSchema } from "./result.js";

describe("speech result schemas", () => {
  it("parses an speech output", () => {
    const out = SpeechOutputSchema.parse({
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: "audio/mpeg",
      durationMs: 1200,
    });
    expect(out.mimeType).toBe("audio/mpeg");
  });

  it("wraps a single output in a result", () => {
    const res = SpeechGenerationResultSchema.parse({
      output: { bytes: new Uint8Array([1]), mimeType: "audio/mpeg" },
    });
    expect(res.output.bytes.byteLength).toBe(1);
  });
});
