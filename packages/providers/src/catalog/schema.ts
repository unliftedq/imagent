import {
  ImageModelDefSchema,
  type ImageProviderModel,
  ImageProviderModelSchema,
  VideoModelDefSchema,
  type VideoProviderModel,
  VideoProviderModelSchema,
} from "@imagent/core";
import { z } from "zod";

/**
 * Re-export the canonical offering schemas from core so consumers that import
 * via @imagent/providers keep working. The single source of truth lives in
 * `@imagent/core/domain/model.ts` because both the catalog and per-user
 * `config.providers.<id>` overlays use the same shape.
 */
export {
  type ImageProviderModel,
  ImageProviderModelSchema,
  type VideoProviderModel,
  VideoProviderModelSchema,
};

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
 * - `providers.<providerId>.image/video` describe **canonical** provider-facing
 *   offerings (the bundled defaults: OpenAI's gpt-image-2, Google's Veo, …).
 *
 * Per-user routing — Azure deployment names, custom OpenAI-compatible model
 * lists — lives in `config.providers.<providerId>` (see
 * `@imagent/config#ProviderPreferencesSchema`). At runtime the registry
 * merges the catalog list with the config overlay; config wins on `id`
 * collisions.
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

export const ModelCatalogOverlaySchema = z
  .object({
    version: z.literal(2).optional(),
    models: z
      .object({
        image: z.record(z.string(), ImageModelDefSchema.partial()).optional(),
        video: z.record(z.string(), VideoModelDefSchema.partial()).optional(),
      })
      .strict()
      .optional(),
    providers: z.record(z.string(), ProviderCatalogSchema).optional(),
    comments: z.string().optional(),
  })
  .strict();

export type ModelCatalogOverlay = z.infer<typeof ModelCatalogOverlaySchema>;
