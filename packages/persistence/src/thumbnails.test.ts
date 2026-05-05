import { EventEmitter } from "node:events";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
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
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "imagent-thumb-"));
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

  it("generateVideoThumbnail invokes ffmpeg with -ss/-frames:v and pipes mjpeg through sharp", async () => {
    const dst = path.join(tmpDir, "video-thumb.webp");
    // Pre-bake a known JPEG that ffmpeg "would" emit, so we can verify the
    // sharp pipeline actually transforms what came over stdout.
    const fakeFrame = await sharp({
      create: {
        width: 1280,
        height: 720,
        channels: 3,
        background: { r: 200, g: 100, b: 50 },
      },
    })
      .jpeg({ quality: 90 })
      .toBuffer();

    const seenArgs: string[][] = [];
    const fakeSpawn = ((_bin: string, args: readonly string[]) => {
      seenArgs.push([...args]);
      const child = new EventEmitter() as EventEmitter & {
        stdout: Readable;
        stderr: Readable;
      };
      child.stdout = Readable.from([fakeFrame]);
      child.stderr = Readable.from([]);
      // Wait for both streams to end, then emit close(0).
      let done = 0;
      const check = (): void => {
        done += 1;
        if (done >= 2) child.emit("close", 0);
      };
      child.stdout.once("end", check);
      child.stderr.once("end", check);
      return child as unknown as ReturnType<typeof import("node:child_process").spawn>;
    }) as unknown as typeof import("node:child_process").spawn;

    const result = await generateVideoThumbnail(
      path.join(tmpDir, "fake.mp4"),
      dst,
      {
        ffmpegPath: "fake-ffmpeg.exe",
        spawnFn: fakeSpawn,
        maxSide: 256,
      },
    );

    expect(seenArgs).toHaveLength(1);
    const args = seenArgs[0]!;
    expect(args).toContain("-ss");
    expect(args).toContain("-frames:v");
    expect(args).toContain("image2pipe");
    expect(args).toContain("mjpeg");
    expect(result.width).toBeLessThanOrEqual(256);
    expect(result.height).toBeLessThanOrEqual(256);
    // 1280x720 fits inside a 256 box → width should be the longer side.
    expect(result.width).toBeGreaterThan(result.height);
    expect(result.bytes).toBeGreaterThan(0);

    // Output is a real webp file.
    const meta = await sharp(dst).metadata();
    expect(meta.format).toBe("webp");
  });

  it("generateVideoThumbnail retries with seek=0 when initial seek fails", async () => {
    const dst = path.join(tmpDir, "retry-thumb.webp");
    const fakeFrame = await sharp({
      create: { width: 320, height: 240, channels: 3, background: "#444" },
    })
      .jpeg()
      .toBuffer();

    let calls = 0;
    const fakeSpawn = ((_bin: string, args: readonly string[]) => {
      calls += 1;
      const child = new EventEmitter() as EventEmitter & {
        stdout: Readable;
        stderr: Readable;
      };
      const ssIdx = args.indexOf("-ss");
      const ssVal = ssIdx >= 0 ? args[ssIdx + 1] : "";
      let stdoutBuf: Buffer[];
      let stderrBuf: Buffer[];
      let exitCode: number;
      if (calls === 1 && ssVal !== "0") {
        // First attempt at non-zero seek "fails" (e.g. video shorter than 1s).
        stdoutBuf = [];
        stderrBuf = [Buffer.from("Seek to t=1 failed")];
        exitCode = 1;
      } else {
        stdoutBuf = [fakeFrame];
        stderrBuf = [];
        exitCode = 0;
      }
      child.stdout = Readable.from(stdoutBuf);
      child.stderr = Readable.from(stderrBuf);
      let done = 0;
      const check = (): void => {
        done += 1;
        if (done >= 2) child.emit("close", exitCode);
      };
      child.stdout.once("end", check);
      child.stderr.once("end", check);
      return child as unknown as ReturnType<typeof import("node:child_process").spawn>;
    }) as unknown as typeof import("node:child_process").spawn;

    const result = await generateVideoThumbnail(
      path.join(tmpDir, "short.mp4"),
      dst,
      { ffmpegPath: "fake.exe", spawnFn: fakeSpawn, maxSide: 128 },
    );
    expect(calls).toBe(2);
    expect(result.width).toBeLessThanOrEqual(128);
  });

  it("generateVideoThumbnail writes a placeholder webp when ffmpeg fails entirely", async () => {
    const dst = path.join(tmpDir, "placeholder.webp");
    const fakeSpawn = ((_bin: string, _args: readonly string[]) => {
      const child = new EventEmitter() as EventEmitter & {
        stdout: Readable;
        stderr: Readable;
      };
      child.stdout = Readable.from([] as Buffer[]);
      child.stderr = Readable.from([Buffer.from("invalid input")]);
      let done = 0;
      const check = (): void => {
        done += 1;
        if (done >= 2) child.emit("close", 1);
      };
      child.stdout.once("end", check);
      child.stderr.once("end", check);
      return child as unknown as ReturnType<typeof import("node:child_process").spawn>;
    }) as unknown as typeof import("node:child_process").spawn;

    const result = await generateVideoThumbnail(
      path.join(tmpDir, "broken.mp4"),
      dst,
      { ffmpegPath: "fake.exe", spawnFn: fakeSpawn },
    );
    // Placeholder is a 1×1 webp — caller still has a thumb path on disk.
    expect(result.width).toBe(1);
    expect(result.height).toBe(1);
    const meta = await sharp(dst).metadata();
    expect(meta.format).toBe("webp");
  });

  it("generateVideoThumbnail writes a placeholder when ffmpegPath is null", async () => {
    const dst = path.join(tmpDir, "missing-bin.webp");
    const result = await generateVideoThumbnail(
      path.join(tmpDir, "x.mp4"),
      dst,
      { ffmpegPath: null },
    );
    expect(result.bytes).toBeGreaterThan(0);
    const meta = await sharp(dst).metadata();
    expect(meta.format).toBe("webp");
  });
});
