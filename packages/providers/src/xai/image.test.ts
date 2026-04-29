import { describe, expect, it, vi } from "vitest";
import { ProviderHttpError, type ImageRequest } from "@imagine/core";
import { XaiImageProvider } from "./image.js";
import { XAI_IMAGE_MODELS } from "./catalog.js";

const PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII=";

function makeProvider(fetcher: typeof fetch) {
  return new XaiImageProvider({
    apiKey: "xai-key",
    baseUrl: "https://api.x.ai/v1",
    models: new Map(Object.entries(XAI_IMAGE_MODELS)),
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
  prompt: "a cat in a top hat, photo",
  providerId: "xai",
  model: "grok-2-image-1212",
  count: 1,
  size: "1024x1024",
  references: [],
  assetIds: [],
};

describe("XaiImageProvider", () => {
  it("composes xAI images URL with bearer auth (OpenAI-compatible)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, { data: [{ b64_json: PNG_B64 }] }),
    );
    const p = makeProvider(fetchMock as unknown as typeof fetch);
    await p.generate(baseRequest);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.x.ai/v1/images/generations");
    expect((init as RequestInit).headers as Record<string, string>).toMatchObject({
      Authorization: "Bearer xai-key",
    });
  });

  it("4xx error path surfaces ProviderHttpError", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(401, { error: "no" }));
    const p = makeProvider(fetchMock as unknown as typeof fetch);
    await expect(p.generate(baseRequest)).rejects.toBeInstanceOf(ProviderHttpError);
  });

  it("network failure surfaces (timeout / offline)", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("ETIMEDOUT"));
    const p = makeProvider(fetchMock as unknown as typeof fetch);
    await expect(p.generate(baseRequest)).rejects.toBeTruthy();
  }, 30_000);
});
