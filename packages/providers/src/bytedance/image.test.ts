import { describe, expect, it, vi } from "vitest";
import { ProviderError, ProviderHttpError, type ImageRequest } from "@imagent/core";
import { APIError } from "openai";
import { ByteDanceImageProvider } from "./image.js";
import type { OpenAIClientLike } from "../openai/image.js";
import { BYTEDANCE_IMAGE_MODELS } from "../catalog/test-fixtures.js";

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

function makeProvider(client: FakeClient): ByteDanceImageProvider {
  return new ByteDanceImageProvider({
    apiKey: "volc-key",
    endpoint: "https://ark.cn-beijing.volces.com/api/v3",
    models: new Map(Object.entries(BYTEDANCE_IMAGE_MODELS)),
    client: client as unknown as OpenAIClientLike,
  });
}

const baseRequest: ImageRequest = {
  prompt: "neon koi pond",
  providerId: "bytedance",
  model: "doubao-seedream-3-0-t2i-250415",
  count: 1,
  size: "1024x1024",
  references: [],
  assetIds: [],
};

describe("ByteDanceImageProvider", () => {
  it("happy path: invokes Ark via OpenAI SDK (OpenAI-compatible)", async () => {
    const client = makeFakeClient();
    client.images.generate.mockResolvedValue({ data: [{ b64_json: PNG_B64 }] });
    const p = makeProvider(client);
    const r = await p.generate(baseRequest);
    expect(r.outputs).toHaveLength(1);
    expect(client.images.generate).toHaveBeenCalledTimes(1);
    const [body] = client.images.generate.mock.calls[0]!;
    expect(body).toMatchObject({
      model: "doubao-seedream-3-0-t2i-250415",
      prompt: baseRequest.prompt,
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

  it("provider id is 'bytedance' (consolidated with Seedance)", () => {
    const client = makeFakeClient();
    const p = makeProvider(client);
    expect(p.id).toBe("bytedance");
    expect(p.displayName).toBe("ByteDance");
  });
});
