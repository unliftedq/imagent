import { describe, expect, it, vi } from "vitest";
import { ProviderError, type VideoRequest } from "@imagent/core";
import { XaiVideoProvider, type XaiVideoModelFactory } from "./video.js";
import { XAI_VIDEO_MODELS } from "../catalog/test-fixtures.js";

const MP4_BYTES = new Uint8Array([
  0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, // ftyp box header
]);

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** `VideoModelV4Result` shape returned by `doGenerate` — discriminated union per data type. */
type FakeDoGenerateResult = {
  videos: Array<{ type: "binary"; data: Uint8Array; mediaType: string }>;
  warnings: never[];
  response: { timestamp: Date; modelId: string; headers: undefined };
};

interface FakeModelOptions {
  /** Override the doGenerate bytes. */
  bytes?: Uint8Array;
  /** Override the doGenerate behaviour completely. */
  doGenerate?: (opts: { abortSignal?: AbortSignal }) => Promise<FakeDoGenerateResult>;
}

function makeDefaultResult(modelId: string, bytes: Uint8Array): FakeDoGenerateResult {
  return {
    videos: [{ type: "binary", data: bytes, mediaType: "video/mp4" }],
    warnings: [] as never[],
    response: { timestamp: new Date(), modelId, headers: undefined },
  };
}

/**
 * Fake `Experimental_VideoModelV4` — only the fields that
 * `experimental_generateVideo` actually reads. The result shape is the V4
 * discriminated `VideoModelV4VideoData` union (`type: 'binary'` here).
 */
function makeFakeModel(modelId: string, opts: FakeModelOptions = {}) {
  const stub = vi.fn(async ({ abortSignal }: { abortSignal?: AbortSignal }) => {
    if (abortSignal?.aborted) {
      const err = new Error("operation was aborted");
      (err as { name?: string }).name = "AbortError";
      throw err;
    }
    if (opts.doGenerate) return opts.doGenerate({ abortSignal });
    return makeDefaultResult(modelId, opts.bytes ?? MP4_BYTES);
  });
  return {
    specificationVersion: "v4",
    provider: "xai-test",
    modelId,
    maxVideosPerCall: 1,
    doGenerate: stub,
  } as unknown as ReturnType<XaiVideoModelFactory>;
}

function makeProvider(
  factory: XaiVideoModelFactory,
  opts: { fetch?: typeof fetch } = {},
): XaiVideoProvider {
  return new XaiVideoProvider({
    apiKey: "xai-key",
    baseUrl: "https://api.x.ai/v1",
    models: new Map(Object.entries(XAI_VIDEO_MODELS)),
    modelFactory: factory,
    ...(opts.fetch ? { fetch: opts.fetch } : {}),
  });
}

const baseRequest: VideoRequest = {
  prompt: "a hot air balloon over snowy peaks at golden hour",
  providerId: "xai",
  model: "grok-imagine-video",
  durationSec: 10,
  fps: 24,
  resolution: "720p",
  aspectRatio: "16:9",
  references: [],
  assetIds: [],
};

/**
 * Wait for queued microtasks + I/O ticks to flush. The Vercel SDK's
 * `experimental_generateVideo` chains several awaits (model resolution,
 * `invokeModelMaxVideosPerCall`, the retry wrapper, then the doGenerate
 * promise itself) so we need multiple tick boundaries before our submit-side
 * `.then(...)` can run.
 */
async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 8; i++) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

