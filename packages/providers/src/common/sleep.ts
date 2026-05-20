import { ProviderAbortError } from "@imagent/core";

/**
 * Build an abort-aware `sleep(ms, signal)` bound to a specific vendor id —
 * an aborted signal during the sleep rejects with a `ProviderAbortError`
 * carrying the right vendor id. Used by polling loops (FLUX BFL direct +
 * the FLUX BFL branch of Azure Foundry) that previously each had their own
 * private `defaultSleep`.
 */
export function createAbortableSleep(
  vendorId: string,
): (ms: number, signal?: AbortSignal) => Promise<void> {
  return (ms, signal) =>
    new Promise<void>((resolve, reject) => {
      const handle = setTimeout(() => {
        if (signal) signal.removeEventListener("abort", onAbort);
        resolve();
      }, ms);
      const onAbort = () => {
        clearTimeout(handle);
        reject(new ProviderAbortError(vendorId, signal?.reason));
      };
      if (signal) {
        if (signal.aborted) {
          clearTimeout(handle);
          reject(new ProviderAbortError(vendorId, signal.reason));
          return;
        }
        signal.addEventListener("abort", onAbort, { once: true });
      }
    });
}
