/**
 * Structured errors thrown by provider implementations and the JobRunner.
 *
 * Library code never throws plain `Error` — every failure carries enough
 * context (vendor id, status code, body excerpt where available) for the CLI
 * and IPC layers to render a useful message and for tests to assert on the
 * specific failure mode.
 */

/** Tag for structured discrimination at runtime. */
export const PROVIDER_ERROR_KIND = "ProviderError" as const;

export interface ProviderErrorOptions {
  vendorId: string;
  status?: number;
  bodyExcerpt?: string;
  cause?: unknown;
}

export class ProviderError extends Error {
  readonly kind = PROVIDER_ERROR_KIND;
  readonly vendorId: string;
  readonly status?: number | undefined;
  readonly bodyExcerpt?: string | undefined;

  constructor(message: string, opts: ProviderErrorOptions) {
    super(message);
    this.name = "ProviderError";
    this.vendorId = opts.vendorId;
    this.status = opts.status;
    this.bodyExcerpt = opts.bodyExcerpt;
    if (opts.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = opts.cause;
    }
  }
}

/** Caller passed an invalid request relative to the resolved model's caps. */
export class ProviderRequestError extends ProviderError {
  constructor(message: string, opts: ProviderErrorOptions) {
    super(message, opts);
    this.name = "ProviderRequestError";
  }
}

/** Vendor returned a non-success HTTP status (4xx/5xx). */
export class ProviderHttpError extends ProviderError {
  constructor(message: string, opts: ProviderErrorOptions & { status: number }) {
    super(message, opts);
    this.name = "ProviderHttpError";
  }
}

/** Vendor returned a body we couldn't decode / didn't match expected shape. */
export class ProviderResponseError extends ProviderError {
  constructor(message: string, opts: ProviderErrorOptions) {
    super(message, opts);
    this.name = "ProviderResponseError";
  }
}

/** Polling exceeded the configured ceiling without reaching a terminal state. */
export class ProviderTimeoutError extends ProviderError {
  constructor(message: string, opts: ProviderErrorOptions) {
    super(message, opts);
    this.name = "ProviderTimeoutError";
  }
}

/** Cancellation propagated from an AbortSignal. */
export class ProviderAbortError extends ProviderError {
  constructor(vendorId: string, cause?: unknown) {
    super("aborted", { vendorId, cause });
    this.name = "ProviderAbortError";
  }
}

/** True when an arbitrary error originated from a fetch AbortSignal. */
export function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { name?: string; code?: string };
  return e.name === "AbortError" || e.code === "ABORT_ERR";
}
