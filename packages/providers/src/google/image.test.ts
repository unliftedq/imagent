import { describe, expect, it, vi } from "vitest";
import { ProviderHttpError, type ImageRequest } from "@imagine-studio/core";
import { GoogleImageProvider } from "./image.js";
import { GOOGLE_IMAGE_MODELS } from "./catalog.js";

const PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII=";

function makeProvider(fetcher: typeof fetch) {
  return new GoogleImageProvider({
    apiKey: "google-key",
    models: new Map(Object.entries(GOOGLE_IMAGE_MODELS)),
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
  prompt: "geometric pastel pattern",
  providerId: "google",
  model: "imagen-3",
  count: 1,
  aspectRatio: "1:1",
  references: [],
  assetIds: [],
};

describe("GoogleImageProvider", () => {
  it("happy path: posts to imagen :predict and decodes prediction", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        predictions: [{ bytesBase64Encoded: PNG_B64, mimeType: "image/png" }],
      }),
    );
    const p = makeProvider(fetchMock as unknown as typeof fetch);
    const result = await p.generate(baseRequest);
    expect(result.outputs).toHaveLength(1);
    expect(result.outputs[0]?.mimeType).toBe("image/png");
    const [url] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("imagen-3:predict");
    expect(String(url)).toContain("key=google-key");
  });

  it("4xx error path surfaces ProviderHttpError", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(403, { error: { message: "PERMISSION_DENIED" } }),
    );
    const p = makeProvider(fetchMock as unknown as typeof fetch);
    await expect(p.generate(baseRequest)).rejects.toBeInstanceOf(ProviderHttpError);
  });

  it("retries on 429 then succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(429, {}, { "retry-after": "0" }))
      .mockResolvedValueOnce(
        jsonResponse(200, { predictions: [{ bytesBase64Encoded: PNG_B64 }] }),
      );
    const p = makeProvider(fetchMock as unknown as typeof fetch);
    const r = await p.generate(baseRequest);
    expect(r.outputs).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
