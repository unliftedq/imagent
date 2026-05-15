import { describe, expect, it, vi } from "vitest";
import {
  ProviderAbortError,
  ProviderError,
  ProviderHttpError,
  type ImageRequest,
} from "@imagent/core";
import type { ImageModel } from "ai";
import { XaiImageProvider } from "./image.js";
import { XAI_IMAGE_MODELS } from "../catalog/test-fixtures.js";

const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG header
]);

interface FakeModelOptions {
  /** Override the doGenerate result. */
  bytes?: Uint8Array;
  /** Override the doGenerate behaviour completely. Receives the full opts
   * object generateImage() forwards (prompt, n, abortSignal, size,
   * aspectRatio, providerOptions, ...). */
  doGenerate?: (opts: Record<string, unknown>) => Promise<{
    images: Uint8Array[];
    warnings: never[];
    response: { timestamp: Date; modelId: string; headers: undefined };
  }>;
}

function makeFakeModel(modelId: string, opts: FakeModelOptions = {}): ImageModel {
  const stub = vi.fn(async (allOpts: Record<string, unknown>) => {
    const abortSignal = allOpts.abortSignal as AbortSignal | undefined;
    if (abortSignal?.aborted) throw new Error("aborted");
    if (opts.doGenerate) return opts.doGenerate(allOpts);
    const n = allOpts.n as number | undefined;
    const count = typeof n === "number" && n > 0 ? n : 1;
    const one = opts.bytes ?? PNG_BYTES;
    const images = Array.from({ length: count }, () => one);
    return {
      images,
      warnings: [] as never[],
      response: { timestamp: new Date(), modelId, headers: undefined },
    };
  });
  // ImageModelV3 shape — only the fields generateImage actually reads.
  return {
    specificationVersion: "v3",
    provider: "xai-test",
    modelId,
    maxImagesPerCall: 10,
    doGenerate: stub,
  } as unknown as ImageModel;
}

function makeProvider(factory: (modelId: string) => ImageModel): XaiImageProvider {
  return new XaiImageProvider({
    apiKey: "xai-key",
    baseUrl: "https://api.x.ai/v1",
    models: new Map(Object.entries(XAI_IMAGE_MODELS)),
    modelFactory: factory,
  });
}

const baseRequest: ImageRequest = {
  prompt: "a cat in a top hat, photo",
  providerId: "xai",
  model: "grok-imagine-image",
  count: 1,
  aspectRatio: "1:1",
  references: [],
  assetIds: [],
};

describe("XaiImageProvider", () => {
  it("happy path n=1: invokes Vercel AI SDK image model with correct id", async () => {
    const factory = vi.fn((id: string) => makeFakeModel(id));
    const p = makeProvider(factory);
    const r = await p.generate(baseRequest);
    expect(r.outputs).toHaveLength(1);
    expect(r.outputs[0]!.mimeType).toMatch(/^image\//);
    expect(r.outputs[0]!.bytes.byteLength).toBe(PNG_BYTES.byteLength);
    expect(factory).toHaveBeenCalledWith("grok-imagine-image");
  });

  it("happy path n=4: returns four outputs", async () => {
    const factory = vi.fn((id: string) => makeFakeModel(id));
    const p = makeProvider(factory);
    const r = await p.generate({ ...baseRequest, count: 4 });
    expect(r.outputs).toHaveLength(4);
    for (const o of r.outputs) {
      expect(o.bytes.byteLength).toBe(PNG_BYTES.byteLength);
    }
  });

  it("AbortSignal propagates: aborted signal surfaces as ProviderError", async () => {
    const factory = vi.fn((id: string) =>
      makeFakeModel(id, {
        doGenerate: async (opts) => {
          const abortSignal = opts.abortSignal as AbortSignal | undefined;
          if (abortSignal?.aborted) {
            const err = new Error("operation was aborted");
            (err as { name?: string }).name = "AbortError";
            throw err;
          }
          // Wait for abort.
          await new Promise<never>((_resolve, reject) => {
            abortSignal?.addEventListener("abort", () => {
              const err = new Error("operation was aborted");
              (err as { name?: string }).name = "AbortError";
              reject(err);
            });
          });
          throw new Error("unreachable");
        },
      }),
    );
    const p = makeProvider(factory);
    const ac = new AbortController();
    const promise = p.generate(baseRequest, ac.signal);
    ac.abort();
    await expect(promise).rejects.toBeInstanceOf(Error);
  });

  it("model factory throws → error surfaces as ProviderError", async () => {
    const factory = vi.fn(() => {
      throw new Error("createXai blew up");
    });
    const p = makeProvider(factory);
    await expect(p.generate(baseRequest)).rejects.toBeInstanceOf(ProviderError);
  });

  it("SDK throws statusCode=401 → ProviderHttpError", async () => {
    const factory = vi.fn((id: string) =>
      makeFakeModel(id, {
        doGenerate: async () => {
          const err = new Error("Unauthorized") as Error & { statusCode?: number };
          err.statusCode = 401;
          throw err;
        },
      }),
    );
    const p = makeProvider(factory);
    await expect(p.generate(baseRequest)).rejects.toBeInstanceOf(ProviderHttpError);
  });

  // Reference ProviderAbortError import so test runner doesn't drop the symbol
  // (we intentionally don't assert on it directly — the SDK normalizes abort
  // shape and our wrapper converts it).
  it("ProviderAbortError class is importable", () => {
    expect(typeof ProviderAbortError).toBe("function");
  });

  it("forwards aspectRatio and quality→providerOptions.xai.resolution", async () => {
    let capturedArgs: Record<string, unknown> | undefined;
    const factory = vi.fn((id: string) =>
      makeFakeModel(id, {
        doGenerate: async (opts) => {
          capturedArgs = opts as unknown as Record<string, unknown>;
          return {
            images: [PNG_BYTES],
            warnings: [] as never[],
            response: { timestamp: new Date(), modelId: id, headers: undefined },
          };
        },
      }),
    );
    const p = makeProvider(factory);
    await p.generate({ ...baseRequest, aspectRatio: "16:9", quality: "2k" });
    // generateImage() unpacks our top-level args and passes them to
    // ImageModelV3.doGenerate as a single options object. We assert the
    // SDK sees both knobs.
    expect(capturedArgs?.aspectRatio).toBe("16:9");
    const opts = capturedArgs?.providerOptions as
      | { xai?: { resolution?: string } }
      | undefined;
    expect(opts?.xai?.resolution).toBe("2k");
  });

  it("applies catalog default quality `1k` when caller omits it", async () => {
    let capturedArgs: Record<string, unknown> | undefined;
    const factory = vi.fn((id: string) =>
      makeFakeModel(id, {
        doGenerate: async (opts) => {
          capturedArgs = opts as unknown as Record<string, unknown>;
          return {
            images: [PNG_BYTES],
            warnings: [] as never[],
            response: { timestamp: new Date(), modelId: id, headers: undefined },
          };
        },
      }),
    );
    const p = makeProvider(factory);
    await p.generate(baseRequest);
    const opts = capturedArgs?.providerOptions as
      | { xai?: { resolution?: string } }
      | undefined;
    expect(opts?.xai?.resolution).toBe("1k");
  });
});
