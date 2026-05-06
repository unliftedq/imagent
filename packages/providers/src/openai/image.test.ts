import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  type ImageRequest,
  ProviderError,
  ProviderHttpError,
  ProviderRequestError,
} from "@imagent/core";
import { APIError } from "openai";
import { describe, expect, it, vi } from "vitest";
import { OPENAI_IMAGE_MODELS } from "../catalog/test-fixtures.js";
import { type OpenAIClientLike, OpenAIImageProvider } from "./image.js";

const PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII=";

interface FakeClient {
  images: { generate: ReturnType<typeof vi.fn>; edit: ReturnType<typeof vi.fn> };
  models: { list: ReturnType<typeof vi.fn> };
}

function makeFakeClient(): FakeClient {
  return {
    images: { generate: vi.fn(), edit: vi.fn() },
    models: { list: vi.fn() },
  };
}

function makeProvider(client: FakeClient): OpenAIImageProvider {
  return new OpenAIImageProvider({
    apiKey: "sk-test",
    models: new Map(Object.entries(OPENAI_IMAGE_MODELS)),
    client: client as unknown as OpenAIClientLike,
  });
}

function makeAuthError(): APIError {
  return new APIError(401, { error: { message: "bad token" } }, "401 Unauthorized", new Headers());
}

const baseRequest: ImageRequest = {
  prompt: "a tiny otter on a lily pad",
  providerId: "openai",
  model: "gpt-image-1",
  count: 1,
  size: "1024x1024",
  references: [],
  assetIds: [],
};

describe("OpenAIImageProvider", () => {
  it("happy path: invokes SDK images.generate with correct params and decodes b64", async () => {
    const client = makeFakeClient();
    client.images.generate.mockResolvedValue({ data: [{ b64_json: PNG_B64 }] });
    const p = makeProvider(client);
    const result = await p.generate(baseRequest);
    expect(result.outputs).toHaveLength(1);
    expect(result.outputs[0]?.mimeType).toBe("image/png");
    expect(result.outputs[0]?.bytes.length).toBeGreaterThan(0);
    expect(client.images.generate).toHaveBeenCalledTimes(1);
    const [body] = client.images.generate.mock.calls[0] ?? [];
    expect(body).toBeDefined();
    expect(body).toMatchObject({
      model: "gpt-image-1",
      prompt: baseRequest.prompt,
      n: 1,
      size: "1024x1024",
    });
    // gpt-image-* family rejects `response_format` — the body builder uses
    // an id-pattern heuristic to omit it even when the catalog lacks the
    // `outputFormats` capability flag.
    expect(body).not.toHaveProperty("response_format");
  });

  it("rejects when count exceeds maxOutputs", async () => {
    const client = makeFakeClient();
    const p = makeProvider(client);
    await expect(p.generate({ ...baseRequest, count: 99 })).rejects.toBeInstanceOf(
      ProviderRequestError,
    );
    expect(client.images.generate).not.toHaveBeenCalled();
  });

  it("rejects size not in capability list", async () => {
    const client = makeFakeClient();
    const p = makeProvider(client);
    await expect(p.generate({ ...baseRequest, size: "9999x9999" })).rejects.toBeInstanceOf(
      ProviderRequestError,
    );
  });

  it("401 from SDK surfaces as ProviderHttpError with status preserved", async () => {
    const client = makeFakeClient();
    client.images.generate.mockRejectedValue(makeAuthError());
    const p = makeProvider(client);
    await expect(p.generate(baseRequest)).rejects.toBeInstanceOf(ProviderHttpError);
  });

  it("non-API error from SDK surfaces as ProviderError", async () => {
    const client = makeFakeClient();
    client.images.generate.mockRejectedValue(new Error("ETIMEDOUT"));
    const p = makeProvider(client);
    await expect(p.generate(baseRequest)).rejects.toBeInstanceOf(ProviderError);
  });

  it("passes `quality` through to the SDK when model declares qualities", async () => {
    const client = makeFakeClient();
    client.images.generate.mockResolvedValue({ data: [{ b64_json: PNG_B64 }] });
    const p = makeProvider(client);
    await p.generate({ ...baseRequest, quality: "high" });
    const [body] = client.images.generate.mock.calls[0] ?? [];
    expect(body).toBeDefined();
    expect(body).toMatchObject({ model: "gpt-image-1", quality: "high" });
  });

  it("routes references through images.edit with ordered prompt instructions", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "imagent-openai-ref-"));
    try {
      const refA = path.join(dir, "character.png");
      const refB = path.join(dir, "style.png");
      await writeFile(refA, Buffer.from(PNG_B64, "base64"));
      await writeFile(refB, Buffer.from(PNG_B64, "base64"));
      const client = makeFakeClient();
      client.images.edit.mockResolvedValue({ data: [{ b64_json: PNG_B64 }] });
      const p = makeProvider(client);

      await p.generate({
        ...baseRequest,
        references: [
          { path: refA, role: "character" },
          { path: refB, role: "style" },
        ],
      });

      expect(client.images.generate).not.toHaveBeenCalled();
      expect(client.images.edit).toHaveBeenCalledTimes(1);
      const [body] = client.images.edit.mock.calls[0] ?? [];
      expect(body).toBeDefined();
      expect(body.prompt).toContain("Reference image 1: role=character; source=character.png");
      expect(body.prompt).toContain("attached image 1");
      expect(body.prompt).toContain("Reference image 2: role=style; source=style.png");
      expect(body.prompt).toContain("attached image 2");
      expect(body.image).toHaveLength(2);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
