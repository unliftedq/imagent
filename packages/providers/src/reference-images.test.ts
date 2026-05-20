import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { guessImageMimeType, referenceFilename, resolveImageUrlInput } from "./reference-images.js";

describe("reference image helpers", () => {
  it("extracts filenames across path formats and falls back from MIME type", () => {
    expect(referenceFilename("/tmp/reference.png", "image/png")).toBe("reference.png");
    expect(referenceFilename("C:\\tmp\\reference.jpg", "image/jpeg")).toBe("reference.jpg");
    expect(referenceFilename("/", "image/webp")).toBe("reference.webp");
    expect(referenceFilename("", "image/jpeg")).toBe("reference.jpg");
  });

  it("detects MIME type from extensions before falling back to signatures", () => {
    expect(guessImageMimeType("a.jpeg")).toBe("image/jpeg");
    expect(guessImageMimeType("a.webp")).toBe("image/webp");
    expect(guessImageMimeType("a.gif")).toBe("image/gif");
    expect(guessImageMimeType("a.png")).toBe("image/png");
  });

  it("detects JPEG and PNG byte signatures when extensions are unknown", () => {
    expect(guessImageMimeType("unknown", new Uint8Array([0xff, 0xd8, 0xff]))).toBe("image/jpeg");
    expect(guessImageMimeType("unknown", new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(
      "image/png",
    );
    expect(guessImageMimeType("unknown", new Uint8Array([0]))).toBe("image/png");
  });

  it("resolves image-url inputs while preserving URLs and asset ids", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "imagent-reference-images-"));
    try {
      const png = path.join(dir, "reference.png");
      await writeFile(png, new Uint8Array([0x89, 0x50, 0x4e, 0x47]));

      await expect(resolveImageUrlInput("https://example.com/ref.png", "test")).resolves.toBe(
        "https://example.com/ref.png",
      );
      await expect(resolveImageUrlInput("data:image/png;base64,iVBORw==", "test")).resolves.toBe(
        "data:image/png;base64,iVBORw==",
      );
      await expect(resolveImageUrlInput("asset-id-123", "test")).resolves.toBe("asset-id-123");
      await expect(resolveImageUrlInput(png, "test")).resolves.toBe(
        "data:image/png;base64,iVBORw==",
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
