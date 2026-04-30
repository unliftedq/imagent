import { describe, expect, it, vi } from "vitest";
import { AzureOpenAIImageProvider } from "./image.js";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function makeProvider(fetcher: typeof fetch) {
  return new AzureOpenAIImageProvider({
    endpoint: "https://my-resource.openai.azure.com",
    apiKey: "azure-key",
    models: new Map([["my-deployment", { id: "my-deployment" }]]),
    fetch: fetcher,
  });
}

describe("AzureOpenAIImageProvider.test()", () => {
  it("happy auth: 200 + matching deployment present", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        data: [{ id: "my-deployment", owned_by: "azure" }],
      }),
    );
    const p = makeProvider(fetchMock as unknown as typeof fetch);
    const res = await p.test!();
    expect(res.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://my-resource.openai.azure.com/openai/v1/models");
    expect((init as RequestInit).headers as Record<string, string>).toMatchObject({
      Authorization: "Bearer azure-key",
    });
  });

  it("bad auth: 401", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(401, { error: { code: "AccessDenied" } }),
    );
    const p = makeProvider(fetchMock as unknown as typeof fetch);
    const res = await p.test!();
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(401);
  });
});
