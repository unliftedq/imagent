import {
  appendImageReferenceInstructions,
  type ImageGenerationResult,
  type ImageModelDef,
  type ImageOutput,
  type ImageRequest,
  type Logger,
  ProviderResponseError,
  type ProviderTestResult,
} from "@imagent/core";
import {
  BaseImageProvider,
  decodeBase64,
  parseSize,
  testFailureFromError,
} from "../common/index.js";
import { createHttpClient, type HttpClient } from "../http/index.js";
import { imageDataUrl, loadImageReferences } from "../reference-images.js";
import {
  assertMiniMaxOk,
  DEFAULT_MINIMAX_BASE_URL,
  type MiniMaxBaseResp,
  MINIMAX_AUTH_ERROR_CODES,
  probeMiniMaxAuth,
} from "./shared.js";

const IMAGE_PATH = "/image_generation";

export interface MiniMaxImageProviderOptions {
  apiKey: string;
  baseUrl?: string | null;
  models: ReadonlyMap<string, ImageModelDef>;
  /** Override fetch for image requests (tests). */
  fetch?: typeof fetch;
  logger?: Logger;
}

interface MiniMaxImageResponse {
  id?: string | null;
  data?: { image_base64?: string[] | null; image_urls?: string[] | null } | null;
  metadata?: Record<string, unknown> | null;
  base_resp?: MiniMaxBaseResp | null;
}

/**
 * MiniMax image provider — backed directly by MiniMax's
 * `POST /v1/image_generation` HTTP API (model `image-01`, surfaced in the
 * catalog as `minimax-image-01`). We request `response_format: "base64"` so
 * the response carries the bytes inline; `image_urls` is used as a fallback
 * download path when the API returns URLs instead.
 */
export class MiniMaxImageProvider extends BaseImageProvider {
  private readonly http: HttpClient;
  private readonly baseUrl: string;

  constructor(options: MiniMaxImageProviderOptions) {
    super({
      providerId: "minimax",
      displayName: "MiniMax",
      models: options.models,
      ...(options.logger !== undefined ? { logger: options.logger } : {}),
    });
    this.baseUrl = (options.baseUrl ?? DEFAULT_MINIMAX_BASE_URL).replace(/\/+$/, "");
    this.http = createHttpClient({
      vendorId: this.id,
      baseUrl: this.baseUrl,
      headers: { Authorization: `Bearer ${options.apiKey}` },
      ...(options.fetch !== undefined ? { fetch: options.fetch } : {}),
      ...(options.logger !== undefined ? { logger: options.logger } : {}),
    });
  }

  protected async doGenerate(
    merged: ImageRequest,
    modelDef: ImageModelDef,
    signal?: AbortSignal,
  ): Promise<ImageGenerationResult> {
    const body = await this.buildBody(merged, modelDef);
    const opts: { signal?: AbortSignal } = {};
    if (signal) opts.signal = signal;
    const res = await this.http.post<MiniMaxImageResponse>(IMAGE_PATH, body, opts);
    assertMiniMaxOk(res.base_resp, this.id);

    const base64List = res.data?.image_base64 ?? [];
    const urlList = res.data?.image_urls ?? [];
    const outputs: ImageOutput[] = [];

    for (const b64 of base64List) {
      if (typeof b64 !== "string" || b64.length === 0) continue;
      outputs.push({
        bytes: decodeBase64(b64),
        mimeType: "image/jpeg",
        ...parseSize(merged.size),
      });
    }
    if (outputs.length === 0) {
      for (const url of urlList) {
        if (typeof url !== "string" || url.length === 0) continue;
        const dl = await this.http.getBytes(url, opts);
        outputs.push({
          bytes: dl.bytes,
          mimeType: dl.mimeType.startsWith("image/") ? dl.mimeType : "image/jpeg",
          ...parseSize(merged.size),
        });
      }
    }
    if (outputs.length === 0) {
      throw new ProviderResponseError("MiniMax image response contained no images", {
        vendorId: this.id,
        bodyExcerpt: JSON.stringify(res).slice(0, 512),
      });
    }
    return { outputs };
  }

  private async buildBody(
    merged: ImageRequest,
    model: ImageModelDef,
  ): Promise<Record<string, unknown>> {
    const body: Record<string, unknown> = {
      model: model.id,
      prompt: appendImageReferenceInstructions(merged.prompt, merged.references),
      response_format: "base64",
      n: merged.count,
    };
    // MiniMax accepts either `aspect_ratio` or explicit `width`/`height`
    // (512–2048, multiples of 8) but not both. An explicit size wins so callers
    // can override the model's default aspect ratio; otherwise fall back to the
    // (possibly defaulted) aspect ratio.
    const dims = parseSize(merged.size);
    if (dims.width !== undefined && dims.height !== undefined) {
      body.width = dims.width;
      body.height = dims.height;
    } else if (merged.aspectRatio) {
      body.aspect_ratio = merged.aspectRatio;
    }
    // Subject reference (image-to-image / character consistency). MiniMax only
    // supports `character` references here; we map the first reference image.
    if (merged.references.length > 0) {
      const loaded = await loadImageReferences(merged.references, this.id);
      const first = loaded[0];
      if (first) {
        body.subject_reference = [{ type: "character", image_file: imageDataUrl(first) }];
      }
    }
    if (merged.raw) Object.assign(body, merged.raw);
    return body;
  }

  protected async doTest(signal?: AbortSignal): Promise<ProviderTestResult> {
    const started = Date.now();
    try {
      const code = await probeMiniMaxAuth(this.http, signal);
      if (code !== undefined && MINIMAX_AUTH_ERROR_CODES.has(code)) {
        return { ok: false, reason: `MiniMax authentication failed (status_code ${code})` };
      }
      return { ok: true, latencyMs: Date.now() - started };
    } catch (err) {
      return testFailureFromError(err);
    }
  }
}
