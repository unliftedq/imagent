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
  validateImageRequestAgainstModel,
} from "@imagine-studio/core";
import { z } from "zod";
import { aggregateCapabilities } from "../openai/image.js";
import { createHttpClient, type HttpClient } from "../http/index.js";

const DEFAULT_GOOGLE_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

export interface GoogleImageProviderOptions {
  apiKey: string;
  baseUrl?: string;
  models: ReadonlyMap<string, ImageModelDef>;
  fetch?: typeof fetch;
  logger?: Logger;
}

// Imagen 3 prediction response. Imagen returns `predictions[].bytesBase64Encoded`
// per the public docs:
//   https://ai.google.dev/gemini-api/docs/imagen
//
// TODO(verify endpoint shape) — the docs page wasn't reachable from this
// build environment; the schema below mirrors the published `:predict`
// response. Variations include `image.imageBytes` for some Imagen revisions;
// we accept either.
const GoogleImagenResponseSchema = z.object({
  predictions: z
    .array(
      z.union([
        z.object({
          bytesBase64Encoded: z.string(),
          mimeType: z.string().optional(),
        }),
        z.object({
          image: z.object({
            imageBytes: z.string().optional(),
            bytesBase64Encoded: z.string().optional(),
            mimeType: z.string().optional(),
          }),
        }),
      ]),
    )
    .min(1),
});

export class GoogleImageProvider implements ImageProvider {
  readonly id = "google";
  readonly displayName = "Google (Imagen / Gemini)";
  readonly models: ReadonlyMap<string, ImageModelDef>;
  readonly capabilities: ImageCapabilities;
  private readonly http: HttpClient;
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(options: GoogleImageProviderOptions) {
    this.models = options.models;
    this.capabilities = aggregateCapabilities(options.models);
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_GOOGLE_BASE_URL).replace(/\/+$/, "");
    this.http = createHttpClient({
      vendorId: this.id,
      ...(options.fetch !== undefined ? { fetch: options.fetch } : {}),
      ...(options.logger !== undefined ? { logger: options.logger } : {}),
    });
  }

  async generate(req: ImageRequest, signal?: AbortSignal): Promise<ImageGenerationResult> {
    const model = this.models.get(req.model);
    if (!model) {
      throw new ProviderRequestError(`unknown model '${req.model}' for google`, {
        vendorId: this.id,
      });
    }
    const merged = applyImageDefaults(req, model);
    validateImageRequestAgainstModel(this.id, merged, model);

    // Imagen v3 :predict body shape: `{instances:[{prompt}], parameters:{...}}`.
    const parameters: Record<string, unknown> = {
      sampleCount: merged.count,
    };
    if (merged.aspectRatio) parameters.aspectRatio = merged.aspectRatio;
    if (merged.negativePrompt) parameters.negativePrompt = merged.negativePrompt;
    if (merged.seed !== undefined) parameters.seed = merged.seed;
    const body = {
      instances: [{ prompt: merged.prompt }],
      parameters,
    };

    const url = `${this.baseUrl}/models/${encodeURIComponent(model.id)}:predict?key=${encodeURIComponent(this.apiKey)}`;
    const opts: { signal?: AbortSignal; schema: typeof GoogleImagenResponseSchema } = {
      schema: GoogleImagenResponseSchema,
    };
    if (signal) opts.signal = signal;
    const response = await this.http.post<z.infer<typeof GoogleImagenResponseSchema>>(url, body, opts);

    const outputs: ImageOutput[] = [];
    for (const p of response.predictions) {
      let b64: string | undefined;
      let mimeType = "image/png";
      if ("bytesBase64Encoded" in p && p.bytesBase64Encoded) {
        b64 = p.bytesBase64Encoded;
        mimeType = p.mimeType ?? mimeType;
      } else if ("image" in p) {
        b64 = p.image.bytesBase64Encoded ?? p.image.imageBytes;
        mimeType = p.image.mimeType ?? mimeType;
      }
      if (!b64) {
        throw new ProviderResponseError("prediction missing image bytes", { vendorId: this.id });
      }
      outputs.push({
        bytes: decodeBase64(b64),
        mimeType,
      });
    }
    if (outputs.length === 0) {
      throw new ProviderError("no predictions returned", { vendorId: this.id });
    }
    return { outputs };
  }
}

function decodeBase64(s: string): Uint8Array<ArrayBuffer> {
  const b = Buffer.from(s, "base64");
  const ab = new ArrayBuffer(b.byteLength);
  const out = new Uint8Array(ab);
  out.set(b);
  return out;
}
