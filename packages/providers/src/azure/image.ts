import {
  appendImageReferenceInstructions,
  applyImageDefaults,
  type ImageCapabilities,
  type ImageGenerationResult,
  type ImageModelDef,
  type ImageOutput,
  type ImageProvider,
  type ImageRequest,
  type Logger,
  ProviderAbortError,
  ProviderError,
  ProviderRequestError,
  ProviderResponseError,
  type ProviderTestResult,
  ProviderTimeoutError,
  validateImageRequestAgainstModel,
} from "@imagent/core";
import OpenAI from "openai";
import { z } from "zod";
import { createHttpClient, type HttpClient } from "../http/index.js";
import {
  aggregateCapabilities,
  buildOpenAIImageBody,
  decodeBase64,
  mimeTypeForOutputFormat,
  type OpenAIClientLike,
  parseSize,
  rethrowOpenAIError,
  testFailureFromError,
} from "../openai/image.js";
import { loadImageReferences } from "../reference-images.js";
import { azureModelFamily, type AzureModelFamily, FOUNDRY_FLUX_MODELS } from "./families.js";

export interface AzureImageProviderOptions {
  endpoint: string;
  apiKey: string;
  /** Optional default deployment. The catalog map keys are deployment names. */
  deployment?: string;
  /** Deployment name → resolved model definition. */
  models: ReadonlyMap<string, ImageModelDef>;
  /** Inject SDK client (tests). */
  client?: OpenAIClientLike;
  /** Inject fetch for non-SDK paths (MAI / FLUX generate, deployment listing). */
  fetch?: typeof fetch;
  logger?: Logger;
  /** Override polling envelope for FLUX submit/poll (mostly for tests). */
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
  /** Sleep injection for FLUX polling (tests). */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

const MaiResponseSchema = z.object({
  data: z
    .array(
      z.object({
        b64_json: z.string().optional(),
      }),
    )
    .nonempty(),
});

const FluxSubmitResponseSchema = z.object({
  id: z.string().optional(),
  polling_url: z.string().optional(),
  status: z.string().optional(),
  result: z
    .object({
      sample: z.string().optional(),
    })
    .nullable()
    .optional(),
  data: z
    .array(
      z.object({
        b64_json: z.string().optional(),
        url: z.string().optional(),
      }),
    )
    .optional(),
  error: z.string().nullable().optional(),
});

const FluxPollResponseSchema = z.object({
  id: z.string().optional(),
  status: z.string(),
  result: z
    .object({
      sample: z.string().optional(),
    })
    .nullable()
    .optional(),
  progress: z.number().optional(),
  error: z.string().nullable().optional(),
});

// FLUX BFL polling envelope — mirrors the BFL direct provider so behaviour
// is consistent across both routes.
const FLUX_POLL_INITIAL_MS = 1_000;
const FLUX_POLL_MAX_MS = 5_000;
const FLUX_POLL_TIMEOUT_MS = 60_000;
const FLUX_POLL_BACKOFF = 1.6;

/**
 * Azure Foundry image provider. One Azure resource hosts deployments from
 * multiple model families — GPT-Image (OpenAI-compatible), Microsoft
 * MAI-Image, and BFL FLUX — each with its own URL prefix and request shape.
 * We dispatch on the canonical model id (`baseModelId`) so deployment names
 * stay arbitrary.
 *
 * **Family routing**
 *
 *   - `openai-images` (gpt-image-*):
 *     `{endpoint}/openai/v1/images/{generations,edits}` — OpenAI SDK,
 *     `Authorization: Bearer <key>` (set by the SDK).
 *   - `mai-images` (MAI-Image-2 / MAI-Image-2e):
 *     `{endpoint}/mai/v1/images/generations` — raw HTTP, `api-key: <key>`
 *     header, body `{model, prompt, width, height}`, PNG-only response.
 *   - `flux-bfl` (FLUX.2 [pro|flex], FLUX.1 Kontext [pro], FLUX1.1 [pro]):
 *     `{endpoint}/providers/blackforestlabs/v1/<path>?api-version=preview`
 *     on the same Foundry host as everything else. `Authorization: Bearer
 *     <key>`. Async submit + poll (mirrors BFL's direct contract) with
 *     synchronous-response fallback.
 *
 * **Why the OpenAI v1 endpoint (not legacy `/openai/deployments/{name}/...`)?**
 * Newer image models (gpt-image-2 family) on Azure AI Foundry resources
 * return 404 from the per-deployment URL — they're only routable via v1.
 * Foundry resources (`*.services.ai.azure.com`) and recent Azure OpenAI
 * resources (`*.openai.azure.com`) both expose `/openai/v1/...`. The
 * deployment name rides in the request body's `model` field.
 *
 * The class is exported as both `AzureImageProvider` (preferred) and
 * `AzureOpenAIImageProvider` (back-compat alias) — see the bottom of the file.
 */
export class AzureImageProvider implements ImageProvider {
  readonly id = "azure";
  readonly displayName = "Azure";
  readonly capabilities: ImageCapabilities;
  readonly models: ReadonlyMap<string, ImageModelDef>;
  private readonly client: OpenAIClientLike;
  /** HTTP client for non-SDK paths using `api-key` auth (MAI + listing). */
  private readonly http: HttpClient;
  /** HTTP client for FLUX BFL paths using `Authorization: Bearer` auth. */
  private readonly fluxHttp: HttpClient;
  private readonly endpoint: string;
  private readonly logger?: Logger;
  private readonly pollIntervalMs: number;
  private readonly pollTimeoutMs: number;
  private readonly sleep: (ms: number, signal?: AbortSignal) => Promise<void>;

