import { describe, expect, it, vi } from "vitest";
import { ProviderError, ProviderHttpError, ProviderRequestError, type ImageRequest } from "@imagent/core";
import { APIError } from "openai";
import { AzureImageProvider, azureModelFamily } from "./image.js";
import type { OpenAIClientLike } from "../openai/image.js";
import { AZURE_IMAGE_MODELS } from "../catalog/test-fixtures.js";

const PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII=";

interface FakeClient {
  images: { generate: ReturnType<typeof vi.fn>; edit?: ReturnType<typeof vi.fn> };
  models: { list: ReturnType<typeof vi.fn> };
}

function makeFakeClient(): FakeClient {
  return {
    images: { generate: vi.fn() },
    models: { list: vi.fn() },
  };
}

function makeProvider(client: FakeClient, fetchImpl?: typeof fetch): AzureImageProvider {
  return new AzureImageProvider({
    endpoint: "https://my-aoai.openai.azure.com",
    apiKey: "azure-key",
    models: new Map(Object.entries(AZURE_IMAGE_MODELS)),
    client: client as unknown as OpenAIClientLike,
    ...(fetchImpl ? { fetch: fetchImpl } : {}),
  });
}

function makeFoundryProvider(client: FakeClient, fetchImpl: typeof fetch): AzureImageProvider {
  // Foundry-style endpoint so the FLUX host transform engages.
  return new AzureImageProvider({
    endpoint: "https://my-resource.services.ai.azure.com",
    apiKey: "azure-key",
    models: new Map(Object.entries(AZURE_IMAGE_MODELS)),
    client: client as unknown as OpenAIClientLike,
    fetch: fetchImpl,
    sleep: async () => {},
    pollIntervalMs: 1,
    pollTimeoutMs: 5_000,
  });
}

const baseRequest: ImageRequest = {
  prompt: "a windmill at golden hour",
  providerId: "azure",
  model: "azure-prod-gpt-image-2",
  count: 1,
  size: "1024x1024",
  references: [],
  assetIds: [],
};

const maiRequest: ImageRequest = {
  prompt: "a photorealistic mountain lake at sunrise",
  providerId: "azure",
  model: "azure-prod-mai-image-2",
  count: 1,
  size: "1024x1024",
  references: [],
  assetIds: [],
};

const fluxRequest: ImageRequest = {
  prompt: "obsidian glass cathedral",
  providerId: "azure",
  model: "azure-prod-flux-2-pro",
  count: 1,
  size: "1234x789",
  references: [],
  assetIds: [],
};

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function bytesRes(payload: Uint8Array, mime = "image/png"): Response {
  return new Response(payload, { status: 200, headers: { "content-type": mime } });
}

describe("AzureImageProvider — OpenAI image family", () => {
  it("happy path: invokes SDK images.generate with deployment name as model", async () => {
    const client = makeFakeClient();
    client.images.generate.mockResolvedValue({ data: [{ b64_json: PNG_B64 }] });
    const p = makeProvider(client);
    const r = await p.generate(baseRequest);
    expect(r.outputs).toHaveLength(1);
    expect(client.images.generate).toHaveBeenCalledTimes(1);
    const [body] = client.images.generate.mock.calls[0]!;
    expect(body).toMatchObject({
      model: "azure-prod-gpt-image-2",
      prompt: baseRequest.prompt,
      n: 1,
      size: "1024x1024",
    });
  });

  it("401 from SDK surfaces as ProviderHttpError", async () => {
    const client = makeFakeClient();
    client.images.generate.mockRejectedValue(
      new APIError(401, { error: "no" }, "401 Unauthorized", new Headers()),
    );
    const p = makeProvider(client);
    await expect(p.generate(baseRequest)).rejects.toBeInstanceOf(ProviderHttpError);
  });

  it("network error from SDK surfaces as ProviderError", async () => {
    const client = makeFakeClient();
    client.images.generate.mockRejectedValue(new Error("ECONNRESET"));
    const p = makeProvider(client);
    await expect(p.generate(baseRequest)).rejects.toBeInstanceOf(ProviderError);
  });
});

