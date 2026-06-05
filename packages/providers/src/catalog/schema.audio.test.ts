import { describe, expect, it } from "vitest";
import { ModelCatalogSchema } from "./schema.js";

const base = {
  version: 2 as const,
  models: {
    image: {},
    video: {},
    audio: {
      eleven_multilingual_v2: {
        id: "eleven_multilingual_v2",
        capabilities: { supportsVoiceDiscovery: true, outputFormats: ["mp3_44100_128"] },
      },
    },
  },
  providers: {
    elevenlabs: { displayName: "ElevenLabs", audio: [{ id: "rachel", modelId: "eleven_multilingual_v2" }] },
  },
};

describe("catalog audio schema", () => {
  it("parses a catalog with audio models + offerings", () => {
    const parsed = ModelCatalogSchema.parse(base);
    expect(parsed.models.audio.eleven_multilingual_v2?.id).toBe("eleven_multilingual_v2");
  });

  it("defaults models.audio to {} when omitted", () => {
    const parsed = ModelCatalogSchema.parse({ version: 2, models: { image: {}, video: {} }, providers: {} });
    expect(parsed.models.audio).toEqual({});
  });

  it("rejects an audio offering referencing an unknown model", () => {
    expect(() =>
      ModelCatalogSchema.parse({
        ...base,
        providers: { elevenlabs: { audio: [{ id: "x", modelId: "nope" }] } },
      }),
    ).toThrow();
  });
});
