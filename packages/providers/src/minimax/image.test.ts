import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ImageRequest } from "@imagent/core";
import { describe, expect, it, vi } from "vitest";
import { MINIMAX_IMAGE_MODELS } from "../catalog/test-fixtures.js";
import { MiniMaxImageProvider } from "./image.js";

// A 1x1 JPEG-ish payload; content is irrelevant to the provider, only the
// base64 round-trip is exercised.
const IMAGE_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const IMAGE_B64 = Buffer.from(IMAGE_BYTES).toString("base64");

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function makeProvider(fetcher: typeof fetch): MiniMaxImageProvider {
  return new MiniMaxImageProvider({
    apiKey: "minimax-key",
    models: new Map(Object.entries(MINIMAX_IMAGE_MODELS)),
    fetch: fetcher,
  });
}

const baseRequest: ImageRequest = {
  prompt: "a neon koi swimming through clouds",
  providerId: "minimax",
  model: "minimax-image-01",
  aspectRatio: "16:9",
  count: 1,
  references: [],
  assetIds: [],
};

describe("MiniMaxImageProvider", () => {
  it("posts image_generation with the API model name and decodes base64 output", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        id: "img-1",
        data: { image_base64: [IMAGE_B64] },
        base_resp: { status_code: 0, status_msg: "success" },
      }),
    );
    const p = makeProvider(fetchMock as unknown as typeof fetch);
    const result = await p.generate(baseRequest);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://api.minimax.io/v1/image_generation");
    const body = JSON.parse((init as RequestInit).body as string);
    // Catalog id is `minimax-image-01`, API model param must be `image-01`.
    expect(body.model).toBe("image-01");
    expect(body.response_format).toBe("base64");
    expect(body.aspect_ratio).toBe("16:9");
    expect(body.n).toBe(1);
    expect(
      ((init as RequestInit).headers as Record<string, string>).Authorization,
    ).toContain("minimax-key");

    expect(result.outputs).toHaveLength(1);
    expect([...result.outputs[0]!.bytes]).toEqual([...IMAGE_BYTES]);
    expect(result.outputs[0]!.mimeType).toBe("image/jpeg");
  });

  it("sends width/height instead of aspect_ratio when a size is supplied", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        data: { image_base64: [IMAGE_B64] },
        base_resp: { status_code: 0 },
      }),
    );
    const p = makeProvider(fetchMock as unknown as typeof fetch);
    await p.generate({ ...baseRequest, aspectRatio: undefined, size: "1024x768" });
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.width).toBe(1024);
    expect(body.height).toBe(768);
    expect(body.aspect_ratio).toBeUndefined();
  });

  it("maps a reference image to subject_reference", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "minimax-img-"));
    const refPath = path.join(dir, "ref.png");
    await writeFile(refPath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    try {
      const fetchMock = vi.fn().mockResolvedValue(
        jsonResponse(200, {
          data: { image_base64: [IMAGE_B64] },
          base_resp: { status_code: 0 },
        }),
      );
      const p = makeProvider(fetchMock as unknown as typeof fetch);
      await p.generate({
        ...baseRequest,
        references: [{ path: refPath, role: "character" }],
      });
      const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
      expect(body.subject_reference).toHaveLength(1);
      expect(body.subject_reference[0].type).toBe("character");
      expect(String(body.subject_reference[0].image_file)).toMatch(/^data:image\//);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("throws when MiniMax returns a non-zero base_resp status_code", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        base_resp: { status_code: 2013, status_msg: "invalid params" },
      }),
    );
    const p = makeProvider(fetchMock as unknown as typeof fetch);
    await expect(p.generate(baseRequest)).rejects.toThrow(/invalid params/);
  });

  it("test(): authentication failure status_code → ok=false", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, { base_resp: { status_code: 1004, status_msg: "invalid api key" } }),
    );
    const p = makeProvider(fetchMock as unknown as typeof fetch);
    const res = await p.test!();
    expect(res.ok).toBe(false);
    const [url] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("/query/video_generation?task_id=");
  });

  it("test(): valid key (benign status_code) → ok=true", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, { base_resp: { status_code: 2013, status_msg: "task not found" } }),
    );
    const p = makeProvider(fetchMock as unknown as typeof fetch);
    const res = await p.test!();
    expect(res.ok).toBe(true);
  });
});
