import {
  appendImageReferenceInstructions,
  type ImageModelDef,
  type ImageRequest,
  ProviderError,
  ProviderHttpError,
  type ProviderTestResult,
} from "@imagent/core";
import OpenAI, { APIError } from "openai";
import {
  aggregateImageCapabilities,
  decodeBase64,
  fetchBytesViaFetch,
  listOpenAIModelIds,
  mimeTypeForOutputFormat,
  type OpenAICompatibleBody,
  OpenAICompatibleImageProvider,
  type OpenAICompatibleImageProviderOptions,
  type OpenAIClientLike,
  parseSize,
  runListProbe,
  testFailureFromError,
} from "../common/index.js";
import { loadImageReferences, openAIReferenceFiles } from "../reference-images.js";

/**
 * Canonical OpenAI base URL. Hardcoded — users configure auth only. A
 * power-user override is available via `secrets.openai.baseUrl` (not
 * surfaced in the desktop UI).
 */
export const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";

export type { OpenAIClientLike };

export interface OpenAIImageProviderOptions {
  apiKey: string;
  baseUrl?: string | null;
  models: ReadonlyMap<string, ImageModelDef>;
  providerId?: string;
  displayName?: string;
  /** Inject a SDK client (tests). In production we construct one. */
  client?: OpenAIClientLike;
  logger?: OpenAICompatibleImageProviderOptions["logger"];
}

export class OpenAIImageProvider extends OpenAICompatibleImageProvider {
  constructor(options: OpenAIImageProviderOptions) {
    const client =
      options.client ??
      (new OpenAI({
        apiKey: options.apiKey,
        baseURL: options.baseUrl ?? DEFAULT_OPENAI_BASE_URL,
      }) as unknown as OpenAIClientLike);
    super({
      providerId: options.providerId ?? "openai",
      displayName: options.displayName ?? "OpenAI",
      models: options.models,
      ...(options.logger !== undefined ? { logger: options.logger } : {}),
      client,
      supportsUrlFallback: true,
      fetchBytesFromUrl: (url, signal) => fetchBytesViaFetch(url, "openai", signal),
      rethrowSdkError: rethrowOpenAIError,
    });
  }

  protected async buildBody(
    merged: ImageRequest,
    model: ImageModelDef,
  ): Promise<OpenAICompatibleBody> {
    const body = await buildOpenAIImageBody(merged, model, this.id);
    return { body };
  }

  /**
   * Auth probe — `client.models.list()`. A response with at least one entry
   * means the key is valid. We additionally annotate the response when one of
   * our configured model ids is present in the listing.
   */
  protected async doTest(signal?: AbortSignal): Promise<ProviderTestResult> {
    const probeSignal = signal ?? AbortSignal.timeout(8000);
    return runListProbe({
      listIds: (s) => listOpenAIModelIds(this.client, s),
      configuredIds: [...this.models.keys()],
      signal: probeSignal,
    });
  }
}

/**
 * Build the OpenAI-compatible images.generate body. Shared by Azure / xAI /
 * ByteDance via direct import (each provider stays its own class but doesn't
 * need to re-derive what defaults to forward).
 */
export async function buildOpenAIImageBody(
  req: ImageRequest,
  model: ImageModelDef,
  vendorId = "openai",
): Promise<Record<string, unknown>> {
  const caps = model.capabilities;
  const supportsOutputFormat = caps?.outputFormats !== undefined && caps.outputFormats.length > 0;
  // Backstop for catalogs that pre-date the `outputFormats` capability:
  // any deployment whose id matches the gpt-image family also gets routed
  // through the new `output_format` knob and must NOT receive
  // `response_format` (it 400s with `unknown_parameter`). The id check
  // covers both the canonical OpenAI catalog ids (`gpt-image-2`,
  // `gpt-image-1.5`, `gpt-image-1-mini`) and Azure deployment names users
  // typically suffix from those (e.g. `gpt-image-2-1`).
  const looksLikeGptImage = /^gpt-image-/i.test(model.id);
  const useOutputFormat = supportsOutputFormat || looksLikeGptImage;
  const body: Record<string, unknown> = {
    model: model.id,
    prompt: appendImageReferenceInstructions(req.prompt, req.references),
    n: req.count,
  };
  // Newer image models (gpt-image-* family) use `output_format` (png/jpeg/
  // webp) and reject `response_format`. Legacy DALL-E models do the opposite
  // — they default to URL responses and need `response_format: "b64_json"`
  // explicit.
  if (useOutputFormat) {
    if (req.outputFormat) body.output_format = req.outputFormat;
  } else {
    body.response_format = "b64_json";
  }
  if (req.size) body.size = req.size;
  // Quality flows through when the model declares a non-empty `qualities`
  // list (validated upstream against `caps.qualities`). Falls back to
  // `req.raw.quality` for power-user requests that bypass the schema field.
  const raw = (req.raw ?? {}) as { quality?: string; style?: string };
  if (req.quality && caps?.qualities && caps.qualities.length > 0) {
    body.quality = req.quality;
  } else if (raw.quality) {
    body.quality = raw.quality;
  }
  if (raw.style && caps?.supportsStyleRef) body.style = raw.style;
  if (req.references.length > 0) {
    const references = await loadImageReferences(req.references, vendorId);
    // OpenAI's images.edit request uses the singular `image` field; the SDK
    // accepts an array of Uploadables there for multi-image reference edits.
    body.image = await openAIReferenceFiles(references);
  }
  return body;
}

/**
 * Convert SDK errors (or anything else) into our ProviderError hierarchy so
 * callers see consistent shapes regardless of which path threw.
 *
 * For `APIError` (the openai SDK's own error class), we preserve the original
 * as `cause` so the desktop's main-process logger walks the chain and shows
 * the SDK's own stack + parsed body. We also fold the response body's `code`
 * and `message` into our wrapped message — Azure's 404 reasons (e.g.
 * `DeploymentNotFound`) live in `err.error?.code` and are otherwise lost.
 */
export function rethrowOpenAIError(err: unknown, vendorId: string): never {
  if (err instanceof APIError) {
    const body = (err as { error?: { code?: string; message?: string; type?: string } }).error;
    const code = body?.code ?? (err as { code?: string }).code;
    const detail = [code, body?.message ?? err.message].filter(Boolean).join(": ");
    const summary = detail || err.message;
    if (typeof err.status === "number") {
      throw new ProviderHttpError(`HTTP ${err.status} from openai SDK: ${summary}`, {
        vendorId,
        status: err.status,
        cause: err,
      });
    }
    throw new ProviderError(summary, { vendorId, cause: err });
  }
  if (err instanceof Error) throw new ProviderError(err.message, { vendorId, cause: err });
  throw new ProviderError(String(err), { vendorId });
}

// Back-compat re-exports — these previously lived here and are imported
// directly from `../openai/image.js` by tests and other vendor files. They
// now have their canonical home under `../common/`, but the re-export
// preserves all existing import paths with zero churn.
export {
  aggregateImageCapabilities as aggregateCapabilities,
  decodeBase64,
  listOpenAIModelIds as listModelIds,
  mimeTypeForOutputFormat,
  parseSize,
  testFailureFromError,
};
