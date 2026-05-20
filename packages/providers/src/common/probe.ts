import type { ProviderTestResult } from "@imagent/core";
import { testFailureFromError } from "./errors.js";

export interface ListProbeOptions {
  /** Returns the candidate model ids surfaced by the upstream listing. */
  listIds: (signal?: AbortSignal) => Promise<string[]>;
  /** Configured model ids on the provider — used to annotate `sampleModelId`. */
  configuredIds: string[];
  /** Optional AbortSignal forwarded to `listIds`. */
  signal?: AbortSignal;
  /**
   * Custom (id, listed) matcher. Defaults to strict equality. Google passes
   * `endsWith` to accept fully-qualified `models/<id>` names.
   */
  matcher?: (configuredId: string, listedId: string) => boolean;
  /**
   * When the listing returns an empty array, treat it as a hard failure
   * (returning `{ ok: false, reason: ... }`). Defaults to `false` — most
   * providers return `ok: true` even on empty listings, because auth working
   * is the only thing the probe is supposed to attest.
   */
  failOnEmptyList?: boolean;
}

/**
 * Run a "list models" auth probe. Shared by every vendor's `test()`:
 *
 *   - start timer
 *   - call `listIds(signal)` (vendor-specific)
 *   - if it throws → map via `testFailureFromError`
 *   - if it returns an empty list and `failOnEmptyList`, fail
 *   - annotate `sampleModelId` when one of the configured ids appears
 *
 * Vendors retain their own `test()` only if they need extra branches (Azure
 * logs a debug breadcrumb when a deployment name doesn't appear).
 */
export async function runListProbe(opts: ListProbeOptions): Promise<ProviderTestResult> {
  const started = Date.now();
  const matcher = opts.matcher ?? ((id, listed) => id === listed);
  try {
    const ids = await opts.listIds(opts.signal);
    const latencyMs = Date.now() - started;
    if (opts.failOnEmptyList && ids.length === 0) {
      return { ok: false, reason: "no models returned", status: 0 };
    }
    const matched = opts.configuredIds.find((id) => ids.some((listed) => matcher(id, listed)));
    if (matched) return { ok: true, latencyMs, sampleModelId: matched };
    return { ok: true, latencyMs };
  } catch (err) {
    return testFailureFromError(err);
  }
}
