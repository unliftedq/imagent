import { describe, expect, it } from "vitest";
import { getBundledCatalog } from "./catalog/loader.js";
import { createSpeechRegistry } from "./registry.js";

describe("createSpeechRegistry", () => {
  const catalog = getBundledCatalog();

  it("includes elevenlabs when its secret is set", () => {
    const reg = createSpeechRegistry(
      { elevenlabs: { apiKey: "k" } },
      { elevenlabs: {} } as never,
      catalog,
    );
    expect(reg.has("elevenlabs")).toBe(true);
  });

  it("includes minimax speech only when groupId is configured", () => {
    const without = createSpeechRegistry(
      { minimax: { apiKey: "k" } },
      { minimax: {} } as never,
      catalog,
    );
    expect(without.has("minimax")).toBe(false);
    const withGroup = createSpeechRegistry(
      { minimax: { apiKey: "k" } },
      { minimax: { groupId: "g1" } } as never,
      catalog,
    );
    expect(withGroup.has("minimax")).toBe(true);
  });
});
