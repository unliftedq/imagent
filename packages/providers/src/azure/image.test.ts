import { describe, expect, it, vi } from "vitest";
import { ProviderError, ProviderHttpError, type ImageRequest } from "@imagine/core";
import { APIError } from "openai";
import { AzureOpenAIImageProvider } from "./image.js";
import type { OpenAIClientLike } from "../openai/image.js";
import { AZURE_OPENAI_IMAGE_MODELS } from "../catalog/test-fixtures.js";

const PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII=";

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

function makeProvider(client: FakeClient): AzureOpenAIImageProvider {
  return new AzureOpenAIImageProvider({
    endpoint: "https://my-aoai.openai.azure.com",
    apiKey: "azure-key",
    models: new Map(Object.entries(AZURE_OPENAI_IMAGE_MODELS)),
    client: client as unknown as OpenAIClientLike,
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
  it("happy path: invokes SDK images.generate with deployment name as model", async () => {
    const client = makeFakeClient();
    client.images.generate.mockResolvedValue({ data: [{ b64_json: PNG_B64 }] });
    const p = makeProvider(client);
    const r = await p.generate(baseRequest);
    expect(r.outputs).toHaveLength(1);
    expect(client.images.generate).toHaveBeenCalledTimes(1);
    const [body] = client.images.generate.mock.calls[0]!;
    expect(body).toMatchObject({
      model: "image-default",
      prompt: baseRequest.prompt,
      n: 1,
      size: "1024x1024",
    });
  });

  it("401 from SDK surfaces as ProviderHttpError", async () => {
    const client = makeFakeClient();
    client.images.generate.mockRejectedValue(
      new APIError(401, { error: "no" }, "401 Unauthorized", new Headers()),
    );
    const p = makeProvider(client);
    await expect(p.generate(baseRequest)).rejects.toBeInstanceOf(ProviderHttpError);
  });

  it("network error from SDK surfaces as ProviderError", async () => {
    const client = makeFakeClient();
    client.images.generate.mockRejectedValue(new Error("ECONNRESET"));
    const p = makeProvider(client);
    await expect(p.generate(baseRequest)).rejects.toBeInstanceOf(ProviderError);
  });
});
