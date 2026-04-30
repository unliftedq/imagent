import { describe, expect, it, vi } from "vitest";
import { ProviderError, ProviderHttpError, type ImageRequest } from "@imagine/core";
import { FluxImageProvider } from "./image.js";
import { FLUX_IMAGE_MODELS } from "../catalog/test-fixtures.js";

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function bytesResponse(payload: Uint8Array, mime = "image/png"): Response {
  return new Response(payload, { status: 200, headers: { "content-type": mime } });
}

function makeProvider(fetcher: typeof fetch) {
  return new FluxImageProvider({
    apiKey: "bfl-key",
    models: new Map(Object.entries(FLUX_IMAGE_MODELS)),
    fetch: fetcher,
    sleep: async () => {}, // skip the real wait between polls
  });
}

const baseRequest: ImageRequest = {
  prompt: "obsidian glass cathedral",
  providerId: "flux-bfl",
  model: "flux-2-pro",
  count: 1,
  aspectRatio: "1:1",
  references: [],
  assetIds: [],
};

describe("FluxImageProvider", () => {
  it("happy path: submit + Pending + Ready + getBytes", async () => {
    const samplePng = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(200, { id: "job-1", polling_url: "https://api.bfl.ai/v1/get_result?id=job-1" }),
      )
      .mockResolvedValueOnce(jsonResponse(200, { status: "Pending" }))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          status: "Ready",
          result: { sample: "https://cdn.bfl.ai/img/job-1.png" },
        }),
      )
      .mockResolvedValueOnce(bytesResponse(samplePng));
    const p = makeProvider(fetchMock as unknown as typeof fetch);
    const result = await p.generate(baseRequest);
    expect(result.outputs).toHaveLength(1);
    expect(Array.from(result.outputs[0]!.bytes)).toEqual(Array.from(samplePng));
    expect(fetchMock).toHaveBeenCalledTimes(4);
    const [submitUrl, submitInit] = fetchMock.mock.calls[0]!;
    expect(submitUrl).toBe("https://api.bfl.ai/v1/flux-2-pro");
    expect((submitInit as RequestInit).headers as Record<string, string>).toMatchObject({
      "x-key": "bfl-key",
    });
  });

  it("polling-failure: Error status surfaces ProviderError", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { id: "job-2", polling_url: "https://x/poll" }))
      .mockResolvedValueOnce(jsonResponse(200, { status: "Error", error: "boom" }));
    const p = makeProvider(fetchMock as unknown as typeof fetch);
    await expect(p.generate(baseRequest)).rejects.toBeInstanceOf(ProviderError);
  });

  it("4xx submit error path", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(401, { error: "auth" }));
    const p = makeProvider(fetchMock as unknown as typeof fetch);
    await expect(p.generate(baseRequest)).rejects.toBeInstanceOf(ProviderHttpError);
  });

  it("retries 429 on submit then succeeds", async () => {
    const samplePng = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(429, {}, { "retry-after": "0" }))
      .mockResolvedValueOnce(jsonResponse(200, { id: "job-3", polling_url: "https://x/poll" }))
      .mockResolvedValueOnce(
        jsonResponse(200, { status: "Ready", result: { sample: "https://x/sample.png" } }),
      )
      .mockResolvedValueOnce(bytesResponse(samplePng));
    const p = makeProvider(fetchMock as unknown as typeof fetch);
    const r = await p.generate(baseRequest);
    expect(r.outputs).toHaveLength(1);
  });

  it("polling-success after one Pending tick", async () => {
    const samplePng = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { id: "job-4", polling_url: "https://x/poll" }))
      .mockResolvedValueOnce(jsonResponse(200, { status: "Pending" }))
      .mockResolvedValueOnce(
        jsonResponse(200, { status: "Ready", result: { sample: "https://x/sample.png" } }),
      )
      .mockResolvedValueOnce(bytesResponse(samplePng));
    const p = makeProvider(fetchMock as unknown as typeof fetch);
    const r = await p.generate(baseRequest);
    expect(r.outputs[0]?.bytes.length).toBe(4);
  });
});
