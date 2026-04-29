import { describe, expect, it, vi } from "vitest";
import { XaiImageProvider } from "./image.js";
import { XAI_IMAGE_MODELS } from "./catalog.js";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("XaiImageProvider.test()", () => {
  it("happy auth: 200 + sample model id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, { data: [{ id: "grok-2-image-1212" }, { id: "grok-2" }] }),
    );
    const p = new XaiImageProvider({
      apiKey: "xai-key",
      baseUrl: "https://api.x.ai/v1",
      models: new Map(Object.entries(XAI_IMAGE_MODELS)),
      fetch: fetchMock as unknown as typeof fetch,
    });
    const res = await p.test!();
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.sampleModelId).toBe("grok-2-image-1212");
    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.x.ai/v1/models");
  });

  it("bad auth: 401", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(401, { error: "no" }));
    const p = new XaiImageProvider({
      apiKey: "xai-bad",
      models: new Map(Object.entries(XAI_IMAGE_MODELS)),
      fetch: fetchMock as unknown as typeof fetch,
    });
    const res = await p.test!();
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(401);
  });
});
