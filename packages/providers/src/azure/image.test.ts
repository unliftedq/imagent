import { describe, expect, it, vi } from "vitest";
import { ProviderHttpError, type ImageRequest } from "@imagine/core";
import { AzureOpenAIImageProvider } from "./image.js";
import { AZURE_OPENAI_IMAGE_MODELS } from "./catalog.js";

const PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII=";

const baseModelMap = new Map(Object.entries(AZURE_OPENAI_IMAGE_MODELS));

function makeProvider(fetcher: typeof fetch) {
  return new AzureOpenAIImageProvider({
    endpoint: "https://my-aoai.openai.azure.com",
    apiKey: "azure-key",
    apiVersion: "2024-10-21",
    models: baseModelMap,
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
  prompt: "a windmill at golden hour",
  providerId: "azure-openai",
  model: "image-default",
  count: 1,
  size: "1024x1024",
  references: [],
  assetIds: [],
};

describe("AzureOpenAIImageProvider", () => {
  it("composes the deployment URL and uses api-key header", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, { data: [{ b64_json: PNG_B64 }] }),
    );
    const p = makeProvider(fetchMock as unknown as typeof fetch);
    await p.generate(baseRequest);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(
      "https://my-aoai.openai.azure.com/openai/deployments/image-default/images/generations?api-version=2024-10-21",
    );
    expect((init as RequestInit).headers as Record<string, string>).toMatchObject({
      "api-key": "azure-key",
    });
  });

  it("4xx error path surfaces ProviderHttpError", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(403, { error: "no" }));
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
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
