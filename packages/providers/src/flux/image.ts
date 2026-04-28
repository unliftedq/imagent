import type {
  ImageCapabilities,
  ImageGenerationResult,
  ImageModelDef,
  ImageProvider,
  ImageRequest,
} from "@imagine-studio/core";
import { aggregateCapabilities } from "../openai/image.js";

export interface FluxImageProviderOptions {
  apiKey: string;
  baseUrl: string;
  models: ReadonlyMap<string, ImageModelDef>;
}

/**
 * Flux BFL image provider. Submit returns `{id, polling_url}`; M2 implements
 * the poll/download cycle. Same async shape as Seedance, so the polling logic
 * generalises.
 */
export class FluxImageProvider implements ImageProvider {
  readonly id = "flux-bfl";
  readonly displayName = "Flux (BFL)";
  readonly capabilities: ImageCapabilities;
  readonly models: ReadonlyMap<string, ImageModelDef>;

  constructor(private readonly options: FluxImageProviderOptions) {
    this.models = options.models;
    this.capabilities = aggregateCapabilities(options.models);
  }

  async generate(_req: ImageRequest, _signal?: AbortSignal): Promise<ImageGenerationResult> {
    throw new Error("not implemented (M2)");
  }
}
