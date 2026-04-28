/**
 * Thumbnail generation. The image path uses `sharp` (M6 Assets). The video
 * path uses `ffmpeg-static` to grab a frame at 1s (M7 Video Studio). For now
 * the surface is typed; calls throw with their landing milestone.
 */
export interface ThumbnailRequest {
  sourcePath: string;
  destPath: string;
  /** Pixel width of the resulting WebP. Height auto from source aspect. */
  width?: number;
}

export async function generateImageThumbnail(_req: ThumbnailRequest): Promise<void> {
  throw new Error("not implemented (M2)");
}

export async function generateVideoThumbnail(_req: ThumbnailRequest): Promise<void> {
  throw new Error("not implemented (M7)");
}
