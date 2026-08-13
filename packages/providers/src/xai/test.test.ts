import { describe, expect, it, vi } from "vitest";
import { XaiImageProvider } from "./image.js";
import { XAI_IMAGE_MODELS } from "../catalog/test-fixtures.js";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function makeProvider(fetcher: typeof fetch): XaiImageProvider {
  return new XaiImageProvider({
    apiKey: "xai-key",
    baseUrl: "https://api.x.ai/v1",
    models: new Map(Object.entries(XAI_IMAGE_MODELS)),
    fetch: fetcher,
    // modelFactory is irrelevant for test() but a no-op stub avoids
    // building a real `createXai` provider during construction.
    modelFactory: () => {
      throw new Error("modelFactory should not be called by test()");
    },
  });
}

describe("XaiImageProvider.test()", () => {
  it("happy auth: GET /v1/models → 200 with configured model present sets sampleModelId", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        data: [{ id: "grok-imagine-image-quality" }, { id: "grok-2" }],
      }),
    );
    const p = makeProvider(fetchMock as unknown as typeof fetch);
    const res = await p.test!();
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.sampleModelId).toBe("grok-imagine-image-quality");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://api.x.ai/v1/models");
    expect((init as RequestInit).headers as Record<string, string>).toMatchObject({
      Authorization: "Bearer xai-key",
    });
  });

  it("bad auth: 401 → ok=false with status=401", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(401, { error: "Unauthorized" }),
    );
    const p = makeProvider(fetchMock as unknown as typeof fetch);
    const res = await p.test!();
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(401);
  });
});
