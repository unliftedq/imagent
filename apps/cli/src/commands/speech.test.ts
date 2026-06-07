import type { SpeechModelDef } from "@imagent/core";
import { describe, expect, it } from "vitest";

import { parseSpeechOptions, resolveSpeechSelection } from "./speech.js";

const model: SpeechModelDef = {
  id: "tts",
  capabilities: {
    outputFormats: [{ codec: "mp3", qualities: [] }],
    supportsVoiceDiscovery: false,
    speedRange: { min: 0.5, max: 2 },
  },
};

describe("speech command helpers", () => {
  it("rejects non-numeric speed options", () => {
    expect(() => parseSpeechOptions(["speed=fast"], model)).toThrow(/speed/i);
  });

  it("does not fall back to the default model when an explicit model is unknown", () => {
    const runtime = {
      config: { app: { defaultSpeechModel: { providerId: "elevenlabs", modelId: "tts" } } },
      speechRegistry: new Map([["elevenlabs", { models: new Map([["tts", model]]) }]]),
    } as unknown as Parameters<typeof resolveSpeechSelection>[0];

    expect(() => resolveSpeechSelection(runtime, undefined, "typo-model")).toThrow(
      /unknown speech model/i,
    );
  });
});
