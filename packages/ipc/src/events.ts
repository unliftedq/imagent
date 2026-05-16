import { GalleryItemSchema, JobSchema, JobStateSchema } from "@imagent/core";
import { z } from "zod";
import { UpdateStatusPayloadSchema } from "./contract.js";

/**
 * Push-event channels the main process emits to the renderer (architecture.md §8).
 * Subscribers are wired in M4 alongside the preload bridge.
 */
export const events = {
  "job.progress": z.object({
    id: z.string(),
    progress: z.number().min(0).max(1),
    state: JobStateSchema,
  }),
  "job.completed": JobSchema,
  "job.failed": JobSchema,
  "gallery.changed": z.object({
    id: z.string(),
    op: z.enum(["created", "updated", "deleted"]),
    item: GalleryItemSchema.optional(),
  }),
  "assets.changed": z.object({
    id: z.string(),
    op: z.enum(["created", "updated", "deleted"]),
  }),
  "config.changed": z.object({
    /** Stringified ConfigFile so the renderer can re-parse without sharing zod. */
    configJson: z.string(),
  }),
  /**
   * Auto-updater state transitions. Mirrors `updater.status` output so a
   * subscriber can drive UI without polling.
   */
  "updater.progress": UpdateStatusPayloadSchema,
} as const;

export type EventMap = typeof events;
export type EventName = keyof EventMap;
export type EventPayload<E extends EventName> = z.infer<EventMap[E]>;
