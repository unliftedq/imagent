import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  generateImageThumbnail,
  generateImageThumbnailFromBuffer,
  generateVideoThumbnail,
  readImageMetadata,
} from "./thumbnails.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "imagine-thumb-"));
});
afterEach(async () => {
  // Sharp keeps file handles open briefly on Windows; retry transient EBUSY.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
      return;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EBUSY") return;
      await new Promise((r) => setTimeout(r, 50));
    }
  }
});

async function makeTestPng(filePath: string, width = 800, height = 600): Promise<void> {
  const buf = await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 30, g: 144, b: 255, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
  await fs.writeFile(filePath, buf);
}

describe("thumbnails", () => {
  it("generateImageThumbnail produces a smaller webp respecting maxSide", async () => {
    const src = path.join(tmpDir, "src.png");
    const dst = path.join(tmpDir, "thumb.webp");
    await makeTestPng(src, 1200, 800);

    const result = await generateImageThumbnail(src, dst, { maxSide: 256 });

    expect(result.width).toBeLessThanOrEqual(256);
    expect(result.height).toBeLessThanOrEqual(256);
    // Aspect preserved: width should still be the longer side.
    expect(result.width).toBeGreaterThan(result.height);
    expect(result.bytes).toBeGreaterThan(0);

    // Verify the destination file exists and is readable as webp.
    const meta = await sharp(dst).metadata();
    expect(meta.format).toBe("webp");
  });

  it("generateImageThumbnailFromBuffer round-trips through memory", async () => {
    const dst = path.join(tmpDir, "buf-thumb.webp");
    const buf = await sharp({
      create: { width: 400, height: 400, channels: 4, background: "#ff00aa" },
    })
      .png()
      .toBuffer();

    const result = await generateImageThumbnailFromBuffer(buf, dst, { maxSide: 128 });
    expect(result.width).toBeLessThanOrEqual(128);
    expect(result.height).toBeLessThanOrEqual(128);
    expect(result.bytes).toBeGreaterThan(0);
  });

  it("readImageMetadata returns dimensions for a known file", async () => {
    const src = path.join(tmpDir, "meta.png");
    await makeTestPng(src, 321, 123);
    const meta = await readImageMetadata(src);
    expect(meta.width).toBe(321);
    expect(meta.height).toBe(123);
    expect(meta.format).toBe("png");
  });

  it("generateVideoThumbnail throws (M7)", async () => {
    await expect(generateVideoThumbnail("a", "b")).rejects.toThrow(/M7/);
  });
});
