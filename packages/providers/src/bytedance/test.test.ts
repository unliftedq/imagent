import { describe, expect, it, vi } from "vitest";
import { APIError } from "openai";
import { ByteDanceImageProvider } from "./image.js";
import { ByteDanceVideoProvider } from "./video.js";
import type { OpenAIClientLike } from "../openai/image.js";
import {
  BYTEDANCE_IMAGE_MODELS,
  BYTEDANCE_VIDEO_MODELS,
} from "../catalog/test-fixtures.js";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

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

describe("ByteDanceImageProvider.test()", () => {
  it("happy auth: SDK list contains configured Seedream model id", async () => {
    const client = makeFakeClient();
    client.models.list.mockResolvedValue({
      data: [
        { id: "seedream-5-0-260128" },
        { id: "dreamina-seedance-2-0-260128" },
      ],
    });
    const p = new ByteDanceImageProvider({
      providerId: "byteplus",
      displayName: "BytePlus",
      apiKey: "ark-key",
      endpoint: "https://ark.cn-beijing.volces.com/api/v3",
      models: new Map(Object.entries(BYTEDANCE_IMAGE_MODELS)),
      client: client as unknown as OpenAIClientLike,
    });
    const res = await p.test!();
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.sampleModelId).toBe("seedream-5-0-260128");
  });

  it("bad auth: 401", async () => {
    const client = makeFakeClient();
    client.models.list.mockRejectedValue(
      new APIError(401, { error: "auth" }, "401 Unauthorized", new Headers()),
    );
    const p = new ByteDanceImageProvider({
      providerId: "byteplus",
      displayName: "BytePlus",
      apiKey: "ark-bad",
      endpoint: "https://ark.cn-beijing.volces.com/api/v3",
      models: new Map(Object.entries(BYTEDANCE_IMAGE_MODELS)),
      client: client as unknown as OpenAIClientLike,
    });
    const res = await p.test!();
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(401);
  });
});

describe("ByteDanceVideoProvider.test()", () => {
  it("happy auth: 200 + sample model id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, { data: [{ id: "dreamina-seedance-2-0-260128" }] }),
    );
    const p = new ByteDanceVideoProvider({
      providerId: "byteplus",
      displayName: "BytePlus",
      apiKey: "ark-key",
      endpoint: "https://ark.cn-beijing.volces.com/api/v3",
      models: new Map(Object.entries(BYTEDANCE_VIDEO_MODELS)),
      fetch: fetchMock as unknown as typeof fetch,
    });
    const res = await p.test!();
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.sampleModelId).toBe("dreamina-seedance-2-0-260128");
  });

  it("bad auth: 401", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(401, { error: "auth" }));
    const p = new ByteDanceVideoProvider({
      providerId: "byteplus",
      displayName: "BytePlus",
      apiKey: "ark-bad",
      endpoint: "https://ark.cn-beijing.volces.com/api/v3",
      models: new Map(Object.entries(BYTEDANCE_VIDEO_MODELS)),
      fetch: fetchMock as unknown as typeof fetch,
    });
    const res = await p.test!();
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(401);
  });

  it("network failure", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("offline"));
    const p = new ByteDanceVideoProvider({
      providerId: "byteplus",
      displayName: "BytePlus",
      apiKey: "ark-key",
      endpoint: "https://ark.cn-beijing.volces.com/api/v3",
      models: new Map(Object.entries(BYTEDANCE_VIDEO_MODELS)),
      fetch: fetchMock as unknown as typeof fetch,
    });
    const res = await p.test!();
    expect(res.ok).toBe(false);
  }, 30_000);
});
