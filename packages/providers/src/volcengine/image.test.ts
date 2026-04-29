import { describe, expect, it, vi } from "vitest";
import { ProviderHttpError, type ImageRequest } from "@imagine-studio/core";
import { SeedreamImageProvider } from "./image.js";
import { SEEDREAM_IMAGE_MODELS } from "./catalog.js";

const PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII=";

function makeProvider(fetcher: typeof fetch) {
  return new SeedreamImageProvider({
    apiKey: "volc-key",
    baseUrl: "https://ark.example/api/v3",
    region: "cn-beijing",
    models: new Map(Object.entries(SEEDREAM_IMAGE_MODELS)),
    fetch: fetcher,
  });
}

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

const baseRequest: ImageRequest = {
  prompt: "neon koi pond",
  providerId: "seedream",
  model: "seedream-3.0",
  count: 1,
  size: "1024x1024",
  references: [],
  assetIds: [],
};

describe("SeedreamImageProvider", () => {
  it("composes Ark images URL with bearer auth (OpenAI-compatible)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, { data: [{ b64_json: PNG_B64 }] }),
    );
    const p = makeProvider(fetchMock as unknown as typeof fetch);
    await p.generate(baseRequest);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://ark.example/api/v3/images/generations");
    expect((init as RequestInit).headers as Record<string, string>).toMatchObject({
      Authorization: "Bearer volc-key",
    });
  });

  it("4xx error path surfaces ProviderHttpError", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(401, { error: "no" }));
    const p = makeProvider(fetchMock as unknown as typeof fetch);
    await expect(p.generate(baseRequest)).rejects.toBeInstanceOf(ProviderHttpError);
  });

  it("retries on 429 then succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(429, {}, { "retry-after": "0" }))
      .mockResolvedValueOnce(jsonResponse(200, { data: [{ b64_json: PNG_B64 }] }));
    const p = makeProvider(fetchMock as unknown as typeof fetch);
    const r = await p.generate(baseRequest);
    expect(r.outputs).toHaveLength(1);
  });
});