  constructor(options: AzureImageProviderOptions) {
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

    // Azure cognitive services accept the API key as `api-key` header (the
    // canonical Azure form). Used for MAI generate calls and the deployment
    // listing probe — the OpenAI SDK manages its own Bearer auth.
    const httpOpts: Parameters<typeof createHttpClient>[0] = {
      vendorId: this.id,
      headers: { "api-key": options.apiKey },
      ...(options.fetch !== undefined ? { fetch: options.fetch } : {}),
      ...(options.logger !== undefined ? { logger: options.logger } : {}),
    };
    this.http = createHttpClient(httpOpts);

    // FLUX BFL provider API on Azure expects `Authorization: Bearer <key>`
    // (per the Foundry doc) — different from MAI's `api-key`.
    const fluxOpts: Parameters<typeof createHttpClient>[0] = {
      vendorId: this.id,
      headers: { Authorization: `Bearer ${options.apiKey}` },
      ...(options.fetch !== undefined ? { fetch: options.fetch } : {}),
      ...(options.logger !== undefined ? { logger: options.logger } : {}),
    };
    this.fluxHttp = createHttpClient(fluxOpts);

    this.pollIntervalMs = options.pollIntervalMs ?? FLUX_POLL_INITIAL_MS;
    this.pollTimeoutMs = options.pollTimeoutMs ?? FLUX_POLL_TIMEOUT_MS;
    this.sleep = options.sleep ?? defaultSleep;
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

    const family: AzureModelFamily = azureModelFamily(model);
    switch (family) {
      case "mai-images":
        return this.generateMai(merged, model, signal);
      case "flux-bfl":
        return this.generateFluxBfl(merged, model, signal);
      case "openai-images":
        return this.generateOpenAI(merged, model, signal);
    }
  }

  /**
   * `GET {endpoint}/openai/v1/models` — list the resource's deployments via
   * the v1 surface. (The legacy `/openai/deployments?api-version=...` route
   * still works on most resources but requires a dated api-version; the v1
   * `/models` endpoint matches the auth/URL shape we use for generation, so
   * we keep them aligned.) The listing covers all families on the resource —
   * MAI and FLUX deployments show up here too.
   */
  async test(signal?: AbortSignal): Promise<ProviderTestResult> {
    const started = Date.now();
    const url = `${this.endpoint}/openai/v1/models`;
    try {
      const opts: { signal?: AbortSignal } = {};
      if (signal) opts.signal = signal;
      const response = await this.http.get<{
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
        ids.some((listed) => listed === d || d.startsWith(listed) || listed.startsWith(d)),
      );
      // Auth working is the only hard requirement — mirror the OpenAI probe
      // and never flag `ok:false` just because the deployment name didn't
      // happen to appear in the listing. Generation calls give the precise
      // error if the deployment is actually missing.
      const out: ProviderTestResult = matched
        ? { ok: true, latencyMs, sampleModelId: matched }
        : { ok: true, latencyMs };
      if (!matched && configured.length > 0) {
        this.logger?.debug?.("azure test(): no exact deployment match in /models listing", {
          configured,
          listed: ids,
        });
      }
      return out;
    } catch (err) {
      this.logger?.debug?.("azure test() failed", { err: String(err) });
      return testFailureFromError(err);
    }
  }

