import {
  type ImageOutput,
  ProviderAbortError,
  ProviderError,
  ProviderResponseError,
  ProviderTimeoutError,
} from "@imagent/core";
import { z } from "zod";
import type { HttpClient } from "../http/index.js";
import { coerceMimeType, decodeBase64 } from "./bytes.js";

/**
 * FLUX BFL submit response — accepts both the canonical async shape
 * (`{id, polling_url}`) and the sync-wrapper shape (`{data: [...]}` or
 * `{status: "Ready", result: {sample}}`) that Azure Foundry's FLUX route
 * occasionally returns.
 */
export const FluxSubmitResponseSchema = z.object({
  id: z.string().optional(),
  polling_url: z.string().optional(),
  status: z.string().optional(),
  result: z
    .object({
      sample: z.string().optional(),
    })
    .nullable()
    .optional(),
  data: z
    .array(
      z.object({
        b64_json: z.string().optional(),
        url: z.string().optional(),
      }),
    )
    .optional(),
  error: z.string().nullable().optional(),
});

export type FluxSubmitResponse = z.infer<typeof FluxSubmitResponseSchema>;

/** FLUX BFL polling response. */
export const FluxPollResponseSchema = z.object({
  id: z.string().optional(),
  status: z.string(),
  result: z
    .object({
      sample: z.string().optional(),
    })
    .nullable()
    .optional(),
  progress: z.number().optional(),
  error: z.string().nullable().optional(),
  details: z.unknown().optional(),
});

export type FluxPollResponse = z.infer<typeof FluxPollResponseSchema>;

/** Terminal failure states reported by BFL. */
export const FLUX_TERMINAL_FAILURE_STATES = [
  "Error",
  "Failed",
  "Content Moderated",
  "Request Moderated",
] as const;

export function isFluxTerminalFailure(status: string): boolean {
  return (FLUX_TERMINAL_FAILURE_STATES as readonly string[]).includes(status);
}

export interface FluxPollEnvelope {
  /** Initial poll interval (ms). Defaults to 1s. */
  intervalMs: number;
  /** Max interval after backoff capping (ms). Defaults to 5s. */
  maxIntervalMs: number;
  /** Total polling timeout (ms). Defaults to 60s. */
  timeoutMs: number;
  /** Multiplicative backoff applied each iteration. Defaults to 1.6. */
  backoff: number;
}

export const DEFAULT_FLUX_POLL_ENVELOPE: FluxPollEnvelope = {
  intervalMs: 1_000,
  maxIntervalMs: 5_000,
  timeoutMs: 60_000,
  backoff: 1.6,
};

/**
 * Inspect a FLUX submit response and return rendered outputs when the
 * upstream already produced an image synchronously. Returns `null` when the
 * response is async-style (caller should poll). Throws on terminal-but-failed
 * states so the caller's error path stays uniform with the polling branch.
 */
export async function readFluxSyncResponse(
  submit: FluxSubmitResponse,
  http: HttpClient,
  vendorId: string,
  signal?: AbortSignal,
): Promise<ImageOutput[] | null> {
  if (submit.data && submit.data.length > 0) {
    const outputs: ImageOutput[] = [];
    for (const entry of submit.data) {
      if (entry.b64_json) {
        outputs.push({ bytes: decodeBase64(entry.b64_json), mimeType: "image/png" });
      } else if (entry.url) {
        const dl = await http.getBytes(entry.url, signal ? { signal } : {});
        outputs.push({
          bytes: dl.bytes,
          mimeType: coerceMimeType(dl.mimeType, "image/", "image/png"),
        });
      } else {
        throw new ProviderResponseError("FLUX response entry missing b64_json and url", {
          vendorId,
        });
      }
    }
    return outputs;
  }
  const status = submit.status;
  if (status === "Ready" && submit.result?.sample) {
    const dl = await http.getBytes(submit.result.sample, signal ? { signal } : {});
    return [
      { bytes: dl.bytes, mimeType: coerceMimeType(dl.mimeType, "image/", "image/png") },
    ];
  }
  if (status && isFluxTerminalFailure(status)) {
    throw new ProviderError(`FLUX job ended in state '${status}': ${submit.error ?? ""}`, {
      vendorId,
    });
  }
  return null;
}

export interface PollFluxJobOptions {
  pollUrl: string;
  jobId: string;
  vendorId: string;
  http: HttpClient;
  sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
  envelope: FluxPollEnvelope;
  signal?: AbortSignal;
}

/**
 * Poll a FLUX BFL `polling_url` until terminal. Handles abort/timeout, the
 * canonical `Ready/Error/Failed/...` states, and the exponential backoff
 * envelope (capped by `maxIntervalMs`). Returns the rendered image outputs
 * once `Ready`.
 */
export async function pollFluxJob(opts: PollFluxJobOptions): Promise<ImageOutput[]> {
  const start = Date.now();
  let interval = opts.envelope.intervalMs;
  while (true) {
    if (opts.signal?.aborted) {
      throw new ProviderAbortError(opts.vendorId, opts.signal.reason);
    }
    if (Date.now() - start > opts.envelope.timeoutMs) {
      throw new ProviderTimeoutError(
        `${opts.vendorId} FLUX job ${opts.jobId} did not complete within ${opts.envelope.timeoutMs}ms`,
        { vendorId: opts.vendorId },
      );
    }
    await opts.sleep(interval, opts.signal);
    const pollOpts: { signal?: AbortSignal; schema: typeof FluxPollResponseSchema } = {
      schema: FluxPollResponseSchema,
    };
    if (opts.signal) pollOpts.signal = opts.signal;
    const status = await opts.http.get<FluxPollResponse>(opts.pollUrl, pollOpts);

    const s = status.status;
    if (s === "Ready") {
      const sample = status.result?.sample;
      if (!sample) {
        throw new ProviderError(`${opts.vendorId} FLUX Ready response missing result.sample url`, {
          vendorId: opts.vendorId,
        });
      }
      const dl = await opts.http.getBytes(sample, opts.signal ? { signal: opts.signal } : {});
      return [
        { bytes: dl.bytes, mimeType: coerceMimeType(dl.mimeType, "image/", "image/png") },
      ];
    }
    if (isFluxTerminalFailure(s)) {
      throw new ProviderError(
        `${opts.vendorId} FLUX job ended in state '${s}': ${status.error ?? ""}`,
        { vendorId: opts.vendorId },
      );
    }
    interval = Math.min(Math.round(interval * opts.envelope.backoff), opts.envelope.maxIntervalMs);
  }
}
