import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, ProviderPreferencesSchema, ProviderSecretsSchema } from "./schema.js";

describe("audio config", () => {
  it("parses an elevenlabs secret", () => {
    const s = ProviderSecretsSchema.parse({ elevenlabs: { apiKey: "k" } });
    expect(s.elevenlabs?.apiKey).toBe("k");
  });

  it("accepts minimax.groupId and audio offerings in prefs", () => {
    const p = ProviderPreferencesSchema.parse({
      minimax: { groupId: "g123", audio: [{ id: "speech-2.8-hd", modelId: "minimax-speech-2.8" }] },
      elevenlabs: { audio: [{ id: "rachel", modelId: "eleven_multilingual_v2" }] },
    });
    expect(p.minimax.groupId).toBe("g123");
    expect(p.elevenlabs.audio?.[0]?.id).toBe("rachel");
  });

  it("DEFAULT_CONFIG has an elevenlabs routing slot and null audio default", () => {
    expect(DEFAULT_CONFIG.providers.elevenlabs).toEqual({});
    expect(DEFAULT_CONFIG.app.defaultAudioModel).toBeNull();
  });
});