  /** OpenAI Image API family (gpt-image-*). Routes through the SDK. */
  private async generateOpenAI(
    req: ImageRequest,
    model: ImageModelDef,
    signal?: AbortSignal,
  ): Promise<ImageGenerationResult> {
    const body = await buildOpenAIImageBody(req, model, this.id);
    const opts: { signal?: AbortSignal } = {};
    if (signal) opts.signal = signal;

    let response: { data?: Array<{ b64_json?: string; url?: string; revised_prompt?: string }> };
    try {
      if (req.references.length > 0) {
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
          mimeType: mimeTypeForOutputFormat(req.outputFormat),
          ...parseSize(req.size),
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
   * MAI Image family (MAI-Image-2 / MAI-Image-2e). The MAI surface accepts
   * raw `width`/`height` integers (the OpenAI-style `size` string is not
   * supported), only emits PNG, and returns a single base64 image at
   * `data[0].b64_json`. Reference images are not supported by the API.
   */
  private async generateMai(
    req: ImageRequest,
    model: ImageModelDef,
    signal?: AbortSignal,
  ): Promise<ImageGenerationResult> {
    if (req.references.length > 0) {
      throw new ProviderRequestError(
        `model ${model.id} (MAI Image) does not accept reference images`,
        { vendorId: this.id },
      );
    }
    const dims = parseSize(req.size);
    if (dims.width === undefined || dims.height === undefined) {
      throw new ProviderRequestError(
        `model ${model.id} (MAI Image) requires a WIDTHxHEIGHT size (got '${req.size ?? ""}')`,
        { vendorId: this.id },
      );
    }
    const url = `${this.endpoint}/mai/v1/images/generations`;
    const body: Record<string, unknown> = {
      model: model.id,
      prompt: req.prompt,
      width: dims.width,
      height: dims.height,
    };
    if (req.raw) Object.assign(body, req.raw);

    const opts: { signal?: AbortSignal; schema: typeof MaiResponseSchema } = {
      schema: MaiResponseSchema,
    };
    if (signal) opts.signal = signal;
    const response = await this.http.post<z.infer<typeof MaiResponseSchema>>(url, body, opts);

    const outputs: ImageOutput[] = [];
    for (const entry of response.data) {
      if (!entry.b64_json) {
        throw new ProviderResponseError("MAI response entry missing b64_json", {
          vendorId: this.id,
        });
      }
      outputs.push({
        bytes: decodeBase64(entry.b64_json),
        mimeType: "image/png",
        width: dims.width,
        height: dims.height,
      });
    }
    if (outputs.length === 0) {
      throw new ProviderError("MAI response returned no image outputs", { vendorId: this.id });
    }
    return { outputs };
  }

  /**
   * FLUX BFL family. Submits to the BFL provider-specific Foundry endpoint
   * and handles two possible response shapes:
   *
   *   1. Async (BFL-native): `{id, polling_url}` — poll until `Ready`, then
   *      download `result.sample` bytes.
   *   2. Sync wrapper: `{data: [{b64_json|url}]}` or `{result: {sample}}`
   *      with a terminal `status` — return the image directly.
   *
   * Reference images attach as `input_image`, `input_image_2`, ... base64
   * fields per the FLUX.2 multi-reference contract.
   */
  private async generateFluxBfl(
    req: ImageRequest,
    model: ImageModelDef,
    signal?: AbortSignal,
  ): Promise<ImageGenerationResult> {
    const canonical = model.baseModelId ?? model.id;
    const mapping = FOUNDRY_FLUX_MODELS.get(canonical);
    if (!mapping) {
      throw new ProviderRequestError(
        `model ${model.id} maps to '${canonical}', which is not a supported Azure Foundry FLUX model. Supported: ${[...FOUNDRY_FLUX_MODELS.keys()].join(", ")}`,
        { vendorId: this.id },
      );
    }

    const submitUrl = `${this.endpoint}/providers/blackforestlabs/v1/${mapping.path}?api-version=preview`;
    const body = await this.buildFluxBody(req, mapping.bodyModel);

    const submitOpts: { signal?: AbortSignal; schema: typeof FluxSubmitResponseSchema } = {
      schema: FluxSubmitResponseSchema,
    };
    if (signal) submitOpts.signal = signal;
    const submit = await this.fluxHttp.post<z.infer<typeof FluxSubmitResponseSchema>>(
      submitUrl,
      body,
      submitOpts,
    );

    // Sync response — terminal in one shot.
    const syncOutputs = await this.maybeReadFluxSyncResponse(submit, signal);
    if (syncOutputs) return { outputs: syncOutputs };

    // Async response — poll the polling_url until terminal.
    if (!submit.polling_url) {
      throw new ProviderResponseError(
        `FLUX submit response had neither image data nor polling_url: ${JSON.stringify(submit).slice(0, 256)}`,
        { vendorId: this.id },
      );
    }
    return this.pollFluxJob(submit.polling_url, submit.id ?? "(unknown)", signal);
  }

  /**
   * Recognise the synchronous response shapes (data array or terminal status
   * with `result.sample`). Returns `null` when the response is async-style
   * (caller should poll). Throws on terminal-but-failed states.
   */
  private async maybeReadFluxSyncResponse(
    submit: z.infer<typeof FluxSubmitResponseSchema>,
    signal?: AbortSignal,
  ): Promise<ImageOutput[] | null> {
    if (submit.data && submit.data.length > 0) {
      const outputs: ImageOutput[] = [];
      for (const entry of submit.data) {
        if (entry.b64_json) {
          outputs.push({
            bytes: decodeBase64(entry.b64_json),
            mimeType: "image/png",
          });
        } else if (entry.url) {
          const dl = await this.fluxHttp.getBytes(entry.url, signal ? { signal } : {});
          outputs.push({
            bytes: dl.bytes,
            mimeType: dl.mimeType.startsWith("image/") ? dl.mimeType : "image/png",
          });
        } else {
          throw new ProviderResponseError("FLUX response entry missing b64_json and url", {
            vendorId: this.id,
          });
        }
      }
      return outputs;
    }

    const status = submit.status;
    if (status === "Ready" && submit.result?.sample) {
      const dl = await this.fluxHttp.getBytes(submit.result.sample, signal ? { signal } : {});
      return [
        {
          bytes: dl.bytes,
          mimeType: dl.mimeType.startsWith("image/") ? dl.mimeType : "image/png",
        },
      ];
    }
    if (
      status === "Error" ||
      status === "Failed" ||
      status === "Content Moderated" ||
      status === "Request Moderated"
    ) {
      throw new ProviderError(`FLUX job ended in state '${status}': ${submit.error ?? ""}`, {
        vendorId: this.id,
      });
    }
    return null;
  }

  private async pollFluxJob(
    pollUrl: string,
    jobId: string,
    signal?: AbortSignal,
  ): Promise<ImageGenerationResult> {
    const start = Date.now();
    let interval = this.pollIntervalMs;
    while (true) {
      if (signal?.aborted) {
        throw new ProviderAbortError(this.id, signal.reason);
      }
      if (Date.now() - start > this.pollTimeoutMs) {
        throw new ProviderTimeoutError(
          `Azure FLUX job ${jobId} did not complete within ${this.pollTimeoutMs}ms`,
          { vendorId: this.id },
        );
      }
      await this.sleep(interval, signal);
      const pollOpts: { signal?: AbortSignal; schema: typeof FluxPollResponseSchema } = {
        schema: FluxPollResponseSchema,
      };
      if (signal) pollOpts.signal = signal;
      const status = await this.fluxHttp.get<z.infer<typeof FluxPollResponseSchema>>(
        pollUrl,
        pollOpts,
      );

      const s = status.status;
      if (s === "Ready") {
        const sample = status.result?.sample;
        if (!sample) {
          throw new ProviderError("Azure FLUX Ready response missing result.sample url", {
            vendorId: this.id,
          });
        }
        const dl = await this.fluxHttp.getBytes(sample, signal ? { signal } : {});
        return {
          outputs: [
            {
              bytes: dl.bytes,
              mimeType: dl.mimeType.startsWith("image/") ? dl.mimeType : "image/png",
            },
          ],
        };
      }
      if (s === "Error" || s === "Failed" || s === "Content Moderated" || s === "Request Moderated") {
        throw new ProviderError(`Azure FLUX job ended in state '${s}': ${status.error ?? ""}`, {
          vendorId: this.id,
        });
      }
      interval = Math.min(Math.round(interval * FLUX_POLL_BACKOFF), FLUX_POLL_MAX_MS);
    }
  }

  private async buildFluxBody(
    req: ImageRequest,
    bodyModel: string,
  ): Promise<Record<string, unknown>> {
    const out: Record<string, unknown> = {
      model: bodyModel,
      prompt: appendImageReferenceInstructions(req.prompt, req.references),
    };
    if (req.size) {
      const dims = parseSize(req.size);
      if (dims.width !== undefined) out.width = dims.width;
      if (dims.height !== undefined) out.height = dims.height;
    }
    if (req.aspectRatio) out.aspect_ratio = req.aspectRatio;
    if (req.outputFormat) out.output_format = req.outputFormat;
    if (req.count > 1) out.num_images = req.count;
    if (req.references.length > 0) {
      const refs = await loadImageReferences(req.references, this.id);
      // FLUX.2 multi-reference shape: `input_image`, `input_image_2`,
      // `input_image_3`, ... (base64-only, no data: prefix).
      refs.forEach((ref, i) => {
        const key = i === 0 ? "input_image" : `input_image_${i + 1}`;
        out[key] = ref.base64;
      });
    }
    if (req.raw) Object.assign(out, req.raw);
    return out;
  }
}

export { azureModelFamily, type AzureModelFamily, FOUNDRY_FLUX_MODELS } from "./families.js";

async function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const handle = setTimeout(() => {
      if (signal) signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(handle);
      reject(new ProviderAbortError("azure", signal?.reason));
    };
    if (signal) {
      if (signal.aborted) {
        clearTimeout(handle);
        reject(new ProviderAbortError("azure", signal.reason));
        return;
      }
      signal.addEventListener("abort", onAbort, { once: true });
    }
  });
}
