import { describe, expect, it, vi } from "vitest";
import { GoogleImageProvider, type GoogleGenAIClientLike } from "./image.js";
import { GOOGLE_IMAGE_MODELS } from "../catalog/test-fixtures.js";

interface FakeClient {
  models: {
    generateImages: ReturnType<typeof vi.fn>;
    generateContent: ReturnType<typeof vi.fn>;
    list: ReturnType<typeof vi.fn>;
  };
}

function makeFakeClient(): FakeClient {
  return {
    models: {
      generateImages: vi.fn(),
      generateContent: vi.fn(),
      list: vi.fn(),
    },
  };
}

function makeProvider(client: FakeClient): GoogleImageProvider {
  return new GoogleImageProvider({
    apiKey: "google-key",
    models: new Map(Object.entries(GOOGLE_IMAGE_MODELS)),
    client: client as unknown as GoogleGenAIClientLike,
  });
}

describe("GoogleImageProvider.test()", () => {
  it("happy auth: returns ok with model match on suffix", async () => {
    const client = makeFakeClient();
    client.models.list.mockResolvedValue({
      data: [
        { name: "models/gemini-2.5-flash-image" },
        { name: "models/gemini-2.0-flash" },
      ],
    });
    const p = makeProvider(client);
    const res = await p.test!();
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.sampleModelId).toBe("gemini-2.5-flash-image");
  });

  it("bad auth: SDK throws → ok=false", async () => {
    const client = makeFakeClient();
    client.models.list.mockRejectedValue(new Error("AUTH_FAILED"));
    const p = makeProvider(client);
    const res = await p.test!();
    expect(res.ok).toBe(false);
  });
});
