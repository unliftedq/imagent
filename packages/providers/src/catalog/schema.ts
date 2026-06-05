import {
  AudioModelCapsOverrideSchema,
  AudioModelDefSchema,
  type AudioProviderModel,
  AudioProviderModelSchema,
  ImageModelCapsOverrideSchema,
  ImageModelDefSchema,
  type ImageProviderModel,
  ImageProviderModelSchema,
  VideoModelCapsOverrideSchema,
  VideoModelDefSchema,
  type VideoProviderModel,
  VideoProviderModelSchema,
} from "@imagent/core";
import { z } from "zod";

/**
 * Per-(provider, canonical model) overlay applied during offering resolution.
 * Lets the bundled catalog encode provider-specific quirks for a base model
 * (e.g. Azure OpenAI's gpt-image deployments only support `n=1`) without
 * forking the canonical model entry. Merged between the canonical model and
 * the offering itself, so offerings can still override further.
 *
 * A single keyspace covers both image and video models — they live in
 * separate maps on the catalog and any given canonical id is one media kind,
 * never multiple. The merged caps schema admits fields from any kind;
 * irrelevant fields are simply stripped when the final `ImageModelDef` /
 * `VideoModelDef` / `AudioModelDef` is parsed.
 */
const ModelCapsOverrideSchema = ImageModelCapsOverrideSchema.merge(VideoModelCapsOverrideSchema).merge(
  AudioModelCapsOverrideSchema,
);

const ProviderModelOverrideSchema = z.object({
  capabilities: ModelCapsOverrideSchema.optional(),
  defaults: z.record(z.string(), z.unknown()).optional(),
});
export type ProviderModelOverride = z.infer<typeof ProviderModelOverrideSchema>;

/**
 * Re-export the canonical offering schemas from core so consumers that import
 * via @imagent/providers keep working. The single source of truth lives in
 * `@imagent/core/domain/model.ts` because both the catalog and per-user
 * `config.providers.<id>` overlays use the same shape.
 */
export {
  type AudioProviderModel,
  AudioProviderModelSchema,
  type ImageProviderModel,
  ImageProviderModelSchema,
  type VideoProviderModel,
  VideoProviderModelSchema,
};

export const ProviderCatalogSchema = z.object({
  displayName: z.string().optional(),
  image: z.array(ImageProviderModelSchema).optional(),
  video: z.array(VideoProviderModelSchema).optional(),
  audio: z.array(AudioProviderModelSchema).optional(),
  /**
   * Provider-specific overrides keyed by canonical model id (matches a key
   * in `models.image`, `models.video`, or `models.audio`). Applied during offering resolution
   * between the canonical caps and any offering-level override; intended for
   * the bundled catalog to encode vendor quirks (e.g. Azure caps gpt-image
   * `n=1`).
   */
  modelOverrides: z.record(z.string(), ProviderModelOverrideSchema).optional(),
});
export type ProviderCatalog = z.infer<typeof ProviderCatalogSchema>;

/**
 * JSON catalog schema. v2 separates model identity from provider routing:
 *
 * - `models.image/video/audio` describe canonical models and their capabilities.
 * - `providers.<providerId>.image/video/audio` describe **canonical** provider-facing
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
      audio: z.record(z.string(), AudioModelDefSchema).default({}),
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
    for (const [id, model] of Object.entries(catalog.models.audio)) {
      if (model.id !== id) {
        ctx.addIssue({
          code: "custom",
          path: ["models", "audio", id, "id"],
          message: `audio model key '${id}' must match model.id '${model.id}'`,
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
      for (const offering of provider.audio ?? []) {
        if (!catalog.models.audio[offering.modelId]) {
          ctx.addIssue({
            code: "custom",
            path: ["providers", providerId, "audio", offering.id, "modelId"],
            message: `audio offering '${offering.id}' references unknown model '${offering.modelId}'`,
          });
        }
      }
    }
  });

export type ModelCatalog = z.infer<typeof ModelCatalogSchema>;

const ImageModelDefOverlaySchema = ImageModelDefSchema.omit({ capabilities: true })
  .partial()
  .extend({
    capabilities: ImageModelCapsOverrideSchema.optional(),
  });

const VideoModelDefOverlaySchema = VideoModelDefSchema.omit({ capabilities: true })
  .partial()
  .extend({
    capabilities: VideoModelCapsOverrideSchema.optional(),
  });

const AudioModelDefOverlaySchema = AudioModelDefSchema.omit({ capabilities: true })
  .partial()
  .extend({
    capabilities: AudioModelCapsOverrideSchema.optional(),
  });

export const ModelCatalogOverlaySchema = z
  .object({
    version: z.literal(2).optional(),
    models: z
      .object({
        image: z.record(z.string(), ImageModelDefOverlaySchema).optional(),
        video: z.record(z.string(), VideoModelDefOverlaySchema).optional(),
        audio: z.record(z.string(), AudioModelDefOverlaySchema).optional(),
      })
      .strict()
      .optional(),
    providers: z.record(z.string(), ProviderCatalogSchema).optional(),
    comments: z.string().optional(),
  })
  .strict();

export type ModelCatalogOverlay = z.infer<typeof ModelCatalogOverlaySchema>;
