import { z } from "zod";

/**
 * Structured error envelope returned across the IPC boundary. The renderer
 * never sees a thrown Error — it sees `{ ok: false, error }` and the client
 * Proxy unwraps that into a thrown `IpcError` for the caller.
 */
export const IpcErrorCodeSchema = z.enum([
  "validation_failed",
  "not_implemented",
  "provider_error",
  "internal",
  "not_found",
]);
export type IpcErrorCode = z.infer<typeof IpcErrorCodeSchema>;

export const IpcErrorSchema = z.object({
  code: IpcErrorCodeSchema,
  message: z.string(),
  details: z.record(z.string(), z.unknown()).optional(),
});
export type IpcError = z.infer<typeof IpcErrorSchema>;

/** Server → renderer envelope. Never thrown across IPC. */
export const IpcResponseSchema = <T extends z.ZodTypeAny>(out: T) =>
  z.discriminatedUnion("ok", [
    z.object({ ok: z.literal(true), value: out }),
    z.object({ ok: z.literal(false), error: IpcErrorSchema }),
  ]);
