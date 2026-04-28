import type {
  ImageCapabilities,
  ImageGenerationResult,
  ImageModelDef,
  ImageProvider,
  ImageRequest,
} from "@imagine-studio/core";
import { aggregateCapabilities } from "../openai/image.js";

export interface GoogleImageProviderOptions {
  apiKey: string;
  models: ReadonlyMap<string, ImageModelDef>;
}

export class GoogleImageProvider implements ImageProvider {
  readonly id = "google";
  readonly displayName = "Google (Imagen / Gemini)";
  readonly capabilities: ImageCapabilities;
  readonly models: ReadonlyMap<string, ImageModelDef>;

  constructor(private readonly options: GoogleImageProviderOptions) {
    this.models = options.models;
    this.capabilities = aggregateCapabilities(options.models);
  }

  async generate(_req: ImageRequest, _signal?: AbortSignal): Promise<ImageGenerationResult> {
    throw new Error("not implemented (M2)");
  }
}
