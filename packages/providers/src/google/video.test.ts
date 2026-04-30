import { describe, expect, it, vi } from "vitest";
import { ProviderError, type VideoRequest } from "@imagine/core";
import { GoogleVideoProvider, type GoogleGenAIVideoClientLike } from "./video.js";
import { GOOGLE_VIDEO_MODELS } from "../catalog/test-fixtures.js";

interface FakeClient {
  models: {
    generateVideos: ReturnType<typeof vi.fn>;
    generateImages: ReturnType<typeof vi.fn>;
    generateContent: ReturnType<typeof vi.fn>;
    list: ReturnType<typeof vi.fn>;
  };
  operations: {
    getVideosOperation: ReturnType<typeof vi.fn>;
  };
}

function makeFakeClient(): FakeClient {
  return {
    models: {
      generateVideos: vi.fn(),
      generateImages: vi.fn(),
      generateContent: vi.fn(),
      list: vi.fn(),
    },
    operations: {
      getVideosOperation: vi.fn(),
    },
  };
}

function bytesResponse(payload: Uint8Array, mime = "video/mp4"): Response {
  return new Response(payload, { status: 200, headers: { "content-type": mime } });
}

function makeProvider(client: FakeClient, fetcher?: typeof fetch): GoogleVideoProvider {
  const opts: ConstructorParameters<typeof GoogleVideoProvider>[0] = {
    apiKey: "google-key",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    models: new Map(Object.entries(GOOGLE_VIDEO_MODELS)),
    client: client as unknown as GoogleGenAIVideoClientLike,
  };
  if (fetcher) opts.fetch = fetcher;
  return new GoogleVideoProvider(opts);
}

const baseRequest: VideoRequest = {
  prompt: "a slow cinematic pan over an alpine lake at dawn",
  providerId: "google",
  model: "veo-3.0-generate-001",
  durationSec: 8,
  fps: 24,
  resolution: "720p",
  aspectRatio: "16:9",
  references: [],
  assetIds: [],
};

const OP_NAME = "models/veo-3.0-generate-001/operations/abc123";

describe("GoogleVideoProvider", () => {
  it("submit calls SDK generateVideos and returns op name as providerJobId", async () => {
    const client = makeFakeClient();
    client.models.generateVideos.mockResolvedValue({ name: OP_NAME });
    const p = makeProvider(client);
    const handle = await p.submit(baseRequest);
    expect(handle).toEqual({ providerId: "google", providerJobId: OP_NAME });
    expect(client.models.generateVideos).toHaveBeenCalledTimes(1);
    const [params] = client.models.generateVideos.mock.calls[0]!;
    expect(params).toMatchObject({
      model: "veo-3.0-generate-001",
      prompt: baseRequest.prompt,
    });
    expect(params.config).toMatchObject({
      aspectRatio: "16:9",
      durationSeconds: 8,
      resolution: "720p",
      personGeneration: "allow_all",
    });
  });

  it("poll returns 'running' while !done, then 'succeeded' on done", async () => {
    const client = makeFakeClient();
    client.operations.getVideosOperation
      .mockResolvedValueOnce({ name: OP_NAME, done: false })
      .mockResolvedValueOnce({
        name: OP_NAME,
        done: true,
        response: {
          generatedVideos: [
            { video: { uri: "https://generativelanguage.googleapis.com/v1beta/files/v.mp4" } },
          ],
        },
      });
    const p = makeProvider(client);
    const h = { providerId: "google", providerJobId: OP_NAME };
    expect((await p.poll(h)).state).toBe("running");
    expect((await p.poll(h)).state).toBe("succeeded");
  });

  it("poll surfaces failure error.message", async () => {
    const client = makeFakeClient();
    client.operations.getVideosOperation.mockResolvedValue({
      name: OP_NAME,
      done: true,
      error: { code: 9, message: "content blocked", status: "INVALID_ARGUMENT" },
    });
    const p = makeProvider(client);
    const status = await p.poll({ providerId: "google", providerJobId: OP_NAME });
    expect(status.state).toBe("failed");
    expect(status.errorMessage).toBe("content blocked");
  });

  it("fetch downloads MP4 from generatedVideos[0].video.uri (raw HTTP)", async () => {
    const client = makeFakeClient();
    client.operations.getVideosOperation.mockResolvedValue({
      name: OP_NAME,
      done: true,
      response: {
        generatedVideos: [
          { video: { uri: "https://generativelanguage.googleapis.com/v1beta/files/v.mp4" } },
        ],
      },
    });
    const mp4 = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70]);
    const fetchMock = vi.fn().mockResolvedValue(bytesResponse(mp4));
    const p = makeProvider(client, fetchMock as unknown as typeof fetch);
    const r = await p.fetch({ providerId: "google", providerJobId: OP_NAME });
    expect(r.output.mimeType).toBe("video/mp4");
    expect(Array.from(r.output.bytes)).toEqual(Array.from(mp4));
    const downloadUrl = String(fetchMock.mock.calls[0]![0]);
    expect(downloadUrl).toContain("key=google-key");
  });

  it("fetch falls back to legacy generateVideoResponse.generatedSamples shape", async () => {
    const client = makeFakeClient();
    client.operations.getVideosOperation.mockResolvedValue({
      name: OP_NAME,
      done: true,
      response: {
        generateVideoResponse: {
          generatedSamples: [{ video: { uri: "https://example/legacy.mp4" } }],
        },
      },
    });
    const mp4 = new Uint8Array([0x66, 0x74, 0x79, 0x70]);
    const fetchMock = vi.fn().mockResolvedValue(bytesResponse(mp4));
    const p = makeProvider(client, fetchMock as unknown as typeof fetch);
    const r = await p.fetch({ providerId: "google", providerJobId: OP_NAME });
    expect(Array.from(r.output.bytes)).toEqual(Array.from(mp4));
  });

  it("fetch throws ProviderError when the response carries no video URI", async () => {
    const client = makeFakeClient();
    client.operations.getVideosOperation.mockResolvedValue({
      name: OP_NAME,
      done: true,
      response: { generatedVideos: [] },
    });
    const p = makeProvider(client);
    await expect(
      p.fetch({ providerId: "google", providerJobId: OP_NAME }),
    ).rejects.toBeInstanceOf(ProviderError);
  });

  it("test() returns ok with veo model match on /models listing", async () => {
    const client = makeFakeClient();
    client.models.list.mockResolvedValue({
      data: [
        { name: "models/veo-3.0-generate-001" },
        { name: "models/gemini-2.5-flash-image" },
      ],
    });
    const p = makeProvider(client);
    const r = await p.test();
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.sampleModelId).toBe("veo-3.0-generate-001");
    }
  });

  it("test() returns failure when SDK throws", async () => {
    const client = makeFakeClient();
    client.models.list.mockRejectedValue(new Error("auth failed"));
    const p = makeProvider(client);
    const r = await p.test();
    expect(r.ok).toBe(false);
  });
});
