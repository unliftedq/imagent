import { z } from "zod";

/**
 * Output payload returned by ImageProvider.generate(). The runner persists
 * these into gallery_items + writes the bytes under gallery/.
 */
export const ImageOutputSchema = z.object({
  bytes: z.instanceof(Uint8Array),
  mimeType: z.string(),
  width: z.number().int().optional(),
  height: z.number().int().optional(),
  seed: z.number().int().optional(),
  /** Raw provider response metadata, persisted into params_json. */
  raw: z.record(z.unknown()).optional(),
});
export type ImageOutput = z.infer<typeof ImageOutputSchema>;

export const ImageGenerationResultSchema = z.object({
  outputs: z.array(ImageOutputSchema).min(1),
});
export type ImageGenerationResult = z.infer<typeof ImageGenerationResultSchema>;

export const VideoJobHandleSchema = z.object({
  providerId: z.string(),
  providerJobId: z.string(),
  /** Vendor-specific URL (e.g. Flux polling_url, Seedance status URL). */
  pollingUrl: z.string().optional(),
  /** Anything else the provider needs to keep across poll calls. */
  meta: z.record(z.unknown()).optional(),
});
export type VideoJobHandle = z.infer<typeof VideoJobHandleSchema>;

export const VideoJobStateSchema = z.enum([
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
]);
export type VideoJobState = z.infer<typeof VideoJobStateSchema>;

export const VideoJobStatusSchema = z.object({
  state: VideoJobStateSchema,
  progress: z.number().min(0).max(1).optional(),
  errorMessage: z.string().optional(),
});
export type VideoJobStatus = z.infer<typeof VideoJobStatusSchema>;

export const VideoOutputSchema = z.object({
  bytes: z.instanceof(Uint8Array),
  mimeType: z.string(),
  width: z.number().int().optional(),
  height: z.number().int().optional(),
  durationMs: z.number().int().optional(),
  raw: z.record(z.unknown()).optional(),
});
export type VideoOutput = z.infer<typeof VideoOutputSchema>;

export const VideoGenerationResultSchema = z.object({
  output: VideoOutputSchema,
});
export type VideoGenerationResult = z.infer<typeof VideoGenerationResultSchema>;
