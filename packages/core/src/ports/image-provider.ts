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
  readonly aspectRatios: readonly string[];
  readonly maxReferences: number;
  readonly maxOutputs: number;
  readonly supportsNegativePrompt: boolean;
  readonly supportsSeed: boolean;
  readonly supportsStyleRef: boolean;
}

export interface ImageProvider {
  readonly id: string;
  readonly displayName: string;
  readonly capabilities: ImageCapabilities;
  /** Resolved models known to this provider instance, keyed by model id. */
  readonly models: ReadonlyMap<string, ImageModelDef>;
  generate(req: ImageRequest, signal?: AbortSignal): Promise<ImageGenerationResult>;
}
