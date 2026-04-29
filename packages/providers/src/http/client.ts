import {
  ProviderAbortError,
  ProviderHttpError,
  ProviderResponseError,
  isAbortError,
  type Logger,
  NoopLogger,
} from "@imagine-studio/core";
import { type ZodTypeAny, z } from "zod";

/**
 * Tiny Node-native fetch wrapper used by every vendor provider. We handle
 * three things the bare `fetch` doesn't:
 *
 *   1. Auth header injection + base URL composition.
 *   2. Retry on 429 / 5xx with exponential backoff (250ms → 8s, max 4 retries),
 *      honouring `Retry-After` when the server provides it. 4xx other than
 *      429 short-circuits.
 *   3. AbortSignal propagation — every method takes an optional `signal`, the
 *      request honours it, and an aborted retry sleep wakes up immediately.
 *
 * The factory accepts an optional `fetch` override so tests can inject a
 * mock without monkey-patching globalThis.
 */

export interface HttpClientOptions {
  baseUrl?: string;
  headers?: Record<string, string>;
  /** Per-request timeout in ms. Defaults to 60s. Polling callers manage their own larger envelope. */
  timeoutMs?: number;
  /** Max retries on 429 / 5xx. Defaults to 4. */
  maxRetries?: number;
  /** Override the global `fetch` for tests. */
  fetch?: typeof fetch;
  logger?: Logger;
  /**
   * Vendor id used in error reporting. Optional at construction (each call
   * can override it via options.vendorId), but giving the factory one is
   * almost always cleaner.
   */
  vendorId?: string;
  /** `setTimeout` injection for tests of the retry sleep. */
  setTimer?: (cb: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export interface HttpRequestOptions {
  signal?: AbortSignal;
  headers?: Record<string, string>;
  /** Optional zod schema; if supplied, JSON helpers validate the response. */
  schema?: ZodTypeAny;
  /** Override the vendor id for the request (rare; usually set on factory). */
  vendorId?: string;
  /** Override timeout for this request. */
  timeoutMs?: number;
}

export interface HttpClient {
  get<T = unknown>(path: string, opts?: HttpRequestOptions): Promise<T>;
  post<T = unknown>(path: string, body: unknown, opts?: HttpRequestOptions): Promise<T>;
  /** DELETE — used by Seedance cancel. Returns parsed JSON or undefined. */
  del<T = unknown>(path: string, opts?: HttpRequestOptions): Promise<T>;
  /** Download bytes; same retry & abort semantics. */
  getBytes(url: string, opts?: HttpRequestOptions): Promise<{ bytes: Uint8Array<ArrayBuffer>; mimeType: string }>;
  /** Raw fetch response — escape hatch when callers need headers. */
  raw(input: string, init?: RequestInit, opts?: HttpRequestOptions): Promise<Response>;
}

const DEFAULT_BACKOFF_MS = [250, 500, 1_000, 2_000, 4_000, 8_000] as const;
const RETRYABLE_STATUSES = new Set<number>([408, 425, 429, 500, 502, 503, 504]);

export function createHttpClient(opts: HttpClientOptions = {}): HttpClient {
  const fetcher = opts.fetch ?? globalThis.fetch;
  if (!fetcher) {
    throw new Error("No fetch implementation available; pass opts.fetch.");
  }
  const logger = opts.logger ?? NoopLogger;
  const setTimer = opts.setTimer ?? ((cb, ms) => setTimeout(cb, ms));
  const clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  const vendorId = opts.vendorId ?? "unknown";
  const baseUrl = opts.baseUrl?.replace(/\/+$/, "");
  const baseHeaders = opts.headers ?? {};
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const maxRetries = opts.maxRetries ?? 4;

  function fullUrl(pathOrUrl: string): string {
    if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
    if (!baseUrl) return pathOrUrl;
    const path = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
    return `${baseUrl}${path}`;
  }

  async function executeRaw(
    input: string,
    init: RequestInit,
    perRequestTimeoutMs: number,
    callerSignal?: AbortSignal,
  ): Promise<Response> {
    // Compose: caller signal + per-request timeout signal, both via AbortController.
    const ac = new AbortController();
    const onCallerAbort = () => ac.abort(callerSignal?.reason);
    if (callerSignal) {
      if (callerSignal.aborted) {
        ac.abort(callerSignal.reason);
      } else {
        callerSignal.addEventListener("abort", onCallerAbort, { once: true });
      }
    }
    const timeoutHandle = setTimer(() => ac.abort(new Error("request timeout")), perRequestTimeoutMs);
    try {
      return await fetcher(input, { ...init, signal: ac.signal });
    } finally {
      clearTimer(timeoutHandle);
      callerSignal?.removeEventListener("abort", onCallerAbort);
    }
  }

  async function withRetries(
    input: string,
    init: RequestInit,
    callerSignal: AbortSignal | undefined,
    perRequestTimeoutMs: number,
    callerVendorId: string,
  ): Promise<Response> {
    let attempt = 0;
    let lastResponse: Response | undefined;
    let lastBody: string | undefined;
    while (true) {
      if (callerSignal?.aborted) {
        throw new ProviderAbortError(callerVendorId, callerSignal.reason);
      }
      try {
        const res = await executeRaw(input, init, perRequestTimeoutMs, callerSignal);
        if (res.ok) return res;
        if (!RETRYABLE_STATUSES.has(res.status) || attempt >= maxRetries) {
          // Non-retryable, or out of retries — throw with body excerpt.
          const text = await safePeekBody(res);
          throw new ProviderHttpError(
            `HTTP ${res.status} from ${input}`,
            { vendorId: callerVendorId, status: res.status, bodyExcerpt: text },
          );
        }
        // Retryable — capture body for diagnostic, then sleep + retry.
        lastResponse = res;
        lastBody = await safePeekBody(res);
        const retryAfter = parseRetryAfter(res.headers.get("retry-after"));
        const delay = retryAfter ?? backoffFor(attempt);
        logger.debug("http retry", {
          input,
          status: res.status,
          attempt: attempt + 1,
          delay,
        });
        await sleep(delay, callerSignal);
        attempt += 1;
      } catch (err) {
        if (isAbortError(err) || err instanceof ProviderAbortError) {
          throw err instanceof ProviderAbortError ? err : new ProviderAbortError(callerVendorId, err);
        }
        if (err instanceof ProviderHttpError) {
          throw err;
        }
        // Network errors: retry up to max.
        if (attempt >= maxRetries) {
          throw new ProviderHttpError(
            `HTTP error contacting ${input}: ${(err as Error)?.message ?? String(err)}`,
            {
              vendorId: callerVendorId,
              status: lastResponse?.status ?? 0,
              bodyExcerpt: lastBody,
              cause: err,
            },
          );
        }
        const delay = backoffFor(attempt);
        logger.debug("http network retry", { input, attempt: attempt + 1, delay, err: String(err) });
        await sleep(delay, callerSignal);
        attempt += 1;
      }
    }
  }

  function sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const handle = setTimer(() => {
        if (signal) signal.removeEventListener("abort", onAbort);
        resolve();
      }, ms);
      const onAbort = () => {
        clearTimer(handle);
        reject(new ProviderAbortError(vendorId, signal?.reason));
      };
      if (signal) {
        if (signal.aborted) {
          clearTimer(handle);
          reject(new ProviderAbortError(vendorId, signal.reason));
          return;
        }
        signal.addEventListener("abort", onAbort, { once: true });
      }
    });
  }

  async function jsonOrValidate<T>(res: Response, schema: ZodTypeAny | undefined, vid: string): Promise<T> {
    let parsed: unknown;
    try {
      parsed = await res.json();
    } catch (err) {
      throw new ProviderResponseError("response body is not valid JSON", {
        vendorId: vid,
        status: res.status,
        cause: err,
      });
    }
    if (!schema) return parsed as T;
    const result = (schema as ZodTypeAny).safeParse(parsed);
    if (!result.success) {
      throw new ProviderResponseError(`response shape mismatch: ${result.error.message}`, {
        vendorId: vid,
        status: res.status,
        bodyExcerpt: JSON.stringify(parsed).slice(0, 512),
      });
    }
    return result.data as T;
  }

  function buildHeaders(per?: Record<string, string>): Record<string, string> {
    return { ...baseHeaders, ...(per ?? {}) };
  }

  return {
    async get<T>(path: string, options: HttpRequestOptions = {}): Promise<T> {
      const vid = options.vendorId ?? vendorId;
      const res = await withRetries(
        fullUrl(path),
        { method: "GET", headers: buildHeaders(options.headers) },
        options.signal,
        options.timeoutMs ?? timeoutMs,
        vid,
      );
      return jsonOrValidate<T>(res, options.schema, vid);
    },
    async post<T>(path: string, body: unknown, options: HttpRequestOptions = {}): Promise<T> {
      const vid = options.vendorId ?? vendorId;
      const headers = buildHeaders({ "content-type": "application/json", ...options.headers });
      const res = await withRetries(
        fullUrl(path),
        { method: "POST", headers, body: JSON.stringify(body) },
        options.signal,
        options.timeoutMs ?? timeoutMs,
        vid,
      );
      return jsonOrValidate<T>(res, options.schema, vid);
    },
    async del<T>(path: string, options: HttpRequestOptions = {}): Promise<T> {
      const vid = options.vendorId ?? vendorId;
      const res = await withRetries(
        fullUrl(path),
        { method: "DELETE", headers: buildHeaders(options.headers) },
        options.signal,
        options.timeoutMs ?? timeoutMs,
        vid,
      );
      // DELETE bodies are often empty.
      const text = await res.text();
      if (!text) return undefined as T;
      try {
        const parsed = JSON.parse(text);
        if (options.schema) {
          const r = options.schema.safeParse(parsed);
          if (!r.success) {
            throw new ProviderResponseError(`response shape mismatch: ${r.error.message}`, {
              vendorId: vid,
              status: res.status,
            });
          }
          return r.data as T;
        }
        return parsed as T;
      } catch {
        return undefined as T;
      }
    },
    async getBytes(url, options = {}) {
      const vid = options.vendorId ?? vendorId;
      const res = await withRetries(
        fullUrl(url),
        { method: "GET", headers: buildHeaders(options.headers) },
        options.signal,
        options.timeoutMs ?? timeoutMs,
        vid,
      );
      const buf = await res.arrayBuffer();
      const mimeType = res.headers.get("content-type") ?? "application/octet-stream";
      // arrayBuffer() returns ArrayBuffer; the explicit copy keeps strict
      // typing happy across TS 5.9's typed-array generic narrowing.
      const bytes = new Uint8Array(buf as ArrayBuffer);
      return { bytes, mimeType };
    },
    async raw(input, init, options = {}) {
      const vid = options.vendorId ?? vendorId;
      return withRetries(
        fullUrl(input),
        { ...init, headers: buildHeaders({ ...(init?.headers as Record<string, string> | undefined) }) },
        options.signal,
        options.timeoutMs ?? timeoutMs,
        vid,
      );
    },
  };
}

function backoffFor(attempt: number): number {
  return DEFAULT_BACKOFF_MS[Math.min(attempt, DEFAULT_BACKOFF_MS.length - 1)] ?? 8_000;
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 30_000);
  // HTTP-date form
  const ts = Date.parse(value);
  if (Number.isFinite(ts)) {
    const delta = ts - Date.now();
    if (delta > 0) return Math.min(delta, 30_000);
  }
  return undefined;
}

async function safePeekBody(res: Response): Promise<string> {
  try {
    const text = await res.text();
    return text.slice(0, 512);
  } catch {
    return "";
  }
}

/** Re-export zod for vendor-side schema definitions to keep imports tidy. */
export { z };
