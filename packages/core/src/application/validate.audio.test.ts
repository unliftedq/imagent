import { describe, expect, it } from "vitest";
import type { AudioModelDef } from "../domain/model.js";
import type { AudioRequest } from "../domain/request.js";
import { applyAudioDefaults, validateAudioRequestAgainstModel } from "./validate.js";

const model: AudioModelDef = {
  id: "tts",
  capabilities: {
    supportsVoiceDiscovery: false,
    outputFormats: [
      { codec: "mp3", qualities: ["44100_128"] },
      { codec: "wav", qualities: ["44100"] },
    ],
    speedRange: { min: 0.5, max: 2 },
    voices: [{ id: "rachel", name: "Rachel", description: "", previewUrl: null }],
  },
  defaults: { voice: "rachel", codec: "mp3", formatQuality: "44100_128", speed: 1 },
};

const base: AudioRequest = { prompt: "hi", providerId: "p", model: "tts", assetIds: [] };

describe("validateAudioRequestAgainstModel", () => {
  it("rejects unsupported codec", () => {
    expect(() =>
      validateAudioRequestAgainstModel("p", { ...base, codec: "flac" }, model),
    ).toThrow(/codec/);
  });

  it("rejects an unsupported quality for a codec", () => {
    expect(() =>
      validateAudioRequestAgainstModel("p", { ...base, codec: "mp3", formatQuality: "99999" }, model),
    ).toThrow(/quality/);
  });

  it("rejects out-of-range speed", () => {
    expect(() => validateAudioRequestAgainstModel("p", { ...base, speed: 5 }, model)).toThrow(
      /speed/,
    );
  });

  it("accepts a valid request", () => {
    expect(() =>
      validateAudioRequestAgainstModel(
        "p",
        { ...base, codec: "wav", formatQuality: "44100", speed: 1.2 },
        model,
      ),
    ).not.toThrow();
  });

  it("rejects an unknown voice for a static (non-discovery) voice list", () => {
    expect(() =>
      validateAudioRequestAgainstModel("p", { ...base, voice: "not-a-voice" }, model),
    ).toThrow(/voice/);
  });

  it("accepts any voice when the model supports voice discovery", () => {
    const discoveryModel = {
      ...model,
      capabilities: { ...model.capabilities, supportsVoiceDiscovery: true },
    };
    expect(() =>
      validateAudioRequestAgainstModel("p", { ...base, voice: "any-id" }, discoveryModel),
    ).not.toThrow();
  });
});

describe("applyAudioDefaults", () => {
  it("fills missing voice/format/speed from defaults", () => {
    const merged = applyAudioDefaults(base, model);
    expect(merged.voice).toBe("rachel");
    expect(merged.codec).toBe("mp3");
    expect(merged.formatQuality).toBe("44100_128");
    expect(merged.speed).toBe(1);
  });
});
