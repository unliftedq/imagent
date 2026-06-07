import { describe, expect, it } from "vitest";
import {
  SpeechModelCapsOverrideSchema,
  SpeechModelCapsSchema,
  SpeechModelDefSchema,
  SpeechProviderModelSchema,
} from "./model.js";

describe("speech model schemas", () => {
  it("parses full caps with defaults", () => {
    const caps = SpeechModelCapsSchema.parse({
      voices: [{ id: "rachel", name: "Rachel" }],
      outputFormats: [{ codec: "mp3", qualities: ["44100_128"] }],
      speedRange: { min: 0.5, max: 2 },
    });
    expect(caps.supportsVoiceDiscovery).toBe(false);
    expect(caps.voices?.[0]?.id).toBe("rachel");
  });

  it("override schema leaves all fields optional", () => {
    expect(SpeechModelCapsOverrideSchema.parse({})).toEqual({});
  });

  it("parses model + provider offering defs", () => {
    expect(SpeechModelDefSchema.parse({ id: "eleven_multilingual_v2" }).id).toBe(
      "eleven_multilingual_v2",
    );
    expect(
      SpeechProviderModelSchema.parse({ id: "tts-rachel", modelId: "eleven_multilingual_v2" })
        .modelId,
    ).toBe("eleven_multilingual_v2");
  });
});
