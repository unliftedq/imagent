import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ProviderError, type VideoRequest } from "@imagent/core";
import { describe, expect, it, vi } from "vitest";
import { BYTEDANCE_VIDEO_MODELS } from "../catalog/test-fixtures.js";
import { ByteDanceVideoProvider } from "./video.js";

const MP4_BYTES = new Uint8Array([
  0x00,
  0x00,
  0x00,
  0x18,
  0x66,
  0x74,
  0x79,
  0x70, // ftyp box header
]);

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function videoResponse(bytes = MP4_BYTES, mimeType = "video/mp4"): Response {
  return new Response(bytes, {
    status: 200,
    headers: { "content-type": mimeType },
  });
}

function makeProvider(fetcher: typeof fetch): ByteDanceVideoProvider {
  return new ByteDanceVideoProvider({
    apiKey: "volc-key",
    endpoint: "https://ark.cn-beijing.volces.com/api/v3",
    models: new Map(Object.entries(BYTEDANCE_VIDEO_MODELS)),
    fetch: fetcher,
  });
}

const baseRequest: VideoRequest = {
  prompt: "rotating crystal in a misty forest",
  providerId: "bytedance",
  model: "dreamina-seedance-2-0-260128",
  durationSec: 5,
  fps: 24,
  resolution: "720p",
  aspectRatio: "16:9",
  firstFrame: "https://example.com/first.png",
  lastFrame: "https://example.com/last.png",
  references: [{ path: "https://example.com/ref.png", role: "freeform" }],
  assetIds: [],
};

describe("ByteDanceVideoProvider", () => {
  it("submit posts a ModelArk task and returns the remote task id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { id: "task-123" }));
    const p = makeProvider(fetchMock as unknown as typeof fetch);

    const handle = await p.submit(baseRequest);

    expect(handle).toMatchObject({
      providerId: "bytedance",
      providerJobId: "task-123",
      pollingUrl: "/contents/generations/tasks/task-123",
      meta: { durationSec: 5 },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ Authorization: "Bearer volc-key" });
    expect(JSON.parse(String(init.body))).toEqual({
      model: "dreamina-seedance-2-0-260128",
      content: [
        { type: "text", text: "rotating crystal in a misty forest" },
        {
          type: "image_url",
          image_url: { url: "https://example.com/first.png" },
          role: "first_frame",
        },
        {
          type: "image_url",
          image_url: { url: "https://example.com/last.png" },
          role: "last_frame",
        },
        {
          type: "image_url",
          image_url: { url: "https://example.com/ref.png" },
          role: "reference_image",
        },
      ],
      ratio: "16:9",
      duration: 5,
      fps: 24,
      resolution: "720p",
    });
  });

  it("submit converts local image files to ModelArk data image URLs", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "imagent-bytedance-video-"));
    try {
      const firstFrame = path.join(dir, "first.png");
      await writeFile(firstFrame, new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { id: "task-123" }));
      const p = makeProvider(fetchMock as unknown as typeof fetch);

      await p.submit({
        ...baseRequest,
        firstFrame,
        lastFrame: "data:image/webp;base64,d2VicA==",
        references: [{ path: "asset-id-123", role: "freeform" }],
      });

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(String(init.body));
      expect(body.content).toEqual([
        { type: "text", text: "rotating crystal in a misty forest" },
        {
          type: "image_url",
          image_url: { url: "data:image/png;base64,iVBORw==" },
          role: "first_frame",
        },
        {
          type: "image_url",
          image_url: { url: "data:image/webp;base64,d2VicA==" },
          role: "last_frame",
        },
        {
          type: "image_url",
          image_url: { url: "asset-id-123" },
          role: "reference_image",
        },
      ]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("poll maps ModelArk task statuses", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { id: "task-123", status: "running" }))
      .mockResolvedValueOnce(jsonResponse(200, { id: "task-123", status: "succeeded" }))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          id: "task-123",
          status: "failed",
          error: { message: "upstream model error" },
        }),
      );
    const p = makeProvider(fetchMock as unknown as typeof fetch);
    const handle = { providerId: "bytedance", providerJobId: "task-123" };

    expect(await p.poll(handle)).toEqual({ state: "running" });
    expect(await p.poll(handle)).toEqual({ state: "succeeded" });
    expect(await p.poll(handle)).toEqual({ state: "failed", errorMessage: "upstream model error" });
  });

  it("fetch downloads the video bytes once the task has succeeded", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(200, {
          id: "task-123",
          model: "dreamina-seedance-2-0-260128",
          status: "succeeded",
          content: { video_url: "https://cdn.example.com/out.mp4" },
          usage: { completion_tokens: 42 },
        }),
      )
      .mockResolvedValueOnce(videoResponse());
    const p = makeProvider(fetchMock as unknown as typeof fetch);

    const r = await p.fetch({
      providerId: "bytedance",
      providerJobId: "task-123",
      meta: { durationSec: 5 },
    });

    expect(Array.from(r.output.bytes)).toEqual(Array.from(MP4_BYTES));
    expect(r.output.mimeType).toBe("video/mp4");
    expect(r.output.durationMs).toBe(5000);
    expect(r.output.raw).toEqual({
      taskId: "task-123",
      model: "dreamina-seedance-2-0-260128",
      usage: { completion_tokens: 42 },
    });
    expect(fetchMock.mock.calls[1]?.[0]).toBe("https://cdn.example.com/out.mp4");
  });

  it("fetch before the task succeeds throws ProviderError", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { id: "task-123", status: "running" }));
    const p = makeProvider(fetchMock as unknown as typeof fetch);

    await expect(
      p.fetch({ providerId: "bytedance", providerJobId: "task-123" }),
    ).rejects.toBeInstanceOf(ProviderError);
  });

  it("cancel deletes the remote ModelArk task", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const p = makeProvider(fetchMock as unknown as typeof fetch);

    await p.cancel({ providerId: "bytedance", providerJobId: "task-123" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks/task-123",
    );
    expect(init.method).toBe("DELETE");
  });

  it("test() returns ok against /models listing via probe http", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        data: [{ id: "dreamina-seedance-2-0-260128" }, { id: "seedream-5-0-260128" }],
      }),
    );
    const p = makeProvider(fetchMock as unknown as typeof fetch);
    const r = await p.test();
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.sampleModelId).toBe("dreamina-seedance-2-0-260128");
    }
  });

  it("test() returns failure on 401", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(401, { error: "bad key" }));
    const p = makeProvider(fetchMock as unknown as typeof fetch);
    const r = await p.test();
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(401);
    }
  });
});
