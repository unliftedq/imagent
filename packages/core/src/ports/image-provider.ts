import type { ImageModelDef } from "../domain/model.js";
import type { ImageRequest } from "../domain/request.js";
import type { ImageGenerationResult } from "../domain/result.js";

/**
 * Aggregate provider-level capability snapshot. Per-model capabilities live
 * on ImageModelDef.capabilities; ImageCapabilities here is the union the
 * provider supports across all of its enabled models.
 */
export interface ImageCapabilities {
  readonly sizes: readonly string[];
  readonly supportsArbitrarySize?: boolean;
  readonly aspectRatios: readonly string[];
  readonly maxReferences: number;
  readonly maxReferenceSizeMb?: number;
  readonly maxOutputs: number;
  readonly supportsStyleRef: boolean;
}

/**
 * Result of `provider.test()` — a minimal authenticated probe used by the
 * Providers UI to verify credentials without spending generation budget.
 *
 * Providers never throw from test(); failures are returned as `{ ok: false }`.
 */
export type ProviderTestResult =
  | { readonly ok: true; readonly latencyMs: number; readonly sampleModelId?: string }
  | { readonly ok: false; readonly reason: string; readonly status?: number };

export interface ImageProvider {
  readonly id: string;
  readonly displayName: string;
  readonly capabilities: ImageCapabilities;
  /** Resolved models known to this provider instance, keyed by model id. */
  readonly models: ReadonlyMap<string, ImageModelDef>;
  generate(req: ImageRequest, signal?: AbortSignal): Promise<ImageGenerationResult>;
  /**
   * Optional minimal authenticated probe. Implementations should hit a
   * cheap listing/no-op endpoint; never trigger real generation. Implementations
   * MUST NOT throw — wrap any errors as `{ ok: false }`.
   */
  test?(signal?: AbortSignal): Promise<ProviderTestResult>;
}