describe("AzureImageProvider — MAI image family", () => {
  it("posts to /mai/v1/images/generations with raw width/height and api-key auth", async () => {
    const client = makeFakeClient();
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ data: [{ b64_json: PNG_B64 }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    ) as unknown as typeof fetch;
    const p = makeProvider(client, fetchMock);

    const r = await p.generate(maiRequest);
    expect(r.outputs).toHaveLength(1);
    expect(r.outputs[0]!.mimeType).toBe("image/png");
    expect(r.outputs[0]!.width).toBe(1024);
    expect(r.outputs[0]!.height).toBe(1024);

    const calls = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(1);
    const [url, init] = calls[0]! as [string | URL, RequestInit | undefined];
    expect(String(url)).toBe("https://my-aoai.openai.azure.com/mai/v1/images/generations");
    expect(init?.method).toBe("POST");
    const headers = new Headers(init?.headers as Record<string, string> | undefined);
    expect(headers.get("api-key")).toBe("azure-key");
    expect(headers.get("content-type")).toBe("application/json");
    const body = JSON.parse((init?.body as string) ?? "{}");
    expect(body).toEqual({
      model: "azure-prod-mai-image-2",
      prompt: maiRequest.prompt,
      width: 1024,
      height: 1024,
    });
  });

  it("supports arbitrary WxH sizes within MAI constraints", async () => {
    const client = makeFakeClient();
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ data: [{ b64_json: PNG_B64 }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    ) as unknown as typeof fetch;
    const p = makeProvider(client, fetchMock);
    const r = await p.generate({ ...maiRequest, size: "1280x768" });
    expect(r.outputs[0]!.width).toBe(1280);
    expect(r.outputs[0]!.height).toBe(768);
    const body = JSON.parse(
      ((fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![1] as RequestInit)
        .body as string,
    );
    expect(body.width).toBe(1280);
    expect(body.height).toBe(768);
  });

  it("rejects MAI requests that include reference images", async () => {
    const client = makeFakeClient();
    const fetchMock = vi.fn() as unknown as typeof fetch;
    const p = makeProvider(client, fetchMock);
    await expect(
      p.generate({
        ...maiRequest,
        references: [{ path: "/tmp/ref.png", role: "freeform" }],
      }),
    ).rejects.toBeInstanceOf(ProviderRequestError);
    expect((fetchMock as unknown as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it("HTTP 401 from MAI endpoint surfaces as ProviderHttpError", async () => {
    const client = makeFakeClient();
    const fetchMock = vi.fn(
      async () => new Response("Unauthorized", { status: 401 }),
    ) as unknown as typeof fetch;
    const p = makeProvider(client, fetchMock);
    await expect(p.generate(maiRequest)).rejects.toBeInstanceOf(ProviderHttpError);
  });
});

describe("AzureImageProvider — FLUX BFL family", () => {
  it("submit + poll + download: posts to BFL host, polls until Ready, fetches sample", async () => {
    const samplePng = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonRes({
          id: "job-1",
          polling_url: "https://my-resource.services.ai.azure.com/poll/job-1",
        }),
      )
      .mockResolvedValueOnce(jsonRes({ status: "Pending" }))
      .mockResolvedValueOnce(
        jsonRes({
          status: "Ready",
          result: { sample: "https://cdn.bfl.ai/img/job-1.png" },
        }),
      )
      .mockResolvedValueOnce(bytesRes(samplePng));
    const client = makeFakeClient();
    const p = makeFoundryProvider(client, fetchMock as unknown as typeof fetch);

    const r = await p.generate(fluxRequest);
    expect(r.outputs).toHaveLength(1);
    expect(Array.from(r.outputs[0]!.bytes)).toEqual(Array.from(samplePng));

    const calls = fetchMock.mock.calls;
    expect(calls.length).toBe(4);
    const [submitUrl, submitInit] = calls[0]! as [string | URL, RequestInit | undefined];
    // Same Foundry host as the OpenAI / MAI families — only the path differs.
    expect(String(submitUrl)).toBe(
      "https://my-resource.services.ai.azure.com/providers/blackforestlabs/v1/flux-2-pro?api-version=preview",
    );
    expect(submitInit?.method).toBe("POST");
    const headers = new Headers(submitInit?.headers as Record<string, string> | undefined);
    expect(headers.get("authorization")).toBe("Bearer azure-key");
    const body = JSON.parse((submitInit?.body as string) ?? "{}");
    expect(body).toMatchObject({
      model: "FLUX.2-pro",
      prompt: fluxRequest.prompt,
      width: 1234,
      height: 789,
    });
  });

  it("synchronous response with data[].b64_json bypasses polling", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const b64 = Buffer.from(png).toString("base64");
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonRes({ data: [{ b64_json: b64 }] }));
    const client = makeFakeClient();
    const p = makeFoundryProvider(client, fetchMock as unknown as typeof fetch);

    const r = await p.generate(fluxRequest);
    expect(r.outputs).toHaveLength(1);
    expect(Array.from(r.outputs[0]!.bytes)).toEqual(Array.from(png));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("FLUX submit failure (4xx) surfaces ProviderHttpError", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonRes({ error: "auth" }, 401));
    const client = makeFakeClient();
    const p = makeFoundryProvider(client, fetchMock as unknown as typeof fetch);
    await expect(p.generate(fluxRequest)).rejects.toBeInstanceOf(ProviderHttpError);
  });

  it("polling-failure: Error status surfaces ProviderError", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonRes({
          id: "job-x",
          polling_url: "https://my-resource.services.ai.azure.com/poll/x",
        }),
      )
      .mockResolvedValueOnce(jsonRes({ status: "Error", error: "boom" }));
    const client = makeFakeClient();
    const p = makeFoundryProvider(client, fetchMock as unknown as typeof fetch);
    await expect(p.generate(fluxRequest)).rejects.toBeInstanceOf(ProviderError);
  });
});

describe("azureModelFamily", () => {
  it("classifies gpt-image deployments as openai-images", () => {
    expect(azureModelFamily(AZURE_IMAGE_MODELS["azure-prod-gpt-image-2"]!)).toBe(
      "openai-images",
    );
  });

  it("classifies MAI-Image deployments as mai-images via baseModelId", () => {
    expect(azureModelFamily(AZURE_IMAGE_MODELS["azure-prod-mai-image-2"]!)).toBe(
      "mai-images",
    );
  });

  it("classifies FLUX deployments as flux-bfl via baseModelId", () => {
    expect(azureModelFamily(AZURE_IMAGE_MODELS["azure-prod-flux-2-pro"]!)).toBe("flux-bfl");
  });

  it("falls back to id when baseModelId is absent (canonical MAI entry)", () => {
    expect(
      azureModelFamily({
        id: "MAI-Image-2e",
      }),
    ).toBe("mai-images");
  });
});
