import {
  appendImageReferenceInstructions,
  type ImageGenerationResult,
  type ImageModelDef,
  type ImageRequest,
  type ImageOutput,
  type Logger,
  ProviderError,
  ProviderRequestError,
  ProviderResponseError,
  type ProviderTestResult,
} from "@imagent/core";
import OpenAI from "openai";
import { z } from "zod";
import {
  BaseImageProvider,
  callOpenAIImageEndpoint,
  createAbortableSleep,
  decodeBase64,
  decodeOpenAIImageResponse,
  DEFAULT_FLUX_POLL_ENVELOPE,
  type FluxPollEnvelope,
  FluxSubmitResponseSchema,
  mimeTypeForOutputFormat,
  type OpenAIClientLike,
  parseSize,
  pollFluxJob,
  readFluxSyncResponse,
  testFailureFromError,
} from "../common/index.js";
import { createHttpClient, type HttpClient } from "../http/index.js";
import { buildOpenAIImageBody, rethrowOpenAIError } from "../openai/image.js";
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
 *   - `mai-images` (MAI-Image-2 / 2e / 2.5 / 2.5-Flash):
 *     `{endpoint}/mai/v1/images/generations` — raw HTTP, `api-key: <key>`
 *     header, body `{model, prompt, width, height}`, PNG-only response. The
 *     2.5 models also expose `{endpoint}/mai/v1/images/edits` for
 *     image-to-image edits via multipart form data (`model`, `prompt`,
 *     `image`).
 *   - `flux-bfl` (FLUX.2 [pro|flex]):
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
 */
export class AzureImageProvider extends BaseImageProvider {
  private readonly client: OpenAIClientLike;
  /** HTTP client for non-SDK paths using `api-key` auth (MAI + listing). */
  private readonly http: HttpClient;
  /** HTTP client for FLUX BFL paths using `Authorization: Bearer` auth. */
  private readonly fluxHttp: HttpClient;
  private readonly endpoint: string;
  private readonly envelope: FluxPollEnvelope;
  private readonly sleep: (ms: number, signal?: AbortSignal) => Promise<void>;

  constructor(options: AzureImageProviderOptions) {
    super({
      providerId: "azure",
      displayName: "Azure",
      models: options.models,
      ...(options.logger !== undefined ? { logger: options.logger } : {}),
    });
    const endpoint = options.endpoint.replace(/\/+$/, "");
    this.endpoint = endpoint;

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
    // listing probe — the OpenAI SDK manages its own Bearer-token auth.
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

    this.envelope = {
      ...DEFAULT_FLUX_POLL_ENVELOPE,
      ...(options.pollIntervalMs !== undefined ? { intervalMs: options.pollIntervalMs } : {}),
      ...(options.pollTimeoutMs !== undefined ? { timeoutMs: options.pollTimeoutMs } : {}),
    };
    this.sleep = options.sleep ?? createAbortableSleep(this.id);
  }

