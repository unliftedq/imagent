import { describe, expect, it } from "vitest";
import {
  AudioModelCapsSchema,
  AudioModelCapsOverrideSchema,
  AudioModelDefSchema,
  AudioProviderModelSchema,
} from "./model.js";

describe("audio model schemas", () => {
  it("parses full caps with defaults", () => {
    const caps = AudioModelCapsSchema.parse({
      voices: [{ id: "rachel", name: "Rachel" }],
      outputFormats: ["mp3_44100_128"],
      speedRange: { min: 0.5, max: 2 },
    });
    expect(caps.supportsVoiceDiscovery).toBe(false);
    expect(caps.voices?.[0]?.id).toBe("rachel");
  });

  it("override schema leaves all fields optional", () => {
    expect(AudioModelCapsOverrideSchema.parse({})).toEqual({});
  });

  it("parses model + provider offering defs", () => {
    expect(AudioModelDefSchema.parse({ id: "eleven_multilingual_v2" }).id).toBe(
      "eleven_multilingual_v2",
    );
    expect(
      AudioProviderModelSchema.parse({ id: "tts-rachel", modelId: "eleven_multilingual_v2" })
        .modelId,
    ).toBe("eleven_multilingual_v2");
  });
});
