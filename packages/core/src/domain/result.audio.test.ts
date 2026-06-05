import { describe, expect, it } from "vitest";
import { AudioGenerationResultSchema, AudioOutputSchema } from "./result.js";

describe("audio result schemas", () => {
  it("parses an audio output", () => {
    const out = AudioOutputSchema.parse({
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: "audio/mpeg",
      durationMs: 1200,
    });
    expect(out.mimeType).toBe("audio/mpeg");
  });

  it("wraps a single output in a result", () => {
    const res = AudioGenerationResultSchema.parse({
      output: { bytes: new Uint8Array([1]), mimeType: "audio/mpeg" },
    });
    expect(res.output.bytes.byteLength).toBe(1);
  });
});