describe("XaiVideoProvider", () => {
  it("submit returns a synthetic providerJobId and invokes the SDK model", async () => {
    const factory = vi.fn((id: string) => makeFakeModel(id));
    const p = makeProvider(factory);
    const handle = await p.submit(baseRequest);
    expect(handle.providerId).toBe("xai");
    expect(typeof handle.providerJobId).toBe("string");
    expect(handle.providerJobId.length).toBeGreaterThan(0);
    expect(factory).toHaveBeenCalledWith("grok-imagine-video");
  });

  it("poll returns 'running' immediately, 'succeeded' after the SDK promise resolves", async () => {
    let resolveGen!: (v: FakeDoGenerateResult) => void;
    const pending = new Promise<FakeDoGenerateResult>((res) => {
      resolveGen = res;
    });
    const factory = vi.fn((id: string) =>
      makeFakeModel(id, { doGenerate: () => pending }),
    );
    const p = makeProvider(factory);
    const handle = await p.submit(baseRequest);

    // Before settlement: running.
    expect((await p.poll(handle)).state).toBe("running");

    // Settle and flush.
    resolveGen(makeDefaultResult("grok-imagine-video", MP4_BYTES));
    await flushMicrotasks();

    expect((await p.poll(handle)).state).toBe("succeeded");
  });

  it("poll returns 'failed' with errorMessage after the SDK promise rejects", async () => {
    const factory = vi.fn((id: string) =>
      makeFakeModel(id, {
        doGenerate: async () => {
          throw new Error("upstream model error");
        },
      }),
    );
    const p = makeProvider(factory);
    const handle = await p.submit(baseRequest);
    await flushMicrotasks();
    const status = await p.poll(handle);
    expect(status.state).toBe("failed");
    expect(status.errorMessage).toMatch(/upstream model error/);
  });

  it("cancel aborts the underlying signal and removes the entry; subsequent fetch throws", async () => {
    const factory = vi.fn((id: string) =>
      makeFakeModel(id, {
        doGenerate: ({ abortSignal }) =>
          new Promise<never>((_resolve, reject) => {
            abortSignal?.addEventListener("abort", () => {
              const err = new Error("operation was aborted");
              (err as { name?: string }).name = "AbortError";
              reject(err);
            });
          }),
      }),
    );
    const p = makeProvider(factory);
    const handle = await p.submit(baseRequest);
    await p.cancel(handle);
    await flushMicrotasks();
    // After cancel the entry is removed — `fetch` reports unknown id.
    await expect(p.fetch(handle)).rejects.toBeInstanceOf(ProviderError);
    // poll on a removed handle reports failed/unknown.
    const status = await p.poll(handle);
    expect(status.state).toBe("failed");
    expect(status.errorMessage).toMatch(/unknown providerJobId/);
  });

  it("fetch returns the bytes once the job has succeeded", async () => {
    const factory = vi.fn((id: string) => makeFakeModel(id));
    const p = makeProvider(factory);
    const handle = await p.submit(baseRequest);
    await flushMicrotasks();
    const r = await p.fetch(handle);
    expect(r.output.mimeType).toMatch(/^video\//);
    expect(Array.from(r.output.bytes)).toEqual(Array.from(MP4_BYTES));
    expect(r.output.durationMs).toBe(10000);
  });

  it("fetch before the job succeeds throws ProviderError", async () => {
    const factory = vi.fn((id: string) =>
      makeFakeModel(id, {
        doGenerate: () => new Promise(() => {}), // never resolves
      }),
    );
    const p = makeProvider(factory);
    const handle = await p.submit(baseRequest);
    await expect(p.fetch(handle)).rejects.toBeInstanceOf(ProviderError);
  });

  it("test() returns ok against /v1/models listing via probe http", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(200, {
          data: [{ id: "grok-imagine-video" }, { id: "grok-imagine-image-quality" }],
        }),
      );
    const factory = vi.fn((id: string) => makeFakeModel(id));
    const p = makeProvider(factory, { fetch: fetchMock as unknown as typeof fetch });
    const r = await p.test();
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.sampleModelId).toBe("grok-imagine-video");
    }
  });

  it("test() returns failure on 401", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(401, { error: "bad key" }));
    const factory = vi.fn((id: string) => makeFakeModel(id));
    const p = makeProvider(factory, { fetch: fetchMock as unknown as typeof fetch });
    const r = await p.test();
    expect(r.ok).toBe(false);
  });
});
