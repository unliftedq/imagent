import { describe, expect, it, vi } from "vitest";
import { OpenAIImageProvider } from "./image.js";
import { OPENAI_IMAGE_MODELS } from "./catalog.js";

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function makeProvider(fetcher: typeof fetch) {
  return new OpenAIImageProvider({
    apiKey: "sk-test",
    models: new Map(Object.entries(OPENAI_IMAGE_MODELS)),
    fetch: fetcher,
  });
}

describe("OpenAIImageProvider.test()", () => {
  it("happy auth: 200 + sample model id matches configured", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        data: [{ id: "gpt-image-1" }, { id: "dall-e-3" }, { id: "gpt-4o" }],
      }),
    );
    const p = makeProvider(fetchMock as unknown as typeof fetch);
    const res = await p.test!();
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.sampleModelId).toBe("gpt-image-1");
      expect(res.latencyMs).toBeGreaterThanOrEqual(0);
    }
    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.openai.com/v1/models");
  });

  it("bad auth: 401 returns ok=false with status=401", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(401, { error: { message: "invalid api key" } }),
    );
    const p = makeProvider(fetchMock as unknown as typeof fetch);
    const res = await p.test!();
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(401);
      expect(res.reason).toMatch(/HTTP 401/);
    }
  });

  it("network failure: never throws, returns ok=false", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("ENETUNREACH"));
    const p = new OpenAIImageProvider({
      apiKey: "sk-test",
      models: new Map(Object.entries(OPENAI_IMAGE_MODELS)),
      fetch: fetchMock as unknown as typeof fetch,
    });
    const res = await p.test!();
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toMatch(/ENETUNREACH|HTTP/);
    }
  }, 30_000);
});
