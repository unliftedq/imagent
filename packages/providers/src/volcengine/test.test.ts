import { describe, expect, it, vi } from "vitest";
import { VolcengineImageProvider } from "./image.js";
import { VolcengineVideoProvider } from "./video.js";
import { VOLCENGINE_IMAGE_MODELS, VOLCENGINE_VIDEO_MODELS } from "./catalog.js";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("VolcengineImageProvider.test()", () => {
  it("happy auth: 200 + sample model id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, { data: [{ id: "seedream-3.0" }, { id: "seedance-1.0-pro" }] }),
    );
    const p = new VolcengineImageProvider({
      apiKey: "ark-key",
      baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
      models: new Map(Object.entries(VOLCENGINE_IMAGE_MODELS)),
      fetch: fetchMock as unknown as typeof fetch,
    });
    const res = await p.test!();
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.sampleModelId).toBe("seedream-3.0");
  });

  it("bad auth: 401", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(401, { error: "auth" }));
    const p = new VolcengineImageProvider({
      apiKey: "ark-bad",
      models: new Map(Object.entries(VOLCENGINE_IMAGE_MODELS)),
      fetch: fetchMock as unknown as typeof fetch,
    });
    const res = await p.test!();
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(401);
  });

  it("network failure", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("offline"));
    const p = new VolcengineImageProvider({
      apiKey: "ark-key",
      models: new Map(Object.entries(VOLCENGINE_IMAGE_MODELS)),
      fetch: fetchMock as unknown as typeof fetch,
    });
    const res = await p.test!();
    expect(res.ok).toBe(false);
  }, 30_000);
});

describe("VolcengineVideoProvider.test()", () => {
  it("happy auth: 200 + sample model id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, { data: [{ id: "seedance-1.0-pro" }] }),
    );
    const p = new VolcengineVideoProvider({
      apiKey: "ark-key",
      models: new Map(Object.entries(VOLCENGINE_VIDEO_MODELS)),
      fetch: fetchMock as unknown as typeof fetch,
    });
    const res = await p.test!();
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.sampleModelId).toBe("seedance-1.0-pro");
  });

  it("bad auth: 401", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(401, { error: "auth" }));
    const p = new VolcengineVideoProvider({
      apiKey: "ark-bad",
      models: new Map(Object.entries(VOLCENGINE_VIDEO_MODELS)),
      fetch: fetchMock as unknown as typeof fetch,
    });
    const res = await p.test!();
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(401);
  });

  it("network failure", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("offline"));
    const p = new VolcengineVideoProvider({
      apiKey: "ark-key",
      models: new Map(Object.entries(VOLCENGINE_VIDEO_MODELS)),
      fetch: fetchMock as unknown as typeof fetch,
    });
    const res = await p.test!();
    expect(res.ok).toBe(false);
  }, 30_000);
});
