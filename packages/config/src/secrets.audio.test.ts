import { describe, expect, it } from "vitest";
import { createEnvSecretsStore } from "./secrets.js";

describe("env secrets — elevenlabs", () => {
  it("reads ELEVENLABS_API_KEY", async () => {
    const store = createEnvSecretsStore({ ELEVENLABS_API_KEY: "k" });
    const s = await store.loadSecrets();
    expect(s.elevenlabs?.apiKey).toBe("k");
  });
});
