import { describe, expect, it, vi } from "vitest";
import { SeedreamImageProvider } from "./image.js";
import { SeedanceVideoProvider } from "./video.js";
import { SEEDREAM_IMAGE_MODELS, SEEDANCE_VIDEO_MODELS } from "./catalog.js";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("SeedreamImageProvider.test()", () => {
  it("happy auth: 200 + sample model id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, { data: [{ id: "seedream-3.0" }, { id: "seedance-1.0-pro" }] }),
    );
    const p = new SeedreamImageProvider({
      apiKey: "ark-key",
      baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
      models: new Map(Object.entries(SEEDREAM_IMAGE_MODELS)),
      fetch: fetchMock as unknown as typeof fetch,
    });
    const res = await p.test!();
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.sampleModelId).toBe("seedream-3.0");
  });

  it("bad auth: 401", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(401, { error: "auth" }));
    const p = new SeedreamImageProvider({
      apiKey: "ark-bad",
      models: new Map(Object.entries(SEEDREAM_IMAGE_MODELS)),
      fetch: fetchMock as unknown as typeof fetch,
    });
    const res = await p.test!();
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(401);
  });

  it("network failure", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("offline"));
    const p = new SeedreamImageProvider({
      apiKey: "ark-key",
      models: new Map(Object.entries(SEEDREAM_IMAGE_MODELS)),
      fetch: fetchMock as unknown as typeof fetch,
    });
    const res = await p.test!();
    expect(res.ok).toBe(false);
  }, 30_000);
});

describe("SeedanceVideoProvider.test()", () => {
  it("happy auth: 200 + sample model id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, { data: [{ id: "seedance-1.0-pro" }] }),
    );
    const p = new SeedanceVideoProvider({
      apiKey: "ark-key",
      models: new Map(Object.entries(SEEDANCE_VIDEO_MODELS)),
      fetch: fetchMock as unknown as typeof fetch,
    });
    const res = await p.test!();
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.sampleModelId).toBe("seedance-1.0-pro");
  });

  it("bad auth: 401", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(401, { error: "auth" }));
    const p = new SeedanceVideoProvider({
      apiKey: "ark-bad",
      models: new Map(Object.entries(SEEDANCE_VIDEO_MODELS)),
      fetch: fetchMock as unknown as typeof fetch,
    });
    const res = await p.test!();
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(401);
  });

  it("network failure", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("offline"));
    const p = new SeedanceVideoProvider({
      apiKey: "ark-key",
      models: new Map(Object.entries(SEEDANCE_VIDEO_MODELS)),
      fetch: fetchMock as unknown as typeof fetch,
    });
    const res = await p.test!();
    expect(res.ok).toBe(false);
  }, 30_000);
});
