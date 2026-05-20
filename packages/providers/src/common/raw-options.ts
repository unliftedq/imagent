import type { VideoRequest } from "@imagent/core";

/**
 * Merge a `req.raw` "escape hatch" object into a constructed body. Two
 * shapes are supported, mirrored in `bytedance/video.ts` and
 * `google/video.ts`:
 *
 *   - `{ parameters: {...} }` — every entry is spread into the body. Used by
 *     SDKs that nest knobs under a `parameters` envelope.
 *   - any other top-level keys — copied through as-is.
 *
 * No-op on `undefined` / non-object inputs.
 */
export function mergeRawOptions(body: Record<string, unknown>, raw: VideoRequest["raw"]): void {
  if (!raw || typeof raw !== "object") return;
  const rawObj = raw as { parameters?: Record<string, unknown> } & Record<string, unknown>;
  if (rawObj.parameters && typeof rawObj.parameters === "object") {
    Object.assign(body, rawObj.parameters);
  }
  for (const [key, value] of Object.entries(rawObj)) {
    if (key !== "parameters") body[key] = value;
  }
}