  protected async doGenerate(
    merged: ImageRequest,
    model: ImageModelDef,
    signal?: AbortSignal,
  ): Promise<ImageGenerationResult> {
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
  protected async doTest(signal?: AbortSignal): Promise<ProviderTestResult> {
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
    const response = await callOpenAIImageEndpoint({
      client: this.client,
      body,
      hasReferences: req.references.length > 0,
      vendorId: this.id,
      rethrowSdkError: rethrowOpenAIError,
      ...(signal !== undefined ? { signal } : {}),
    });
    const outputs = await decodeOpenAIImageResponse(response, {
      vendorId: this.id,
      ...(req.size ? { sizeForOutput: req.size } : {}),
      defaultMimeType: mimeTypeForOutputFormat(req.outputFormat),
      // Azure's openai-family deployments always return base64 — no URL fallback.
      ...(signal !== undefined ? { signal } : {}),
    });
    if (outputs.length === 0) {
      throw new ProviderError("no image outputs returned", { vendorId: this.id });
    }
    return { outputs };
  }

  /**
   * MAI Image family (MAI-Image-2 / 2e / 2.5 / 2.5-Flash). Two surfaces:
   *
   *   - Text-to-image generation (`/mai/v1/images/generations`): JSON body with
   *     raw `width`/`height` integers (the OpenAI-style `size` string is not
   *     supported), PNG-only output, single base64 image at `data[0].b64_json`.
   *   - Image-to-image edits (`/mai/v1/images/edits`): only `MAI-Image-2.5` and
   *     `MAI-Image-2.5-Flash` support edits. The request is **multipart form
   *     data** carrying `model`, `prompt`, and a single `image` file; PNG-only
   *     output returned the same way. Dimensions follow the input image, so no
   *     `width`/`height` are sent.
   *
   * Routing is by reference count: a request with reference images uses the
   * edits surface (rejected if the model doesn't allow references), otherwise
   * the generations surface.
   */
  private async generateMai(
    req: ImageRequest,
    model: ImageModelDef,
    signal?: AbortSignal,
  ): Promise<ImageGenerationResult> {
    if (req.references.length > 0) {
      return this.generateMaiEdit(req, model, signal);
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

    return this.decodeMaiResponse(response, dims.width, dims.height);
  }

  /**
   * MAI image-to-image edit (`/mai/v1/images/edits`). Supported only by
   * `MAI-Image-2.5` / `MAI-Image-2.5-Flash`. The MAI edits surface accepts a
   * single reference image as multipart form data and ignores any
   * `width`/`height` — the output follows the input image.
   */
  private async generateMaiEdit(
    req: ImageRequest,
    model: ImageModelDef,
    signal?: AbortSignal,
  ): Promise<ImageGenerationResult> {
    const maxReferences = model.capabilities?.maxReferences ?? 0;
    if (maxReferences < 1) {
      throw new ProviderRequestError(
        `model ${model.id} (MAI Image) does not accept reference images`,
        { vendorId: this.id },
      );
    }
    const [reference] = await loadImageReferences(req.references.slice(0, 1), this.id);
    if (!reference) {
      throw new ProviderRequestError(
        `model ${model.id} (MAI Image) edit requires a reference image`,
        { vendorId: this.id },
      );
    }

    const form = new FormData();
    form.append("model", model.id);
    form.append("prompt", req.prompt);
    form.append(
      "image",
      new Blob([reference.bytes], { type: reference.mimeType }),
      reference.filename,
    );
    if (req.raw) {
      for (const [key, value] of Object.entries(req.raw)) {
        if (typeof value === "string") form.append(key, value);
      }
    }

    const url = `${this.endpoint}/mai/v1/images/edits`;
    const init: RequestInit = { method: "POST", body: form };
    const opts: { signal?: AbortSignal } = {};
    if (signal) opts.signal = signal;
    const res = await this.http.raw(url, init, opts);
    const parsed = MaiResponseSchema.safeParse(await res.json());
    if (!parsed.success) {
      throw new ProviderResponseError(`MAI edit response shape mismatch: ${parsed.error.message}`, {
        vendorId: this.id,
        status: res.status,
      });
    }

    return this.decodeMaiResponse(parsed.data);
  }

  /** Decode the shared MAI `data[].b64_json` PNG payload into outputs. */
  private decodeMaiResponse(
    response: z.infer<typeof MaiResponseSchema>,
    width?: number,
    height?: number,
  ): ImageGenerationResult {
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
        ...(width !== undefined ? { width } : {}),
        ...(height !== undefined ? { height } : {}),
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
    const syncOutputs = await readFluxSyncResponse(submit, this.fluxHttp, this.id, signal);
    if (syncOutputs) return { outputs: syncOutputs };

    // Async response — poll the polling_url until terminal.
    if (!submit.polling_url) {
      throw new ProviderError(
        `FLUX submit response had neither image data nor polling_url: ${JSON.stringify(submit).slice(0, 256)}`,
        { vendorId: this.id },
      );
    }
    const outputs = await pollFluxJob({
      pollUrl: submit.polling_url,
      jobId: submit.id ?? "(unknown)",
      vendorId: this.id,
      http: this.fluxHttp,
      sleep: this.sleep,
      envelope: this.envelope,
      ...(signal !== undefined ? { signal } : {}),
    });
    return { outputs };
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
