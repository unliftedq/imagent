/**
 * Image-size string parsing and output-format → MIME helpers. Pure functions
 * (no SDK / vendor state). Shared by every image provider.
 */

/** Parse a `WIDTHxHEIGHT` size string into `{width, height}`. Missing or
 * malformed inputs return an empty object so callers can spread it into a
 * larger `ImageOutput` literal without nullish branches. */
export function parseSize(size: string | undefined): { width?: number; height?: number } {
  if (!size) return {};
  const m = /^(\d+)x(\d+)$/.exec(size);
  if (!m) return {};
  return { width: Number(m[1]), height: Number(m[2]) };
}

/**
 * Map a requested `output_format` (or absence thereof) to the MIME type the
 * decoded base64 bytes will carry. gpt-image-* defaults to PNG when the
 * request omits the parameter; legacy DALL-E always returns PNG.
 */
export function mimeTypeForOutputFormat(outputFormat: string | undefined): string {
  switch (outputFormat) {
    case "jpeg":
    case "jpg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    default:
      return "image/png";
  }
}
