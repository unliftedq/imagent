/**
 * Pure byte / mime helpers shared by every provider. Lives outside the
 * vendor directories so e.g. `bytedance/video.ts` doesn't have to
 * cross-import from `openai/image.ts` just to decode base64.
 */

/** Decode a base64 string into a fresh `Uint8Array<ArrayBuffer>`. */
export function decodeBase64(s: string): Uint8Array<ArrayBuffer> {
  const b = Buffer.from(s, "base64");
  const ab = new ArrayBuffer(b.byteLength);
  const out = new Uint8Array(ab);
  out.set(b);
  return out;
}

/**
 * Copy any `Uint8Array` (which may be backed by a `SharedArrayBuffer`) into
 * a fresh `Uint8Array<ArrayBuffer>` matching `{Image,Video}Output.bytes`.
 * Replaces the per-vendor `toAbBytes` / `decodeBase64ToTyped` duplicates.
 */
export function toArrayBufferBytes(src: Uint8Array): Uint8Array<ArrayBuffer> {
  const ab = new ArrayBuffer(src.byteLength);
  const out = new Uint8Array(ab);
  out.set(src);
  return out;
}

/**
 * Return `raw` when it already starts with `prefix` (e.g. `"image/"` or
 * `"video/"`); otherwise return the fallback. Used to sanitise the
 * `content-type` header on direct asset downloads, where some object stores
 * return generic `application/octet-stream`.
 */
export function coerceMimeType(
  raw: string | undefined | null,
  prefix: string,
  fallback: string,
): string {
  if (typeof raw === "string" && raw.startsWith(prefix)) return raw;
  return fallback;
}
