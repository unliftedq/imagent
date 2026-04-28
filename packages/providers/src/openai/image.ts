import type {
  ImageCapabilities,
  ImageGenerationResult,
  ImageModelDef,
  ImageProvider,
  ImageRequest,
} from "@imagine-studio/core";

export interface OpenAIImageProviderOptions {
  apiKey: string;
  baseUrl?: string | null;
  models: ReadonlyMap<string, ImageModelDef>;
}

/**
 * OpenAI image provider skeleton. M2 implements the actual `images/generations`
 * call with reference uploads via multipart. The `capabilities` field here
 * collapses across the bound `models` so the UI can pick maxima.
 */
export class OpenAIImageProvider implements ImageProvider {
  readonly id = "openai";
  readonly displayName = "OpenAI";
  readonly capabilities: ImageCapabilities;
  readonly models: ReadonlyMap<string, ImageModelDef>;

  constructor(private readonly options: OpenAIImageProviderOptions) {
    this.models = options.models;
    this.capabilities = aggregateCapabilities(options.models);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async generate(_req: ImageRequest, _signal?: AbortSignal): Promise<ImageGenerationResult> {
    throw new Error("not implemented (M2)");
  }
}

function aggregateCapabilities(models: ReadonlyMap<string, ImageModelDef>): ImageCapabilities {
  const sizes = new Set<string>();
  const aspectRatios = new Set<string>();
  let maxReferences = 0;
  let maxOutputs = 1;
  let supportsNegativePrompt = false;
  let supportsSeed = false;
  let supportsStyleRef = false;
  for (const m of models.values()) {
    const c = m.capabilities;
    if (!c) continue;
    for (const s of c.sizes ?? []) sizes.add(s);
    for (const a of c.aspectRatios ?? []) aspectRatios.add(a);
    maxReferences = Math.max(maxReferences, c.maxReferences ?? 0);
    maxOutputs = Math.max(maxOutputs, c.maxOutputs);
    supportsNegativePrompt ||= c.supportsNegativePrompt;
    supportsSeed ||= c.supportsSeed;
    supportsStyleRef ||= c.supportsStyleRef;
  }
  return {
    sizes: [...sizes],
    aspectRatios: [...aspectRatios],
    maxReferences,
    maxOutputs,
    supportsNegativePrompt,
    supportsSeed,
    supportsStyleRef,
  };
}

export { aggregateCapabilities };
