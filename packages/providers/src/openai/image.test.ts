import { describe, expect, it, vi } from "vitest";
import { ProviderHttpError, ProviderRequestError, type ImageRequest } from "@imagine/core";
import { OpenAIImageProvider } from "./image.js";
import { OPENAI_IMAGE_MODELS } from "./catalog.js";

const PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII=";

function makeProvider(fetcher: typeof fetch) {
  return new OpenAIImageProvider({
    apiKey: "sk-test",
    models: new Map(Object.entries(OPENAI_IMAGE_MODELS)),
    fetch: fetcher,
  });
}

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
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
  it("happy path: posts to /images/generations and decodes b64", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        created: 1,
        data: [{ b64_json: PNG_B64 }],
      }),
    );
    const p = makeProvider(fetchMock as unknown as typeof fetch);
    const result = await p.generate(baseRequest);
    expect(result.outputs).toHaveLength(1);
    expect(result.outputs[0]?.mimeType).toBe("image/png");
    expect(result.outputs[0]?.bytes.length).toBeGreaterThan(0);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.openai.com/v1/images/generations");
    const body = JSON.parse(((init as RequestInit).body as string) ?? "{}");
    expect(body.model).toBe("gpt-image-1");
    expect(body.prompt).toBe(baseRequest.prompt);
    expect(body.size).toBe("1024x1024");
    expect((init as RequestInit).headers as Record<string, string>).toMatchObject({
      Authorization: "Bearer sk-test",
    });
  });

  it("rejects when count exceeds maxOutputs", async () => {
    const fetchMock = vi.fn();
    const p = makeProvider(fetchMock as unknown as typeof fetch);
    await expect(p.generate({ ...baseRequest, count: 99 })).rejects.toBeInstanceOf(
      ProviderRequestError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects size not in capability list", async () => {
    const fetchMock = vi.fn();
    const p = makeProvider(fetchMock as unknown as typeof fetch);
    await expect(
      p.generate({ ...baseRequest, size: "9999x9999" }),
    ).rejects.toBeInstanceOf(ProviderRequestError);
  });

  it("4xx error path surfaces ProviderHttpError", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(401, { error: { message: "bad token" } }),
    );
    const p = makeProvider(fetchMock as unknown as typeof fetch);
    await expect(p.generate(baseRequest)).rejects.toBeInstanceOf(ProviderHttpError);
  });

  it("retries on 429 then succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(429, { error: "rate" }, { "retry-after": "0" }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          created: 1,
          data: [{ b64_json: PNG_B64 }],
        }),
      );
    // Prevent real waiting; the http client honours setTimer override only
    // on its retry sleep path.
    const p = new OpenAIImageProvider({
      apiKey: "sk-test",
      models: new Map(Object.entries(OPENAI_IMAGE_MODELS)),
      fetch: fetchMock as unknown as typeof fetch,
    });
    const result = await p.generate(baseRequest);
    expect(result.outputs).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
