import {
  applyImageDefaults,
  type ImageCapabilities,
  type ImageGenerationResult,
  type ImageModelDef,
  type ImageOutput,
  type ImageProvider,
  type ImageRequest,
  type Logger,
  ProviderError,
  ProviderRequestError,
  ProviderResponseError,
  type ProviderTestResult,
  validateImageRequestAgainstModel,
} from "@imagent/core";
import OpenAI from "openai";
import {
  aggregateCapabilities,
  buildOpenAIImageBody,
  decodeBase64,
  listModelIds,
  type OpenAIClientLike,
  parseSize,
  rethrowOpenAIError,
  testFailureFromError,
} from "../openai/image.js";

/**
 * Canonical ByteDance Ark base URL (Seedream image + Seedance video).
 * Kept exported as a UI-side reference constant for placeholder text — the
 * provider class itself no longer consumes it; callers must supply
 * `endpoint` explicitly.
 */
export const DEFAULT_BYTEDANCE_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";

export interface ByteDanceImageProviderOptions {
  apiKey: string;
  endpoint: string;
  models: ReadonlyMap<string, ImageModelDef>;
  client?: OpenAIClientLike;
  logger?: Logger;
}

/**
 * ByteDance image provider — backed by Ark's OpenAI-compatible image API.
 * Constructs its own `OpenAI` SDK client with the Ark base URL. Default
 * model family is Seedream. Shares an Ark API key with
 * `ByteDanceVideoProvider`; both report `id = "bytedance"`.
 */
export class ByteDanceImageProvider implements ImageProvider {
  readonly id = "bytedance";
  readonly displayName = "ByteDance";
  readonly models: ReadonlyMap<string, ImageModelDef>;
  readonly capabilities: ImageCapabilities;
  private readonly client: OpenAIClientLike;
  private readonly logger?: Logger;

  constructor(options: ByteDanceImageProviderOptions) {
    this.models = options.models;
    this.capabilities = aggregateCapabilities(options.models);
    if (options.logger) this.logger = options.logger;
    this.client =
      options.client ??
      (new OpenAI({
        apiKey: options.apiKey,
        baseURL: options.endpoint.replace(/\/+$/, ""),
      }) as unknown as OpenAIClientLike);
  }

  async generate(req: ImageRequest, signal?: AbortSignal): Promise<ImageGenerationResult> {
    const model = this.models.get(req.model);
    if (!model) {
      throw new ProviderRequestError(`unknown model '${req.model}' for ${this.id}`, {
        vendorId: this.id,
      });
    }
    const merged = applyImageDefaults(req, model);
    validateImageRequestAgainstModel(this.id, merged, model);

    const { body, outputSize } = await buildByteDanceImageBody(merged, model);
    const opts: { signal?: AbortSignal } = {};
    if (signal) opts.signal = signal;

    let response: { data?: Array<{ b64_json?: string; url?: string; revised_prompt?: string }> };
    try {
      if (merged.references.length > 0) {
        if (!this.client.images.edit) {
          throw new ProviderRequestError(
            `${this.id} SDK client does not support image references via images.edit API. Ensure you are using an SDK version that includes the edit method.`,
            { vendorId: this.id },
          );
        }
        response = await this.client.images.edit(body, opts);
      } else {
        response = await this.client.images.generate(body, opts);
      }
    } catch (err) {
      throw rethrowOpenAIError(err, this.id);
    }

    const data = response?.data ?? [];
    const outputs: ImageOutput[] = [];
    for (const entry of data) {
      if (entry.b64_json) {
        outputs.push({
          bytes: decodeBase64(entry.b64_json),
          mimeType: "image/png",
          ...parseSize(outputSize),
          ...(entry.revised_prompt ? { raw: { revised_prompt: entry.revised_prompt } } : {}),
        });
      } else {
        throw new ProviderResponseError("response entry missing b64_json", {
          vendorId: this.id,
        });
      }
    }
    if (outputs.length === 0) {
      throw new ProviderError("no image outputs returned", { vendorId: this.id });
    }
    return { outputs };
  }

  async test(signal?: AbortSignal): Promise<ProviderTestResult> {
    const started = Date.now();
    const probeSignal = signal ?? AbortSignal.timeout(8000);
    try {
      const ids = await listModelIds(this.client, probeSignal);
      const latencyMs = Date.now() - started;
      const configured = [...this.models.keys()];
      const matched = configured.find((id) => ids.includes(id));
      const out: ProviderTestResult = matched
        ? { ok: true, latencyMs, sampleModelId: matched }
        : { ok: true, latencyMs };
      return out;
    } catch (err) {
      this.logger?.debug?.("bytedance test() failed", { err: String(err) });
      return testFailureFromError(err);
    }
  }
}

type SeedreamQuality = "1k" | "2k" | "3k" | "4k";

const SEEDREAM_ASPECT_RATIO_SIZES: Record<SeedreamQuality, Record<string, string>> = {
  "1k": {
    "1:1": "1024x1024",
    "2:3": "832x1248",
    "3:2": "1248x832",
    "3:4": "864x1152",
    "4:3": "1152x864",
    "4:5": "912x1140",
    "5:4": "1140x912",
    "16:9": "1280x720",
    "9:16": "720x1280",
    "21:9": "1512x648",
  },
  "2k": {
    "1:1": "2048x2048",
    "2:3": "1664x2496",
    "3:2": "2496x1664",
    "3:4": "1728x2304",
    "4:3": "2304x1728",
    "4:5": "1824x2280",
    "5:4": "2280x1824",
    "16:9": "2560x1440",
    "9:16": "1440x2560",
    "21:9": "3024x1296",
  },
  "3k": {
    "1:1": "3072x3072",
    "2:3": "2496x3744",
    "3:2": "3744x2496",
    "3:4": "2592x3456",
    "4:3": "3456x2592",
    "4:5": "2736x3420",
    "5:4": "3420x2736",
    "16:9": "3840x2160",
    "9:16": "2160x3840",
    "21:9": "4536x1944",
  },
  "4k": {
    "1:1": "4096x4096",
    "2:3": "3328x4992",
    "3:2": "4992x3328",
    "3:4": "3456x4608",
    "4:3": "4608x3456",
    "4:5": "3648x4560",
    "5:4": "4560x3648",
    "16:9": "5120x2880",
    "9:16": "2880x5120",
    "21:9": "6048x2592",
  },
};

async function buildByteDanceImageBody(
  req: ImageRequest,
  model: ImageModelDef,
): Promise<{ body: Record<string, unknown>; outputSize: string | undefined }> {
  const quality = normalizeSeedreamQuality(req.quality);
  const body = await buildOpenAIImageBody({ ...req, quality: undefined }, model, "bytedance");
  delete body.quality;

  const customSize = parseSize(req.size) ? req.size : undefined;
  if (customSize) {
    body.size = customSize;
    return { body, outputSize: customSize };
  }

  const aspectRatio = req.aspectRatio ?? "auto";
  if (aspectRatio === "auto") {
    body.size = quality;
    return { body, outputSize: undefined };
  }

  const recommendedSize = SEEDREAM_ASPECT_RATIO_SIZES[quality][aspectRatio];
  if (recommendedSize) {
    body.size = recommendedSize;
    return { body, outputSize: recommendedSize };
  }

  body.size = quality;
  return { body, outputSize: undefined };
}

function normalizeSeedreamQuality(value: string | undefined): SeedreamQuality {
  const normalized = value?.toLowerCase();
  if (normalized === "1k" || normalized === "2k" || normalized === "3k" || normalized === "4k") {
    return normalized;
  }
  return "2k";
}
