import { describe, expect, it } from "vitest";
import { ALLOWED_FIELDS, defaultModelFieldFor, isVendorKey } from "./shared.js";

describe("audio CLI config fields", () => {
  it("allows elevenlabs.apiKey and minimax.groupId", () => {
    expect(isVendorKey("elevenlabs")).toBe(true);
    expect(ALLOWED_FIELDS.elevenlabs.apiKey?.store).toBe("secrets");
    expect(ALLOWED_FIELDS.minimax.groupId?.store).toBe("config");
  });

  it("maps audio.defaultModel to the app default audio model field", () => {
    expect(defaultModelFieldFor("audio.defaultModel")).toBe("defaultAudioModel");
    expect(defaultModelFieldFor("app.defaultAudioModel")).toBe("defaultAudioModel");
  });
});
