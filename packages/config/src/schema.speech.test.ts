import { describe, expect, it } from "vitest";
import {
  AppPreferencesSchema,
  ConfigFileSchema,
  DEFAULT_CONFIG,
  ProviderPreferencesSchema,
  ProviderSecretsSchema,
} from "./schema.js";

describe("speech config", () => {
  it("parses an elevenlabs secret", () => {
    const s = ProviderSecretsSchema.parse({ elevenlabs: { apiKey: "k" } });
    expect(s.elevenlabs?.apiKey).toBe("k");
  });

  it("accepts minimax.groupId and speech offerings in prefs", () => {
    const p = ProviderPreferencesSchema.parse({
      minimax: {
        groupId: "g123",
        speech: [{ id: "speech-2.8-hd", modelId: "minimax-speech-2.8-hd" }],
      },
      elevenlabs: { speech: [{ id: "rachel", modelId: "eleven_multilingual_v2" }] },
    });
    expect(p.minimax.groupId).toBe("g123");
    expect(p.elevenlabs.speech?.[0]?.id).toBe("rachel");
  });

  it("migrates legacy defaultAudioModel onto defaultSpeechModel", () => {
    const app = AppPreferencesSchema.parse({
      defaultAudioModel: {
        providerId: "elevenlabs",
        modelId: "eleven_multilingual_v2",
      },
    });

    expect(app.defaultSpeechModel).toEqual({
      providerId: "elevenlabs",
      modelId: "eleven_multilingual_v2",
    });
    expect(app).not.toHaveProperty("defaultAudioModel");
  });

  it("migrates legacy audio routing onto speech across config providers", () => {
    const config = ConfigFileSchema.parse({
      version: 1,
      app: {
        defaultAudioModel: {
          providerId: "minimax",
          modelId: "minimax-speech-2.8-hd",
        },
      },
      providers: {
        minimax: {
          groupId: "g123",
          audio: [{ id: "speech-2.8-hd", modelId: "minimax-speech-2.8-hd" }],
        },
        customOpenAI: {
          demo: {
            baseUrl: "https://example.test/v1",
            audio: [{ id: "tts-1", modelId: "openai-tts-1" }],
          },
        },
      },
    });

    expect(config.app.defaultSpeechModel).toEqual({
      providerId: "minimax",
      modelId: "minimax-speech-2.8-hd",
    });
    expect(config.providers.minimax.speech).toEqual([
      { id: "speech-2.8-hd", modelId: "minimax-speech-2.8-hd" },
    ]);
    expect(config.providers.customOpenAI.demo?.speech).toEqual([
      { id: "tts-1", modelId: "openai-tts-1" },
    ]);
    expect(config.providers.minimax).not.toHaveProperty("audio");
    expect(config.providers.customOpenAI.demo).not.toHaveProperty("audio");
  });

  it("DEFAULT_CONFIG has an elevenlabs routing slot and null speech default", () => {
    expect(DEFAULT_CONFIG.providers.elevenlabs).toEqual({});
    expect(DEFAULT_CONFIG.app.defaultSpeechModel).toBeNull();
  });
});
