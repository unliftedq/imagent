import { promises as fs } from "node:fs";
import path from "node:path";
import type { ImageReference } from "@imagent/core";
import { ProviderRequestError } from "@imagent/core";
import { toFile } from "openai";

export interface LoadedImageReference {
  reference: ImageReference;
  filename: string;
  mimeType: string;
  bytes: Uint8Array<ArrayBuffer>;
  base64: string;
}

export async function loadImageReferences(
  references: readonly ImageReference[],
  vendorId: string,
): Promise<LoadedImageReference[]> {
  const loaded: LoadedImageReference[] = [];
  for (const reference of references) {
    try {
      const buf = await fs.readFile(reference.path);
      const bytes = new Uint8Array(
        buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
      );
      const mimeType = guessImageMimeType(reference.path, bytes);
      const filename = path.basename(reference.path);
      loaded.push({
        reference,
        filename: filename.length > 0 ? filename : fallbackFilenameForMime(mimeType),
        mimeType,
        bytes,
        base64: Buffer.from(bytes).toString("base64"),
      });
    } catch (err) {
      throw new ProviderRequestError(
        `could not read reference image '${reference.path}': ${(err as Error)?.message ?? String(err)}`,
        { vendorId, cause: err },
      );
    }
  }
  return loaded;
}

export async function openAIReferenceFiles(
  references: readonly LoadedImageReference[],
): Promise<unknown[]> {
  const files: unknown[] = [];
  for (const ref of references) {
    files.push(await toFile(Buffer.from(ref.bytes), ref.filename, { type: ref.mimeType }));
  }
  return files;
}

export function imageDataUrl(reference: LoadedImageReference): string {
  return `data:${reference.mimeType};base64,${reference.base64}`;
}

export function guessImageMimeType(filePath: string, bytes?: Uint8Array): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".png":
      return "image/png";
    default:
      if (bytes?.[0] === 0xff && bytes?.[1] === 0xd8) return "image/jpeg";
      if (
        bytes?.[0] === 0x89 &&
        bytes?.[1] === 0x50 &&
        bytes?.[2] === 0x4e &&
        bytes?.[3] === 0x47
      ) {
        return "image/png";
      }
      return "image/png";
  }
}

function fallbackFilenameForMime(mimeType: string): string {
  switch (mimeType) {
    case "image/jpeg":
      return "reference.jpg";
    case "image/webp":
      return "reference.webp";
    case "image/gif":
      return "reference.gif";
    default:
      return "reference.png";
  }
}
