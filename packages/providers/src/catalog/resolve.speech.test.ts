import { describe, expect, it } from "vitest";
import { resolveSpeechProviderModels } from "./resolve.js";
import { ModelCatalogSchema } from "./schema.js";

const catalog = ModelCatalogSchema.parse({
  version: 2,
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
        defaults: { codec: "mp3", formatQuality: "44100_128" },
      },
    },
  },
  providers: {
    elevenlabs: {
      speech: [{ id: "rachel", modelId: "eleven_multilingual_v2", defaults: { voice: "rachel" } }],
    },
  },
});

describe("resolveSpeechProviderModels", () => {
  it("resolves offering → SpeechModelDef with merged caps + defaults", () => {
    const models = resolveSpeechProviderModels(catalog, "elevenlabs");
    expect(models).toHaveLength(1);
    expect(models[0]?.id).toBe("rachel");
    expect(models[0]?.capabilities?.supportsVoiceDiscovery).toBe(true);
    expect(models[0]?.defaults?.voice).toBe("rachel");
    expect(models[0]?.defaults?.codec).toBe("mp3");
    expect(models[0]?.defaults?.formatQuality).toBe("44100_128");
  });
});
