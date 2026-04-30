import { describe, expect, it, vi } from "vitest";
import { FluxImageProvider } from "./image.js";
import { FLUX_IMAGE_MODELS } from "../catalog/test-fixtures.js";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function makeProvider(fetcher: typeof fetch) {
  return new FluxImageProvider({
    apiKey: "bfl-key",
    models: new Map(Object.entries(FLUX_IMAGE_MODELS)),
    fetch: fetcher,
    sleep: async () => {},
  });
}

describe("FluxImageProvider.test()", () => {
  it("happy auth: 404 on unknown id maps to ok=true", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(404, { detail: "Task not found" }),
    );
    const p = makeProvider(fetchMock as unknown as typeof fetch);
    const res = await p.test!();
    expect(res.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("/v1/get_result?id=");
    expect((init as RequestInit).headers as Record<string, string>).toMatchObject({
      "x-key": "bfl-key",
    });
  });

  it("bad auth: 401 returns ok=false", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(401, { detail: "Unauthorized" }),
    );
    const p = makeProvider(fetchMock as unknown as typeof fetch);
    const res = await p.test!();
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(401);
  });

  it("network failure: returns ok=false", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("ECONNRESET"));
    const p = makeProvider(fetchMock as unknown as typeof fetch);
    const res = await p.test!();
    expect(res.ok).toBe(false);
  }, 30_000);
});
