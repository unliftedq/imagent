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
import { AzureOpenAI } from "openai";
import { createHttpClient, type HttpClient } from "../http/index.js";
import {
  aggregateCapabilities,
  buildOpenAIImageBody,
  decodeBase64,
  parseSize,
  rethrowOpenAIError,
  testFailureFromError,
  type OpenAIClientLike,
} from "../openai/image.js";

export interface AzureOpenAIImageProviderOptions {
  endpoint: string;
  apiKey: string;
  apiVersion: string;
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
 * Azure OpenAI image provider — own class, own SDK client. Uses the
 * `openai` package's `AzureOpenAI` subclass which understands Azure's
 * `/openai/deployments/{deployment}/images/generations?api-version=...` URL
 * shape. The deployment name is the catalog key and rides in the `model`
 * slot of the request.
 */
export class AzureOpenAIImageProvider implements ImageProvider {
  readonly id = "azure-openai";
  readonly displayName = "Azure";
  readonly capabilities: ImageCapabilities;
  readonly models: ReadonlyMap<string, ImageModelDef>;
  private readonly client: OpenAIClientLike;
  private readonly listHttp: HttpClient;
  private readonly endpoint: string;
  private readonly apiVersion: string;
  private readonly logger?: Logger;

  constructor(options: AzureOpenAIImageProviderOptions) {
    const endpoint = options.endpoint.replace(/\/+$/, "");
    this.endpoint = endpoint;
    this.apiVersion = options.apiVersion;
    this.models = options.models;
    this.capabilities = aggregateCapabilities(options.models);
    if (options.logger) this.logger = options.logger;

    if (options.client) {
      this.client = options.client;
    } else {
      // AzureOpenAI accepts deployment? — we leave it unset so the URL slot
      // stays driven by req.model (the catalog deployment key).
      const azureOpts: ConstructorParameters<typeof AzureOpenAI>[0] = {
        endpoint,
        apiKey: options.apiKey,
        apiVersion: options.apiVersion,
      };
      if (options.deployment) azureOpts.deployment = options.deployment;
      this.client = new AzureOpenAI(azureOpts) as unknown as OpenAIClientLike;
    }

    this.listHttp = createHttpClient({
      vendorId: this.id,
      headers: { "api-key": options.apiKey },
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

  /**
   * `GET {endpoint}/openai/deployments?api-version=...` — Azure lists the
   * resource's deployments. No SDK helper exposes this directly, so we still
   * use raw HTTP for the probe.
   */
  async test(signal?: AbortSignal): Promise<ProviderTestResult> {
    const started = Date.now();
    const url = `${this.endpoint}/openai/deployments?api-version=${encodeURIComponent(this.apiVersion)}`;
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
      const matched = configured.find((id) => ids.includes(id));
      const out: ProviderTestResult = matched
        ? { ok: true, latencyMs, sampleModelId: matched }
        : configured.length === 0
          ? { ok: true, latencyMs }
          : {
              ok: false,
              reason: `auth ok but no configured deployment found in resource (${configured.join(", ")})`,
            };
      return out;
    } catch (err) {
      this.logger?.debug?.("azure-openai test() failed", { err: String(err) });
      return testFailureFromError(err);
    }
  }
}
