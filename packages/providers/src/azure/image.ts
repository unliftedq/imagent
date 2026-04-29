import type {
  ImageGenerationResult,
  ImageModelDef,
  ImageProvider,
  ImageRequest,
  ImageCapabilities,
  Logger,
  ProviderTestResult,
} from "@imagine/core";
import { createHttpClient, type HttpClient } from "../http/index.js";
import { OpenAIImageProvider, testFailureFromError } from "../openai/image.js";

export interface AzureOpenAIImageProviderOptions {
  endpoint: string;
  apiKey: string;
  apiVersion: string;
  /** Deployment name → resolved model definition. */
  models: ReadonlyMap<string, ImageModelDef>;
  fetch?: typeof fetch;
  logger?: Logger;
}

/**
 * Azure shares the OpenAI image schema entirely; only the URL and auth header
 * differ. We compose `OpenAIImageProvider` with custom `urlBuilder` (deployment +
 * api-version) and `authHeader` (`api-key` instead of `Bearer`). Body shape,
 * caps validation, b64 decode — all reused.
 */
export class AzureOpenAIImageProvider implements ImageProvider {
  private readonly inner: OpenAIImageProvider;
  private readonly listHttp: HttpClient;
  private readonly endpoint: string;
  private readonly apiVersion: string;
  readonly id = "azure-openai";
  readonly displayName = "Azure OpenAI";
  readonly models: ReadonlyMap<string, ImageModelDef>;
  readonly capabilities: ImageCapabilities;

  constructor(options: AzureOpenAIImageProviderOptions) {
    const endpoint = options.endpoint.replace(/\/+$/, "");
    const apiVersion = options.apiVersion;
    this.endpoint = endpoint;
    this.apiVersion = apiVersion;
    this.models = options.models;
    this.inner = new OpenAIImageProvider({
      apiKey: options.apiKey,
      models: options.models,
      providerId: "azure-openai",
      displayName: "Azure OpenAI",
      // Azure path: {endpoint}/openai/deployments/{deployment}/images/generations?api-version=...
      urlBuilder: (deployment) =>
        `${endpoint}/openai/deployments/${encodeURIComponent(deployment)}/images/generations?api-version=${encodeURIComponent(apiVersion)}`,
      authHeader: (k) => ({ "api-key": k }),
      ...(options.fetch !== undefined ? { fetch: options.fetch } : {}),
      ...(options.logger !== undefined ? { logger: options.logger } : {}),
    });
    this.capabilities = this.inner.capabilities;
    this.listHttp = createHttpClient({
      vendorId: this.id,
      headers: { "api-key": options.apiKey },
      ...(options.fetch !== undefined ? { fetch: options.fetch } : {}),
      ...(options.logger !== undefined ? { logger: options.logger } : {}),
    });
  }

  generate(req: ImageRequest, signal?: AbortSignal): Promise<ImageGenerationResult> {
    return this.inner.generate(req, signal);
  }

  /**
   * `GET {endpoint}/openai/deployments?api-version=...` — Azure lists the
   * resource's deployments. We require at least one configured deployment to
   * appear; if not, treat as auth-ok-but-misconfigured.
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
      return testFailureFromError(err);
    }
  }
}
