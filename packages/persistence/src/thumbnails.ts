/**
 * Thumbnail generation. The image path uses `sharp` (M3 Assets / Gallery).
 * The video path is stubbed until M7 wires `ffmpeg-static` to grab a frame at
 * 1s — it intentionally throws so callers can't accidentally rely on it.
 */
import sharp from "sharp";

export interface ThumbnailOptions {
  /** Longest dimension of the resulting image (architecture.md §6 — 256 default). */
  maxSide?: number;
  /** Output format. WebP is the default for our gallery / asset thumbnails. */
  format?: "webp" | "jpeg" | "png";
  /** Encoder quality (1-100, format-dependent). */
  quality?: number;
}

export interface ThumbnailResult {
  width: number;
  height: number;
  bytes: number;
}

const DEFAULT_MAX_SIDE = 256;
const DEFAULT_QUALITY = 80;

/**
 * Generate a thumbnail from an existing file on disk. Preserves aspect
 * ratio (sharp `fit: "inside"`). Returns the encoded dimensions and byte size.
 */
export async function generateImageThumbnail(
  srcPath: string,
  destPath: string,
  options: ThumbnailOptions = {},
): Promise<ThumbnailResult> {
  const maxSide = options.maxSide ?? DEFAULT_MAX_SIDE;
  const format = options.format ?? "webp";
  const quality = options.quality ?? DEFAULT_QUALITY;

  const pipeline = sharp(srcPath).resize({
    width: maxSide,
    height: maxSide,
    fit: "inside",
    withoutEnlargement: true,
  });
  const out = await applyFormat(pipeline, format, quality).toFile(destPath);
  return { width: out.width, height: out.height, bytes: out.size };
}

/**
 * In-memory variant: generate a thumbnail directly from a Buffer (e.g. raw
 * provider bytes). Saves an intermediate disk write for the gallery flow
 * where we want both the original AND a thumb.
 */
export async function generateImageThumbnailFromBuffer(
  bytes: Uint8Array | Buffer,
  destPath: string,
  options: ThumbnailOptions = {},
): Promise<ThumbnailResult> {
  const maxSide = options.maxSide ?? DEFAULT_MAX_SIDE;
  const format = options.format ?? "webp";
  const quality = options.quality ?? DEFAULT_QUALITY;

  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  const pipeline = sharp(buf).resize({
    width: maxSide,
    height: maxSide,
    fit: "inside",
    withoutEnlargement: true,
  });
  const out = await applyFormat(pipeline, format, quality).toFile(destPath);
  return { width: out.width, height: out.height, bytes: out.size };
}

/**
 * Read intrinsic image dimensions and reported MIME-ish format. Light wrapper
 * around `sharp().metadata()` so callers don't need to import sharp directly.
 */
export interface ImageMetadata {
  width: number | null;
  height: number | null;
  format: string | null;
}

export async function readImageMetadata(srcPath: string): Promise<ImageMetadata> {
  const meta = await sharp(srcPath).metadata();
  return {
    width: meta.width ?? null,
    height: meta.height ?? null,
    format: meta.format ?? null,
  };
}

/**
 * Video thumbnail generation lands in M7 with `ffmpeg-static`. Stubbed so the
 * surface is visible from the persistence package today.
 */
export async function generateVideoThumbnail(
  _srcPath: string,
  _destPath: string,
  _options: ThumbnailOptions = {},
): Promise<ThumbnailResult> {
  throw new Error("not implemented (M7)");
}

function applyFormat(
  pipeline: sharp.Sharp,
  format: "webp" | "jpeg" | "png",
  quality: number,
): sharp.Sharp {
  switch (format) {
    case "webp":
      return pipeline.webp({ quality });
    case "jpeg":
      return pipeline.jpeg({ quality });
    case "png":
      return pipeline.png({ quality });
    default:
      return pipeline.webp({ quality });
  }
}
