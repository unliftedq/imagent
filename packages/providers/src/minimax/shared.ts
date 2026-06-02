import { ProviderHttpError, ProviderResponseError } from "@imagent/core";
import type { HttpClient } from "../http/index.js";

/**
 * Canonical MiniMax international API base URL. Both the image and video ports
 * hang off `/v1/*` paths. Users on other regions/proxies can override this via
 * `config.providers.minimax.baseUrl`.
 */
export const DEFAULT_MINIMAX_BASE_URL = "https://api.minimax.io/v1";

/**
 * MiniMax envelopes every response with a `base_resp` carrying a numeric
 * `status_code` (0 = success) and a human-readable `status_msg`. Crucially,
 * authentication and quota failures arrive as HTTP 200 with a non-zero
 * `status_code`, so we must inspect this body rather than trusting the HTTP
 * status alone.
 */
export interface MiniMaxBaseResp {
  status_code?: number | null;
  status_msg?: string | null;
}

/** `status_code` values MiniMax uses for authentication failures. */
export const MINIMAX_AUTH_ERROR_CODES = new Set<number>([1004, 1039, 1041]);

/**
 * Throw when MiniMax reports a non-success `base_resp.status_code`. Auth
 * failures map to {@link ProviderHttpError} (so callers see an HTTP-ish 401),
 * everything else to {@link ProviderResponseError}.
 */
export function assertMiniMaxOk(base: MiniMaxBaseResp | null | undefined, vendorId: string): void {
  const code = base?.status_code;
  if (code === undefined || code === null || code === 0) return;
  const message = base?.status_msg || `status_code ${code}`;
  if (MINIMAX_AUTH_ERROR_CODES.has(code)) {
    throw new ProviderHttpError(`MiniMax authentication failed: ${message}`, {
      vendorId,
      status: 401,
    });
  }
  throw new ProviderResponseError(`MiniMax request failed: ${message}`, { vendorId });
}

/**
 * Lightweight auth probe shared by the image + video `test()` paths. MiniMax
 * has no list-models endpoint, so we hit the (free) video-task query endpoint
 * with a sentinel `task_id`. A valid key yields a benign error code (the task
 * doesn't exist); an invalid key yields an auth `status_code`. Returns the
 * `status_code` so callers can decide success — or undefined when the body
 * carries none.
 */
export async function probeMiniMaxAuth(
  http: HttpClient,
  signal?: AbortSignal,
): Promise<number | undefined> {
  const opts: { signal?: AbortSignal } = {};
  if (signal) opts.signal = signal;
  const res = await http.get<{ base_resp?: MiniMaxBaseResp | null }>(
    "/query/video_generation?task_id=imagent-auth-probe",
    opts,
  );
  const code = res?.base_resp?.status_code;
  return typeof code === "number" ? code : undefined;
}
