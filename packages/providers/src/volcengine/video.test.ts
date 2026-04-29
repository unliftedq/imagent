import { describe, expect, it, vi } from "vitest";
import { ProviderHttpError, type VideoRequest } from "@imagine/core";
import { VolcengineVideoProvider } from "./video.js";
import { VOLCENGINE_VIDEO_MODELS } from "./catalog.js";

function makeProvider(fetcher: typeof fetch) {
  return new VolcengineVideoProvider({
    apiKey: "volc-key",
    baseUrl: "https://ark.example/api/v3",
    region: "cn-beijing",
    models: new Map(Object.entries(VOLCENGINE_VIDEO_MODELS)),
    fetch: fetcher,
  });
}

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function bytesResponse(payload: Uint8Array, mime = "video/mp4"): Response {
  return new Response(payload, { status: 200, headers: { "content-type": mime } });
}

const baseRequest: VideoRequest = {
  prompt: "rotating crystal in a misty forest",
  providerId: "volcengine",
  model: "seedance-1.0-pro",
  durationSec: 5,
  fps: 24,
  resolution: "720p",
  references: [],
  assetIds: [],
};

describe("VolcengineVideoProvider", () => {
  it("submit POSTs to /contents/generations/tasks and returns job id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { id: "task-1" }));
    const p = makeProvider(fetchMock as unknown as typeof fetch);
    const handle = await p.submit(baseRequest);
    expect(handle).toEqual({ providerId: "volcengine", providerJobId: "task-1" });
    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://ark.example/api/v3/contents/generations/tasks");
  });

  it("poll returns 'running' twice then 'succeeded'", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { status: "running", progress: 0.3 }))
      .mockResolvedValueOnce(jsonResponse(200, { status: "running", progress: 0.7 }))
      .mockResolvedValueOnce(jsonResponse(200, { status: "succeeded" }));
    const p = makeProvider(fetchMock as unknown as typeof fetch);
    const h = { providerId: "volcengine", providerJobId: "task-1" };
    expect((await p.poll(h)).state).toBe("running");
    expect((await p.poll(h)).state).toBe("running");
    expect((await p.poll(h)).state).toBe("succeeded");
  });

  it("polling-failure: 'failed' status surfaces error message", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, { status: "failed", error: { code: "INTERNAL", message: "kaput" } }),
    );
    const p = makeProvider(fetchMock as unknown as typeof fetch);
    const status = await p.poll({ providerId: "volcengine", providerJobId: "task-1" });
    expect(status.state).toBe("failed");
    expect(status.errorMessage).toBe("kaput");
  });

  it("fetch downloads the MP4 once succeeded", async () => {
    const mp4 = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70]);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(200, {
          status: "succeeded",
          content: {
            video_url: "https://cdn.example/task-1.mp4",
            duration_ms: 5000,
            width: 1280,
            height: 720,
          },
        }),
      )
      .mockResolvedValueOnce(bytesResponse(mp4));
    const p = makeProvider(fetchMock as unknown as typeof fetch);
    const r = await p.fetch({ providerId: "volcengine", providerJobId: "task-1" });
    expect(r.output.mimeType).toBe("video/mp4");
    expect(Array.from(r.output.bytes)).toEqual(Array.from(mp4));
    expect(r.output.durationMs).toBe(5000);
    expect(r.output.width).toBe(1280);
  });

  it("4xx error path surfaces ProviderHttpError", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(403, { error: "no" }));
    const p = makeProvider(fetchMock as unknown as typeof fetch);
    await expect(p.submit(baseRequest)).rejects.toBeInstanceOf(ProviderHttpError);
  });

  it("retries 429 then succeeds on submit", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(429, {}, { "retry-after": "0" }))
      .mockResolvedValueOnce(jsonResponse(200, { id: "task-2" }));
    const p = makeProvider(fetchMock as unknown as typeof fetch);
    const h = await p.submit(baseRequest);
    expect(h.providerJobId).toBe("task-2");
  });
});
