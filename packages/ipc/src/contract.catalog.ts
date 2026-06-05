import {
  AudioModelCapsOverrideSchema,
  AudioModelDefSchema,
  ImageModelCapsOverrideSchema,
  ImageModelDefSchema,
  VideoModelCapsOverrideSchema,
  VideoModelDefSchema,
} from "@imagent/core";
import { z } from "zod";

/**
 * Inline ModelCatalog schema. We deliberately define this here (rather than
 * importing from @imagent/providers) so the IPC package stays free of a
 * dependency on @imagent/providers — the renderer needs the contract types
 * to compile and the renderer must not pull in provider implementations.
 *
 * Shape mirrors `@imagent/providers#ModelCatalogSchema`.
 */
export const IpcImageProviderModelSchema = z.object({
  id: z.string(),
  modelId: z.string(),
  displayName: z.string().optional(),
  capabilities: ImageModelCapsOverrideSchema.optional(),
  defaults: z.record(z.string(), z.unknown()).optional(),
});

export const IpcVideoProviderModelSchema = z.object({
  id: z.string(),
  modelId: z.string(),
  displayName: z.string().optional(),
  capabilities: VideoModelCapsOverrideSchema.optional(),
  defaults: z.record(z.string(), z.unknown()).optional(),
});

export const IpcAudioProviderModelSchema = z.object({
  id: z.string(),
  modelId: z.string(),
  displayName: z.string().optional(),
  capabilities: AudioModelCapsOverrideSchema.optional(),
  defaults: z.record(z.string(), z.unknown()).optional(),
});

export const IpcModelCatalogSchema = z.object({
  version: z.literal(2),
  models: z.object({
    image: z.record(z.string(), ImageModelDefSchema),
    video: z.record(z.string(), VideoModelDefSchema),
    audio: z.record(z.string(), AudioModelDefSchema),
  }),
  providers: z.record(
    z.string(),
    z.object({
      displayName: z.string().optional(),
      image: z.array(IpcImageProviderModelSchema).optional(),
      video: z.array(IpcVideoProviderModelSchema).optional(),
      audio: z.array(IpcAudioProviderModelSchema).optional(),
    }),
  ),
  comments: z.string().optional(),
});
export type ModelCatalogPayload = z.infer<typeof IpcModelCatalogSchema>;
