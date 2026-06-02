import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ProviderError, type VideoRequest } from "@imagent/core";
import { describe, expect, it, vi } from "vitest";
import { MINIMAX_VIDEO_MODELS } from "../catalog/test-fixtures.js";
import { MiniMaxVideoProvider } from "./video.js";

const MP4_BYTES = new Uint8Array([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70]);

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function videoResponse(bytes = MP4_BYTES, mimeType = "video/mp4"): Response {
  return new Response(bytes, { status: 200, headers: { "content-type": mimeType } });
}

function makeProvider(fetcher: typeof fetch): MiniMaxVideoProvider {
  return new MiniMaxVideoProvider({
    apiKey: "minimax-key",
    models: new Map(Object.entries(MINIMAX_VIDEO_MODELS)),
    fetch: fetcher,
  });
}

const baseRequest: VideoRequest = {
  prompt: "a paper boat drifting down a rain-soaked street",
  providerId: "minimax",
  model: "MiniMax-Hailuo-2.3",
  durationSec: 6,
  resolution: "1080P",
  references: [],
  assetIds: [],
};

describe("MiniMaxVideoProvider", () => {
  it("submit posts video_generation and returns the task id", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { task_id: "task-1", base_resp: { status_code: 0 } }));
    const p = makeProvider(fetchMock as unknown as typeof fetch);

    const handle = await p.submit(baseRequest);

    expect(handle).toMatchObject({
      providerId: "minimax",
      providerJobId: "task-1",
      meta: { durationSec: 6 },
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.minimax.io/v1/video_generation");
    expect(init.method).toBe("POST");
    expect(String((init.headers as Record<string, string>).Authorization)).toContain("minimax-key");
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe("MiniMax-Hailuo-2.3");
    expect(body.prompt).toBe(baseRequest.prompt);
    expect(body.duration).toBe(6);
    expect(body.resolution).toBe("1080P");
  });

  it("submit converts a local first frame to a data URL", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "minimax-video-"));
    try {
      const firstFrame = path.join(dir, "first.png");
      await writeFile(firstFrame, new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
      const fetchMock = vi
        .fn()
        .mockResolvedValue(jsonResponse(200, { task_id: "task-1", base_resp: { status_code: 0 } }));
      const p = makeProvider(fetchMock as unknown as typeof fetch);

      await p.submit({ ...baseRequest, firstFrame });

      const body = JSON.parse(String((fetchMock.mock.calls[0]![1] as RequestInit).body));
      expect(String(body.first_frame_image)).toMatch(/^data:image\//);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("submit throws when base_resp reports an error", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, { base_resp: { status_code: 1008, status_msg: "insufficient balance" } }),
    );
    const p = makeProvider(fetchMock as unknown as typeof fetch);
    await expect(p.submit(baseRequest)).rejects.toThrow(/insufficient balance/);
  });

  it("poll maps MiniMax task statuses", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { status: "Queueing", base_resp: { status_code: 0 } }))
      .mockResolvedValueOnce(jsonResponse(200, { status: "Processing", base_resp: { status_code: 0 } }))
      .mockResolvedValueOnce(jsonResponse(200, { status: "Success", file_id: "f1", base_resp: { status_code: 0 } }))
      .mockResolvedValueOnce(
        jsonResponse(200, { status: "Fail", base_resp: { status_code: 0, status_msg: "model error" } }),
      );
    const p = makeProvider(fetchMock as unknown as typeof fetch);
    const handle = { providerId: "minimax", providerJobId: "task-1" };

    expect(await p.poll(handle)).toEqual({ state: "queued" });
    expect(await p.poll(handle)).toEqual({ state: "running" });
    expect(await p.poll(handle)).toEqual({ state: "succeeded" });
    expect(await p.poll(handle)).toEqual({ state: "failed", errorMessage: "model error" });
  });

  it("fetch retrieves the file download url then streams the bytes", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(200, { status: "Success", file_id: "file-9", base_resp: { status_code: 0 } }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          file: { file_id: 9, download_url: "https://cdn.minimax.io/out.mp4" },
          base_resp: { status_code: 0 },
        }),
      )
      .mockResolvedValueOnce(videoResponse());
    const p = makeProvider(fetchMock as unknown as typeof fetch);

    const r = await p.fetch({
      providerId: "minimax",
      providerJobId: "task-1",
      meta: { durationSec: 6 },
    });

    expect(Array.from(r.output.bytes)).toEqual(Array.from(MP4_BYTES));
    expect(r.output.mimeType).toBe("video/mp4");
    expect(r.output.durationMs).toBe(6000);
    expect(r.output.raw).toEqual({ taskId: "task-1", fileId: "file-9" });
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("/files/retrieve?file_id=file-9");
    expect(fetchMock.mock.calls[2]?.[0]).toBe("https://cdn.minimax.io/out.mp4");
  });

  it("fetch before success throws ProviderError", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { status: "Processing", base_resp: { status_code: 0 } }));
    const p = makeProvider(fetchMock as unknown as typeof fetch);
    await expect(
      p.fetch({ providerId: "minimax", providerJobId: "task-1" }),
    ).rejects.toBeInstanceOf(ProviderError);
  });

  it("cancel is a no-op", async () => {
    const fetchMock = vi.fn();
    const p = makeProvider(fetchMock as unknown as typeof fetch);
    await expect(
      p.cancel({ providerId: "minimax", providerJobId: "task-1" }),
    ).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
