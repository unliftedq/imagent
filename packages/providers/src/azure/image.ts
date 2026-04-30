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
} from "@imagine/core";
import OpenAI from "openai";
import { createHttpClient, type HttpClient } from "../http/index.js";
import {
  aggregateCapabilities,
  buildOpenAIImageBody,
  decodeBase64,
  mimeTypeForOutputFormat,
  parseSize,
  rethrowOpenAIError,
  testFailureFromError,
  type OpenAIClientLike,
} from "../openai/image.js";

export interface AzureOpenAIImageProviderOptions {
  endpoint: string;
  apiKey: string;
  /** Optional default deployment. The catalog map keys are deployment names. */
  deployment?: string;
  /** Deployment name → resolved model definition. */
  models: ReadonlyMap<string, ImageModelDef>;
  /** Inject SDK client (tests). */
  client?: OpenAIClientLike;
  /** Inject fetch for test() (deployments listing — no SDK method exists). */
  fetch?: typeof fetch;
  logger?: Logger;
}

/**
 * Azure OpenAI image provider — own class, own SDK client. Routes through the
 * v1 endpoint surface: `{endpoint}/openai/v1/images/generations`.
 *
 * Why not the legacy `/openai/deployments/{deployment}/...` route?
 *
 *   - Newer image models (gpt-image-2 family) on Azure AI Foundry resources
 *     return 404 from the per-deployment URL — they're only routable via v1.
 *   - Foundry resources (`*.services.ai.azure.com`) and recent Azure OpenAI
 *     resources (`*.openai.azure.com`) both expose `/openai/v1/...`.
 *
 * The v1 endpoint authenticates with `Authorization: Bearer <api-key>` (the
 * OpenAI SDK's default) and does not require an `api-version` query param —
 * matching the canonical Azure AI Foundry sample. The deployment name rides
 * in the request body's `model` field.
 */
export class AzureOpenAIImageProvider implements ImageProvider {
  readonly id = "azure-openai";
  readonly displayName = "Azure";
  readonly capabilities: ImageCapabilities;
  readonly models: ReadonlyMap<string, ImageModelDef>;
  private readonly client: OpenAIClientLike;
  private readonly listHttp: HttpClient;
  private readonly endpoint: string;
  private readonly logger?: Logger;

  constructor(options: AzureOpenAIImageProviderOptions) {
    const endpoint = options.endpoint.replace(/\/+$/, "");
    this.endpoint = endpoint;
    this.models = options.models;
    this.capabilities = aggregateCapabilities(options.models);
    if (options.logger) this.logger = options.logger;

    if (options.client) {
      this.client = options.client;
    } else {
      // Plain `OpenAI` (not `AzureOpenAI`) — see class doc above for why.
      this.client = new OpenAI({
        apiKey: options.apiKey,
        baseURL: `${endpoint}/openai/v1`,
      }) as unknown as OpenAIClientLike;
    }

    // The v1 endpoint authenticates with `Authorization: Bearer <api-key>`
    // (same as the SDK above) — matches the canonical Foundry sample.
    this.listHttp = createHttpClient({
      vendorId: this.id,
      headers: { Authorization: `Bearer ${options.apiKey}` },
      ...(options.fetch !== undefined ? { fetch: options.fetch } : {}),
      ...(options.logger !== undefined ? { logger: options.logger } : {}),
    });
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

    const body = buildOpenAIImageBody(merged, model);
    const opts: { signal?: AbortSignal } = {};
    if (signal) opts.signal = signal;

    let response: { data?: Array<{ b64_json?: string; url?: string; revised_prompt?: string }> };
    try {
      response = await this.client.images.generate(body, opts);
    } catch (err) {
      throw rethrowOpenAIError(err, this.id);
    }

    const data = response?.data ?? [];
    const outputs: ImageOutput[] = [];
    for (const entry of data) {
      if (entry.b64_json) {
        outputs.push({
          bytes: decodeBase64(entry.b64_json),
          mimeType: mimeTypeForOutputFormat(merged.outputFormat),
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

  /**
   * `GET {endpoint}/openai/v1/models` — list the resource's deployments via
   * the v1 surface. (The legacy `/openai/deployments?api-version=...` route
   * still works on most resources but requires a dated api-version; the v1
   * `/models` endpoint matches the auth/URL shape we use for generation, so
   * we keep them aligned.)
   */
  async test(signal?: AbortSignal): Promise<ProviderTestResult> {
    const started = Date.now();
    const url = `${this.endpoint}/openai/v1/models`;
    try {
      const opts: { signal?: AbortSignal } = {};
      if (signal) opts.signal = signal;
      const response = await this.listHttp.get<{
        data?: Array<{ id?: string; model?: string; deploymentName?: string }>;
      }>(url, opts);
      const latencyMs = Date.now() - started;
      const ids = (response?.data ?? [])
        .map((d) => d.deploymentName ?? d.id ?? d.model)
        .filter((s): s is string => typeof s === "string");
      const configured = [...this.models.keys()];
      // Match a configured deployment against the returned list. Azure's v1
      // `/models` endpoint may return underlying model names (e.g.
      // `gpt-image-2`) instead of the user's deployment name (e.g.
      // `gpt-image-2-1`), so we also accept loose matches in either direction
      // — the field is only used as an informational sample-id annotation.
      const matched = configured.find((d) =>
        ids.some(
          (listed) =>
            listed === d ||
            d.startsWith(listed) ||
            listed.startsWith(d),
        ),
      );
      // Auth working is the only hard requirement — mirror the OpenAI probe
      // and never flag `ok:false` just because the deployment name didn't
      // happen to appear in the listing. Generation calls give the precise
      // error if the deployment is actually missing.
      const out: ProviderTestResult = matched
        ? { ok: true, latencyMs, sampleModelId: matched }
        : { ok: true, latencyMs };
      if (!matched && configured.length > 0) {
        this.logger?.debug?.(
          "azure-openai test(): no exact deployment match in /models listing",
          { configured, listed: ids },
        );
      }
      return out;
    } catch (err) {
      this.logger?.debug?.("azure-openai test() failed", { err: String(err) });
      return testFailureFromError(err);
    }
  }
}
