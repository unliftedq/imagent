/**
 * Thumbnail generation. The image path uses `sharp` (M3 Assets / Gallery).
 * The video path spawns `ffmpeg-static` to extract a single frame at ~1s,
 * pipes the raw mjpeg bytes through `sharp`, and writes a webp next to the
 * source MP4 (M7).
 */
import { spawn } from "node:child_process";
import ffmpegPathModule from "ffmpeg-static";
import sharp from "sharp";

// `ffmpeg-static` is a CommonJS module whose `module.exports` is the string
// path. Under `NodeNext` + `verbatimModuleSyntax`, TypeScript sees the
// default import as the namespace itself; we coerce here so the rest of the
// file gets a properly-typed `string | null`.
const ffmpegPath: string | null = ffmpegPathModule as unknown as string | null;

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
 * Generate a thumbnail from a video file. Spawns ffmpeg via `ffmpeg-static`,
 * extracts a single frame at ~1s, pipes mjpeg bytes through `sharp`, and
 * writes a `.webp` to `destPath`. Best-effort: if ffmpeg fails (binary
 * missing, source corrupt, source shorter than 1s), falls back to seeking
 * to t=0; if that also fails, writes a 1×1 transparent placeholder webp so
 * callers always have a thumb path to persist.
 */
export interface VideoThumbnailOptions extends ThumbnailOptions {
  /** Seconds into the source to seek before extracting a frame. Default 1.0. */
  seekSec?: number;
  /** Override the ffmpeg binary path; resolved via ffmpeg-static by default. */
  ffmpegPath?: string | null;
  /** Test seam: child_process.spawn-compatible runner. */
  spawnFn?: typeof spawn;
}

const DEFAULT_VIDEO_SEEK_SEC = 1.0;

/** 1×1 transparent webp produced by sharp; cached so we don't re-encode. */
let placeholderWebp: Buffer | null = null;
async function placeholderThumbBytes(): Promise<Buffer> {
  if (placeholderWebp) return placeholderWebp;
  placeholderWebp = await sharp({
    create: {
      width: 1,
      height: 1,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .webp({ quality: 1 })
    .toBuffer();
  return placeholderWebp;
}

export async function generateVideoThumbnail(
  srcPath: string,
  destPath: string,
  options: VideoThumbnailOptions = {},
): Promise<ThumbnailResult> {
  const maxSide = options.maxSide ?? DEFAULT_MAX_SIDE;
  const format = options.format ?? "webp";
  const quality = options.quality ?? DEFAULT_QUALITY;
  const seekSec = options.seekSec ?? DEFAULT_VIDEO_SEEK_SEC;
  const bin = options.ffmpegPath !== undefined ? options.ffmpegPath : ffmpegPath;
  const spawnFn = options.spawnFn ?? spawn;

  if (!bin) {
    return writePlaceholder(destPath, "ffmpeg-static binary not available on this platform");
  }

  // First attempt: seek to seekSec; on failure, retry with seek=0 in case the
  // source is shorter than seekSec.
  try {
    const buf = await runFfmpegFrame(bin, srcPath, seekSec, spawnFn);
    return await encodeThumb(buf, destPath, maxSide, format, quality);
  } catch (err) {
    if (seekSec > 0) {
      try {
        const buf = await runFfmpegFrame(bin, srcPath, 0, spawnFn);
        return await encodeThumb(buf, destPath, maxSide, format, quality);
      } catch (err2) {
        return writePlaceholder(
          destPath,
          `ffmpeg failed at t=${seekSec}s and t=0: ${(err2 as Error)?.message ?? String(err2)}`,
        );
      }
    }
    return writePlaceholder(destPath, (err as Error)?.message ?? String(err));
  }
}

/**
 * Spawn ffmpeg, write a single frame at `seekSec` to stdout (image2pipe /
 * mjpeg), buffer it, and return the bytes. Rejects on non-zero exit or
 * spawn error.
 */
async function runFfmpegFrame(
  bin: string,
  srcPath: string,
  seekSec: number,
  spawnFn: typeof spawn,
): Promise<Buffer> {
  // Pre-input -ss is fast (keyframe seek). -frames:v 1 emits exactly one
  // frame; -f image2pipe + -vcodec mjpeg writes raw JPEG bytes to stdout.
  const args = [
    "-y",
    "-loglevel",
    "error",
    "-ss",
    String(seekSec),
    "-i",
    srcPath,
    "-frames:v",
    "1",
    "-f",
    "image2pipe",
    "-vcodec",
    "mjpeg",
    "-",
  ];

  return new Promise<Buffer>((resolve, reject) => {
    const child = spawnFn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    child.stdout?.on("data", (c: Buffer) => chunks.push(c));
    child.stderr?.on("data", (c: Buffer) => errChunks.push(c));
    child.once("error", (err) => reject(err));
    child.once("close", (code) => {
      if (code !== 0) {
        const msg = Buffer.concat(errChunks).toString("utf8").trim();
        reject(
          new Error(
            `ffmpeg exited with code ${code}${msg ? `: ${msg.slice(0, 400)}` : ""}`,
          ),
        );
        return;
      }
      const out = Buffer.concat(chunks);
      if (out.length === 0) {
        reject(new Error("ffmpeg produced 0 bytes"));
        return;
      }
      resolve(out);
    });
  });
}

async function encodeThumb(
  bytes: Buffer,
  destPath: string,
  maxSide: number,
  format: "webp" | "jpeg" | "png",
  quality: number,
): Promise<ThumbnailResult> {
  const pipeline = sharp(bytes).resize({
    width: maxSide,
    height: maxSide,
    fit: "inside",
    withoutEnlargement: true,
  });
  const out = await applyFormat(pipeline, format, quality).toFile(destPath);
  return { width: out.width, height: out.height, bytes: out.size };
}

async function writePlaceholder(
  destPath: string,
  reason: string,
): Promise<ThumbnailResult> {
  const fs = await import("node:fs/promises");
  const buf = await placeholderThumbBytes();
  await fs.writeFile(destPath, buf);
  // eslint-disable-next-line no-console
  console.warn(`[thumbnails] video thumb fell back to placeholder: ${reason}`);
  return { width: 1, height: 1, bytes: buf.byteLength };
}

/**
 * `ThumbnailServicePort`-shaped adapter that wraps `generateVideoThumbnail`
 * for the JobRunner. JobRunner imports the port type from `@imagent/core`;
 * persistence implements it without coupling the runner to ffmpeg-static.
 */
export const videoThumbnailService = {
  async generateForVideo(
    srcPath: string,
    destPath: string,
  ): Promise<{ ok: true } | { ok: false; reason: string }> {
    try {
      await generateVideoThumbnail(srcPath, destPath);
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        reason: (err as Error)?.message ?? String(err),
      };
    }
  },
};

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
