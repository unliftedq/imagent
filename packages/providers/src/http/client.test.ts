import { describe, expect, it, vi } from "vitest";
import { ProviderAbortError, ProviderHttpError, ProviderResponseError } from "@imagine/core";
import { z } from "zod";
import { createHttpClient } from "./client.js";

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

describe("createHttpClient", () => {
  it("posts JSON and parses with a schema", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { ok: 1 }));
    const c = createHttpClient({ baseUrl: "https://x.example", fetch: fetchMock as unknown as typeof fetch });
    const out = await c.post("/v1/foo", { hi: 1 }, { schema: z.object({ ok: z.number() }) });
    expect(out).toEqual({ ok: 1 });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://x.example/v1/foo");
    expect((init as RequestInit).method).toBe("POST");
  });

  it("throws ProviderHttpError on 4xx without retry", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(400, { error: "bad" }));
    const c = createHttpClient({ fetch: fetchMock as unknown as typeof fetch, vendorId: "test" });
    await expect(c.get("https://x.example/foo")).rejects.toBeInstanceOf(ProviderHttpError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries on 429 then succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(429, { error: "rate" }, { "retry-after": "0" }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    const setTimer = vi.fn().mockImplementation((cb: () => void) => {
      cb();
      return 0;
    });
    const c = createHttpClient({
      fetch: fetchMock as unknown as typeof fetch,
      vendorId: "test",
      setTimer,
      clearTimer: () => {},
    });
    const r = await c.get("https://x.example/foo", { schema: z.object({ ok: z.boolean() }) });
    expect(r).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries on 500 with backoff and gives up after maxRetries", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(500, { error: "boom" }));
    const setTimer = vi.fn().mockImplementation((cb: () => void) => {
      cb();
      return 0;
    });
    const c = createHttpClient({
      fetch: fetchMock as unknown as typeof fetch,
      vendorId: "test",
      maxRetries: 2,
      setTimer,
      clearTimer: () => {},
    });
    await expect(c.get("https://x.example/foo")).rejects.toBeInstanceOf(ProviderHttpError);
    // initial + 2 retries = 3 attempts
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("propagates AbortSignal as ProviderAbortError", async () => {
    const ac = new AbortController();
    const fetchMock = vi.fn().mockImplementation(async (_input: string, init: RequestInit) => {
      // Delay long enough that abort can fire first.
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(resolve, 1000);
        init.signal?.addEventListener("abort", () => {
          clearTimeout(t);
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
      return jsonResponse(200, {});
    });
    const c = createHttpClient({ fetch: fetchMock as unknown as typeof fetch, vendorId: "test" });
    const promise = c.get("https://x.example/foo", { signal: ac.signal });
    queueMicrotask(() => ac.abort());
    await expect(promise).rejects.toBeInstanceOf(ProviderAbortError);
  });

  it("throws ProviderResponseError on schema mismatch", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { wrong: true }));
    const c = createHttpClient({ fetch: fetchMock as unknown as typeof fetch, vendorId: "test" });
    await expect(
      c.get("https://x.example/foo", { schema: z.object({ ok: z.number() }) }),
    ).rejects.toBeInstanceOf(ProviderResponseError);
  });

  it("getBytes returns the raw body and content-type", async () => {
    const buf = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(buf, { status: 200, headers: { "content-type": "image/png" } }),
    );
    const c = createHttpClient({ fetch: fetchMock as unknown as typeof fetch, vendorId: "test" });
    const out = await c.getBytes("https://x.example/img.png");
    expect(out.mimeType).toBe("image/png");
    expect(Array.from(out.bytes)).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });
});
