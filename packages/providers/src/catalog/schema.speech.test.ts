import { describe, expect, it } from "vitest";
import { ModelCatalogSchema } from "./schema.js";

const base = {
  version: 2 as const,
  models: {
    image: {},
    video: {},
    speech: {
      eleven_multilingual_v2: {
        id: "eleven_multilingual_v2",
        capabilities: {
          supportsVoiceDiscovery: true,
          outputFormats: [{ codec: "mp3", qualities: ["44100_128"] }],
        },
      },
    },
  },
  providers: {
    elevenlabs: {
      displayName: "ElevenLabs",
      speech: [{ id: "rachel", modelId: "eleven_multilingual_v2" }],
    },
  },
};

describe("catalog speech schema", () => {
  it("parses a catalog with speech models + offerings", () => {
    const parsed = ModelCatalogSchema.parse(base);
    expect(parsed.models.speech.eleven_multilingual_v2?.id).toBe("eleven_multilingual_v2");
  });

  it("defaults models.speech to {} when omitted", () => {
    const parsed = ModelCatalogSchema.parse({
      version: 2,
      models: { image: {}, video: {} },
      providers: {},
    });
    expect(parsed.models.speech).toEqual({});
  });

  it("rejects an speech offering referencing an unknown model", () => {
    expect(() =>
      ModelCatalogSchema.parse({
        ...base,
        providers: { elevenlabs: { speech: [{ id: "x", modelId: "nope" }] } },
      }),
    ).toThrow();
  });
});
