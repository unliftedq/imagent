import { ProviderError, ProviderHttpError, type ProviderTestResult } from "@imagent/core";
import { APIError } from "openai";

/**
 * Convert any thrown error into a `ProviderTestResult` failure shape. Shared
 * by every vendor's `test()` so they have identical never-throws semantics.
 *
 * Recognises:
 *   - openai SDK `APIError` (preserves status code)
 *   - our own `ProviderHttpError` (preserves status code)
 *   - our own `ProviderError` (preserves any status it carries)
 *   - any other `Error` / unknown value (string message only)
 */
export function testFailureFromError(err: unknown): ProviderTestResult {
  if (err instanceof APIError && typeof err.status === "number") {
    return { ok: false, reason: `HTTP ${err.status}: ${err.message}`, status: err.status };
  }
  if (err instanceof ProviderHttpError) {
    return { ok: false, reason: err.message, status: err.status ?? 0 };
  }
  if (err instanceof ProviderError) {
    const out: ProviderTestResult =
      err.status !== undefined
        ? { ok: false, reason: err.message, status: err.status }
        : { ok: false, reason: err.message };
    return out;
  }
  if (err instanceof Error) {
    return { ok: false, reason: err.message };
  }
  return { ok: false, reason: String(err) };
}

/**
 * Generic SDK error → `ProviderError` rewrap. Captures the common subset of
 * `rethrowGoogleError` / `rethrowSdkError` (xAI); vendor-specific helpers
 * that need richer mapping (e.g. openai's `APIError` status decoding) still
 * have their own implementations next to the vendor that needs them.
 *
 * Returns a `never`-typed throw so call sites read `throw rethrowGenericSdkError(...)`.
 */
export function rethrowGenericSdkError(err: unknown, vendorId: string): never {
  if (err instanceof Error) {
    throw new ProviderError(err.message, { vendorId, cause: err });
  }
  throw new ProviderError(String(err), { vendorId });
}
