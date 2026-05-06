import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { type ImageRequest, ProviderError } from "@imagent/core";
import { describe, expect, it, vi } from "vitest";
import { GOOGLE_IMAGE_MODELS } from "../catalog/test-fixtures.js";
import { type GoogleGenAIClientLike, GoogleImageProvider } from "./image.js";

const PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII=";

interface FakeClient {
  models: {
    generateImages: ReturnType<typeof vi.fn>;
    generateContent: ReturnType<typeof vi.fn>;
    list: ReturnType<typeof vi.fn>;
  };
}

function makeFakeClient(): FakeClient {
  return {
    models: {
      generateImages: vi.fn(),
      generateContent: vi.fn(),
      list: vi.fn(),
    },
  };
}

function makeProvider(client: FakeClient): GoogleImageProvider {
  return new GoogleImageProvider({
    apiKey: "google-key",
    models: new Map(Object.entries(GOOGLE_IMAGE_MODELS)),
    client: client as unknown as GoogleGenAIClientLike,
  });
}

const baseRequest: ImageRequest = {
  prompt: "geometric pastel pattern",
  providerId: "google",
  model: "gemini-2.5-flash-image",
  count: 1,
  aspectRatio: "1:1",
  references: [],
  assetIds: [],
};

describe("GoogleImageProvider", () => {
  it("Nano Banana models route to generateContent and decode inlineData", async () => {
    const client = makeFakeClient();
    client.models.generateContent.mockResolvedValue({
      candidates: [
        {
          content: {
            parts: [{ inlineData: { data: PNG_B64, mimeType: "image/png" } }],
          },
        },
      ],
    });
    const p = makeProvider(client);
    const r = await p.generate(baseRequest);
    expect(r.outputs).toHaveLength(1);
    expect(r.outputs[0]?.mimeType).toBe("image/png");
    expect(client.models.generateContent).toHaveBeenCalledTimes(1);
    expect(client.models.generateImages).not.toHaveBeenCalled();
    const [params] = client.models.generateContent.mock.calls[0] ?? [];
    expect(params).toBeDefined();
    expect(params).toMatchObject({
      model: "gemini-2.5-flash-image",
      contents: baseRequest.prompt,
    });
  });

  it("SDK error surfaces as ProviderError", async () => {
    const client = makeFakeClient();
    client.models.generateContent.mockRejectedValue(new Error("PERMISSION_DENIED"));
    const p = makeProvider(client);
    await expect(p.generate(baseRequest)).rejects.toBeInstanceOf(ProviderError);
  });

  it("missing inlineData throws ProviderResponseError", async () => {
    const client = makeFakeClient();
    client.models.generateContent.mockResolvedValue({
      candidates: [{ content: { parts: [{ text: "no image here" }] } }],
    });
    const p = makeProvider(client);
    await expect(p.generate(baseRequest)).rejects.toBeInstanceOf(ProviderError);
  });

  it("passes references as inlineData parts after matching prompt instructions", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "imagent-google-ref-"));
    try {
      const refA = path.join(dir, "object.png");
      const refB = path.join(dir, "background.png");
      await writeFile(refA, Buffer.from(PNG_B64, "base64"));
      await writeFile(refB, Buffer.from(PNG_B64, "base64"));
      const client = makeFakeClient();
      client.models.generateContent.mockResolvedValue({
        candidates: [
          { content: { parts: [{ inlineData: { data: PNG_B64, mimeType: "image/png" } }] } },
        ],
      });
      const p = makeProvider(client);

      await p.generate({
        ...baseRequest,
        references: [
          { path: refA, role: "object" },
          { path: refB, role: "background" },
        ],
      });

      const [params] = client.models.generateContent.mock.calls[0] ?? [];
      expect(params).toBeDefined();
      const contents = params.contents as Array<{
        parts: Array<{ text?: string; inlineData?: unknown }>;
      }>;
      expect(contents[0]?.parts[0]?.text).toContain(
        "Reference image 1: role=object; source=object.png",
      );
      expect(contents[0]?.parts[0]?.text).toContain(
        "Reference image 2: role=background; source=background.png",
      );
      expect(contents[0]?.parts.slice(1)).toHaveLength(2);
      expect(contents[0]?.parts[1]?.inlineData).toMatchObject({ mimeType: "image/png" });
      expect(contents[0]?.parts[2]?.inlineData).toMatchObject({ mimeType: "image/png" });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
