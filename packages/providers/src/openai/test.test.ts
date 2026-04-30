import { describe, expect, it, vi } from "vitest";
import { APIError } from "openai";
import { OpenAIImageProvider, type OpenAIClientLike } from "./image.js";
import { OPENAI_IMAGE_MODELS } from "../catalog/test-fixtures.js";

interface FakeClient {
  images: { generate: ReturnType<typeof vi.fn> };
  models: { list: ReturnType<typeof vi.fn> };
}

function makeFakeClient(): FakeClient {
  return {
    images: { generate: vi.fn() },
    models: { list: vi.fn() },
  };
}

function makeProvider(client: FakeClient): OpenAIImageProvider {
  return new OpenAIImageProvider({
    apiKey: "sk-test",
    models: new Map(Object.entries(OPENAI_IMAGE_MODELS)),
    client: client as unknown as OpenAIClientLike,
  });
}

describe("OpenAIImageProvider.test()", () => {
  it("happy auth: SDK returns models list with one of our configured ids", async () => {
    const client = makeFakeClient();
    client.models.list.mockResolvedValue({
      data: [{ id: "gpt-image-1" }, { id: "dall-e-3" }, { id: "gpt-4o" }],
    });
    const p = makeProvider(client);
    const res = await p.test!();
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.sampleModelId).toBe("gpt-image-1");
      expect(res.latencyMs).toBeGreaterThanOrEqual(0);
    }
    expect(client.models.list).toHaveBeenCalledTimes(1);
  });

  it("bad auth: SDK throws AuthenticationError → ok=false with status=401", async () => {
    const client = makeFakeClient();
    client.models.list.mockRejectedValue(
      new APIError(401, { error: { message: "invalid api key" } }, "401 Unauthorized", new Headers()),
    );
    const p = makeProvider(client);
    const res = await p.test!();
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(401);
      expect(res.reason).toMatch(/401/);
    }
  });
});
