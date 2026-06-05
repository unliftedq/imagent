import { describe, expect, it } from "vitest";
import { getBundledCatalog } from "./catalog/loader.js";
import { createAudioRegistry } from "./registry.js";

describe("createAudioRegistry", () => {
  const catalog = getBundledCatalog();

  it("includes elevenlabs when its secret is set", () => {
    const reg = createAudioRegistry(
      { elevenlabs: { apiKey: "k" } },
      { elevenlabs: {} } as never,
      catalog,
    );
    expect(reg.has("elevenlabs")).toBe(true);
  });

  it("includes minimax audio only when groupId is configured", () => {
    const without = createAudioRegistry(
      { minimax: { apiKey: "k" } },
      { minimax: {} } as never,
      catalog,
    );
    expect(without.has("minimax")).toBe(false);
    const withGroup = createAudioRegistry(
      { minimax: { apiKey: "k" } },
      { minimax: { groupId: "g1" } } as never,
      catalog,
    );
    expect(withGroup.has("minimax")).toBe(true);
  });
});
