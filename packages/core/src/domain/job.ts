import { z } from "zod";
import { MediaKindSchema } from "./media.js";
import { VideoJobStateSchema } from "./result.js";

export const JobStateSchema = VideoJobStateSchema;
export type JobState = z.infer<typeof JobStateSchema>;

export const JobSchema = z.object({
  id: z.string(),
  kind: MediaKindSchema,
  state: JobStateSchema,
  providerId: z.string(),
  providerJobId: z.string().nullable().optional(),
  /** Serialized GenerationIntent.request — persisted as TEXT in jobs.request_json. */
  requestJson: z.string(),
  progress: z.number().min(0).max(1).nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  resultItemId: z.string().nullable().optional(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
  finishedAt: z.number().int().nullable().optional(),
});
export type Job = z.infer<typeof JobSchema>;

export type JobId = string;

export const JobsQuerySchema = z.object({
  state: z.array(JobStateSchema).optional(),
  kind: MediaKindSchema.optional(),
  limit: z.number().int().positive().default(50),
  offset: z.number().int().nonnegative().default(0),
});
export type JobsQuery = z.infer<typeof JobsQuerySchema>;
