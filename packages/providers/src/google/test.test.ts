import { describe, expect, it, vi } from "vitest";
import { GoogleImageProvider } from "./image.js";
import { GOOGLE_IMAGE_MODELS } from "./catalog.js";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function makeProvider(fetcher: typeof fetch) {
  return new GoogleImageProvider({
    apiKey: "google-key",
    models: new Map(Object.entries(GOOGLE_IMAGE_MODELS)),
    fetch: fetcher,
  });
}

describe("GoogleImageProvider.test()", () => {
  it("happy auth: returns ok with model match on suffix", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        models: [
          { name: "models/imagen-3" },
          { name: "models/gemini-2.0-flash" },
        ],
      }),
    );
    const p = makeProvider(fetchMock as unknown as typeof fetch);
    const res = await p.test!();
    expect(res.ok).toBe(true);
    const [url] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("/models?key=google-key");
  });

  it("bad auth: 401 surface", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(401, { error: { code: 401 } }),
    );
    const p = makeProvider(fetchMock as unknown as typeof fetch);
    const res = await p.test!();
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(401);
  });

  it("network failure", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("DNS_PROBE_FINISHED"));
    const p = makeProvider(fetchMock as unknown as typeof fetch);
    const res = await p.test!();
    expect(res.ok).toBe(false);
  }, 30_000);
});
