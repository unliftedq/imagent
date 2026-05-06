import {
  ProviderError,
  ProviderRequestError,
  ProviderResponseError,
  applyImageDefaults,
  type ImageCapabilities,
  type ImageGenerationResult,
  type ImageModelDef,
  type ImageOutput,
  type ImageProvider,
  type ImageRequest,
  type Logger,
  type ProviderTestResult,
  validateImageRequestAgainstModel,
} from "@imagent/core";
import OpenAI from "openai";
import {
  aggregateCapabilities,
  buildOpenAIImageBody,
  decodeBase64,
  listModelIds,
  parseSize,
  rethrowOpenAIError,
  testFailureFromError,
  type OpenAIClientLike,
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

    const body = await buildOpenAIImageBody(merged, model, this.id);
    const opts: { signal?: AbortSignal } = {};
    if (signal) opts.signal = signal;

    let response: { data?: Array<{ b64_json?: string; url?: string; revised_prompt?: string }> };
    try {
      if (merged.references.length > 0) {
        if (!this.client.images.edit) {
          throw new ProviderRequestError(`${this.id} SDK client does not expose images.edit`, {
            vendorId: this.id,
          });
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
          ...parseSize(merged.size),
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
