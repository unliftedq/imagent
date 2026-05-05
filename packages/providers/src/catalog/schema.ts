import { z } from "zod";
import {
  ImageModelCapsOverrideSchema,
  ImageModelDefSchema,
  VideoModelCapsOverrideSchema,
  VideoModelDefSchema,
} from "@imagent/core";

export const ImageProviderModelSchema = z.object({
  /** Provider-facing model id, deployment name, or route name. */
  id: z.string(),
  /** Canonical model id in `models.image`. */
  modelId: z.string(),
  displayName: z.string().optional(),
  capabilities: ImageModelCapsOverrideSchema.optional(),
  defaults: z.record(z.string(), z.unknown()).optional(),
});
export type ImageProviderModel = z.infer<typeof ImageProviderModelSchema>;

export const VideoProviderModelSchema = z.object({
  /** Provider-facing model id, deployment name, or route name. */
  id: z.string(),
  /** Canonical model id in `models.video`. */
  modelId: z.string(),
  displayName: z.string().optional(),
  capabilities: VideoModelCapsOverrideSchema.optional(),
  defaults: z.record(z.string(), z.unknown()).optional(),
});
export type VideoProviderModel = z.infer<typeof VideoProviderModelSchema>;

export const ProviderCatalogSchema = z.object({
  displayName: z.string().optional(),
  image: z.array(ImageProviderModelSchema).optional(),
  video: z.array(VideoProviderModelSchema).optional(),
});
export type ProviderCatalog = z.infer<typeof ProviderCatalogSchema>;

/**
 * JSON catalog schema. v2 separates model identity from provider routing:
 *
 * - `models.image/video` describe canonical models and their capabilities.
 * - `providers.<providerId>.image/video` describe provider-facing offerings.
 *
 * That lets one canonical model be exposed by several providers, and lets
 * deployment-based providers such as Azure OpenAI use arbitrary deployment
 * names while still inheriting the correct model capabilities.
 */
export const ModelCatalogSchema = z
  .object({
    version: z.literal(2),
    models: z.object({
      image: z.record(z.string(), ImageModelDefSchema),
      video: z.record(z.string(), VideoModelDefSchema),
    }),
    providers: z.record(z.string(), ProviderCatalogSchema),
    comments: z.string().optional(),
  })
  .superRefine((catalog, ctx) => {
    for (const [id, model] of Object.entries(catalog.models.image)) {
      if (model.id !== id) {
        ctx.addIssue({
          code: "custom",
          path: ["models", "image", id, "id"],
          message: `image model key '${id}' must match model.id '${model.id}'`,
        });
      }
    }
    for (const [id, model] of Object.entries(catalog.models.video)) {
      if (model.id !== id) {
        ctx.addIssue({
          code: "custom",
          path: ["models", "video", id, "id"],
          message: `video model key '${id}' must match model.id '${model.id}'`,
        });
      }
    }
    for (const [providerId, provider] of Object.entries(catalog.providers)) {
      for (const offering of provider.image ?? []) {
        if (!catalog.models.image[offering.modelId]) {
          ctx.addIssue({
            code: "custom",
            path: ["providers", providerId, "image", offering.id, "modelId"],
            message: `image offering '${offering.id}' references unknown model '${offering.modelId}'`,
          });
        }
      }
      for (const offering of provider.video ?? []) {
        if (!catalog.models.video[offering.modelId]) {
          ctx.addIssue({
            code: "custom",
            path: ["providers", providerId, "video", offering.id, "modelId"],
            message: `video offering '${offering.id}' references unknown model '${offering.modelId}'`,
          });
        }
      }
    }
  });

export type ModelCatalog = z.infer<typeof ModelCatalogSchema>;
