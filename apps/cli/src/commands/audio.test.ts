import type { AudioModelDef } from "@imagent/core";
import { describe, expect, it } from "vitest";

import { parseAudioOptions, resolveAudioSelection } from "./audio.js";

const model: AudioModelDef = {
  id: "tts",
  capabilities: {
    outputFormats: ["mp3"],
    supportsVoiceDiscovery: false,
    speedRange: { min: 0.5, max: 2 },
  },
};

describe("audio command helpers", () => {
  it("rejects non-numeric speed options", () => {
    expect(() => parseAudioOptions(["speed=fast"], model)).toThrow(/speed/i);
  });

  it("does not fall back to the default model when an explicit model is unknown", () => {
    const runtime = {
      config: { app: { defaultAudioModel: { providerId: "elevenlabs", modelId: "tts" } } },
      audioRegistry: new Map([
        ["elevenlabs", { models: new Map([["tts", model]]) }],
      ]),
    } as unknown as Parameters<typeof resolveAudioSelection>[0];

    expect(() => resolveAudioSelection(runtime, undefined, "typo-model")).toThrow(/unknown audio model/i);
  });
});
