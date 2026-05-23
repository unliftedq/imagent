import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { type ImageRequest, ProviderError, ProviderHttpError } from "@imagent/core";
import { APIError } from "openai";
import { describe, expect, it, vi } from "vitest";
import { BYTEDANCE_IMAGE_MODELS } from "../catalog/test-fixtures.js";
import type { OpenAIClientLike } from "../openai/image.js";
import { ByteDanceImageProvider } from "./image.js";

const PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII=";

interface FakeClient {
  images: { edit: ReturnType<typeof vi.fn>; generate: ReturnType<typeof vi.fn> };
  models: { list: ReturnType<typeof vi.fn> };
}

function makeFakeClient(): FakeClient {
  return {
    images: { edit: vi.fn(), generate: vi.fn() },
    models: { list: vi.fn() },
  };
}

function makeProvider(client: FakeClient): ByteDanceImageProvider {
  return new ByteDanceImageProvider({
    providerId: "byteplus",
    displayName: "BytePlus",
    apiKey: "volc-key",
    endpoint: "https://ark.cn-beijing.volces.com/api/v3",
    models: new Map(Object.entries(BYTEDANCE_IMAGE_MODELS)),
    client: client as unknown as OpenAIClientLike,
  });
}

const baseRequest: ImageRequest = {
  prompt: "neon koi pond",
  providerId: "byteplus",
  model: "seedream-5-0-260128",
  count: 1,
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
    const body = client.images.generate.mock.calls[0]?.[0];
    expect(body).toMatchObject({
      model: "seedream-5-0-260128",
      prompt: baseRequest.prompt,
      size: "2k",
    });
    expect(body).not.toHaveProperty("quality");
  });

  it("converts quality + aspect ratio to the recommended Seedream size", async () => {
    const client = makeFakeClient();
    client.images.generate.mockResolvedValue({ data: [{ b64_json: PNG_B64 }] });
    const p = makeProvider(client);
    await p.generate({ ...baseRequest, quality: "4k", aspectRatio: "16:9" });
    const body = client.images.generate.mock.calls[0]?.[0];
    expect(body).toMatchObject({
      size: "5120x2880",
    });
  });

  it("passes custom sizes through instead of deriving from aspect ratio", async () => {
    const client = makeFakeClient();
    client.images.generate.mockResolvedValue({ data: [{ b64_json: PNG_B64 }] });
    const p = makeProvider(client);
    await p.generate({
      ...baseRequest,
      quality: "4k",
      aspectRatio: "16:9",
      size: "1232x768",
    });
    const body = client.images.generate.mock.calls[0]?.[0];
    expect(body).toMatchObject({
      size: "1232x768",
    });
  });

  it("uses the OpenAI-compatible edit path for local reference images", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "imagent-bytedance-image-"));
    try {
      const referencePath = path.join(dir, "reference.png");
      await writeFile(referencePath, new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
      const client = makeFakeClient();
      client.images.edit.mockResolvedValue({ data: [{ b64_json: PNG_B64 }] });
      const p = makeProvider(client);

      await p.generate({
        ...baseRequest,
        references: [{ path: referencePath, role: "freeform" }],
      });

      expect(client.images.generate).not.toHaveBeenCalled();
      expect(client.images.edit).toHaveBeenCalledTimes(1);
      const body = client.images.edit.mock.calls[0]?.[0];
      expect(body).toMatchObject({
        model: "seedream-5-0-260128",
        prompt:
          "neon koi pond\n\nReference images are attached in this exact order. Keep each numbered instruction matched to the same-numbered attached image:\nReference image 1 (attached image 1) — role: freeform.",
        size: "2k",
      });
      expect((body as { image?: unknown[] }).image).toHaveLength(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
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

  it("provider id is configurable for BytePlus vs Volcengine", () => {
    const client = makeFakeClient();
    const bp = makeProvider(client);
    expect(bp.id).toBe("byteplus");
    expect(bp.displayName).toBe("BytePlus");

    const volc = new ByteDanceImageProvider({
      providerId: "volcengine",
      displayName: "Volcengine",
      apiKey: "k",
      endpoint: "https://ark.cn-beijing.volces.com/api/v3",
      models: new Map(Object.entries(BYTEDANCE_IMAGE_MODELS)),
      client: client as unknown as OpenAIClientLike,
    });
    expect(volc.id).toBe("volcengine");
    expect(volc.displayName).toBe("Volcengine");
  });
});
