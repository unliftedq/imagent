import {
  type ImageModelDef,
  type ImageRequest,
  type Logger,
  type ProviderTestResult,
} from "@imagent/core";
import OpenAI from "openai";
import {
  listOpenAIModelIds,
  type OpenAICompatibleBody,
  OpenAICompatibleImageProvider,
  type OpenAIClientLike,
  parseSize,
  runListProbe,
} from "../common/index.js";
import { buildOpenAIImageBody, rethrowOpenAIError } from "../openai/image.js";

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
export class ByteDanceImageProvider extends OpenAICompatibleImageProvider {
  constructor(options: ByteDanceImageProviderOptions) {
    const client =
      options.client ??
      (new OpenAI({
        apiKey: options.apiKey,
        baseURL: options.endpoint.replace(/\/+$/, ""),
      }) as unknown as OpenAIClientLike);
    super({
      providerId: "bytedance",
      displayName: "ByteDance",
      models: options.models,
      ...(options.logger !== undefined ? { logger: options.logger } : {}),
      client,
      // Ark returns base64 only; no URL fallback.
      supportsUrlFallback: false,
      rethrowSdkError: rethrowOpenAIError,
    });
  }

  protected async buildBody(
    merged: ImageRequest,
    model: ImageModelDef,
  ): Promise<OpenAICompatibleBody> {
    const quality = normalizeSeedreamQuality(merged.quality);
    const body = await buildOpenAIImageBody({ ...merged, quality: undefined }, model, "bytedance");
    delete body.quality;

    const customSize = parseSize(merged.size).width !== undefined ? merged.size : undefined;
    if (customSize) {
      body.size = customSize;
      return { body, outputSize: customSize, mimeType: "image/png" };
    }

    const aspectRatio = merged.aspectRatio ?? "auto";
    if (aspectRatio === "auto") {
      body.size = quality;
      return { body, outputSize: undefined, mimeType: "image/png" };
    }

    const recommendedSize = SEEDREAM_ASPECT_RATIO_SIZES[quality][aspectRatio];
    if (recommendedSize) {
      body.size = recommendedSize;
      return { body, outputSize: recommendedSize, mimeType: "image/png" };
    }

    body.size = quality;
    return { body, outputSize: undefined, mimeType: "image/png" };
  }

  protected async doTest(signal?: AbortSignal): Promise<ProviderTestResult> {
    const probeSignal = signal ?? AbortSignal.timeout(8000);
    return runListProbe({
      listIds: (s) => listOpenAIModelIds(this.client, s),
      configuredIds: [...this.models.keys()],
      signal: probeSignal,
    });
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

function normalizeSeedreamQuality(value: string | undefined): SeedreamQuality {
  const normalized = value?.toLowerCase();
  if (normalized === "1k" || normalized === "2k" || normalized === "3k" || normalized === "4k") {
    return normalized;
  }
  return "2k";
}
