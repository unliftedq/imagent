#!/usr/bin/env node
// Build apps/desktop/assets/imagent-macos.png and imagent.icns from the
// canonical artwork in apps/desktop/assets/imagent.png.
//
// Process:
//   1. Trim `imagent.png` against its white background to the tight
//      content bounding box (no scaling of the artwork itself).
//   2. Build an 824×824 rounded-rect white tile using Apple's continuous
//      corner ratio (corner radius ≈ 22.5% of the tile, i.e. 185 px).
//   3. Center the trimmed artwork on top of that tile.
//   4. Extend with 100 px of fully transparent padding per side, giving
//      a 1024×1024 canvas. This matches Apple's macOS Big Sur+ App Icon
//      Template (live area 824, transparent margin ≈ 9.77% per side).
//      Reference: Apple HIG — App Icons (macOS).
//   5. Emit an .iconset with every required size and run `iconutil` to
//      produce imagent.icns.
//
// Requirements: macOS (`iconutil`) and ImageMagick 7 (`magick`).

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS = resolve(__dirname, "..", "assets");
const SRC = join(ASSETS, "imagent.png");
const OUT_PNG = join(ASSETS, "imagent-macos.png");
const OUT_ICNS = join(ASSETS, "imagent.icns");

if (!existsSync(SRC)) {
  console.error(`Source not found: ${SRC}`);
  process.exit(1);
}

// Apple macOS App Icon Template (Big Sur+):
//   Canvas 1024 × 1024, live area 824 × 824, margin 100 px per side.
//   The tile's rounded-rect corner radius is ~22.5% of the tile width.
const CANVAS = 1024;
const LIVE_AREA = 824;
const CORNER_RADIUS = 185; // 824 * 0.2247 ≈ 185, matches Apple's template.
// Background color of the live area. The source artwork is composed on a
// near-white field; we normalize to pure white so the padded tile stays
// consistent at every render size.
const LIVE_BG = "white";
// Fuzz tolerance used by `-trim` to recognize the existing off-white
// background (#FEFEFE / #FEFEFF) when cropping to content bounds.
const TRIM_FUZZ = "3%";

const work = mkdtempSync(join(tmpdir(), "imagent-icon-"));
const iconset = join(work, "imagent.iconset");
const composite = join(work, "imagent-macos.png");

function run(cmd, args) {
  execFileSync(cmd, args, { stdio: ["ignore", "inherit", "inherit"] });
}

console.log("[icon] source", SRC);

// Build the full icon in one `magick` invocation so the working colorspace
// stays sRGB end-to-end (writing intermediate PNGs makes IM auto-encode the
// pure white + transparent tile as Grayscale, which then desaturates the
// colored artwork during composite).
//
// Pipeline:
//   - Read the source artwork, force sRGB+alpha, fuzz-trim its white
//     background to the tight content bbox, then shrink-only into the
//     LIVE_AREA box (no upscaling of the original).
//   - Build the rounded-rect white tile in a parenthesized sub-stack and
//     composite the trimmed artwork on top, centered.
//   - Extend to the 1024 canvas with a fully transparent margin.
run("magick", [
  "(",
  SRC,
  "-colorspace",
  "sRGB",
  "-alpha",
  "set",
  "-fuzz",
  TRIM_FUZZ,
  "-trim",
  "+repage",
  "-resize",
  `${LIVE_AREA}x${LIVE_AREA}>`,
  ")",
  "(",
  "-size",
  `${LIVE_AREA}x${LIVE_AREA}`,
  "xc:none",
  "-colorspace",
  "sRGB",
  "-fill",
  LIVE_BG,
  "-draw",
  `roundrectangle 0,0 ${LIVE_AREA - 1},${LIVE_AREA - 1} ${CORNER_RADIUS},${CORNER_RADIUS}`,
  ")",
  // Stack order: artwork first, tile second. Swap to draw tile under art.
  "+swap",
  "-gravity",
  "center",
  "-composite",
  "-background",
  "none",
  "-extent",
  `${CANVAS}x${CANVAS}`,
  "-define",
  "png:color-type=6",
  composite,
]);

// 2. Promote to the canonical PNG asset.
run("magick", [composite, OUT_PNG]);
console.log("[icon] wrote", OUT_PNG);

// 3. Generate .iconset with every required size, then convert to .icns.
run("mkdir", ["-p", iconset]);
const sizes = [
  [16, "icon_16x16.png"],
  [32, "icon_16x16@2x.png"],
  [32, "icon_32x32.png"],
  [64, "icon_32x32@2x.png"],
  [128, "icon_128x128.png"],
  [256, "icon_128x128@2x.png"],
  [256, "icon_256x256.png"],
  [512, "icon_256x256@2x.png"],
  [512, "icon_512x512.png"],
  [1024, "icon_512x512@2x.png"],
];
for (const [size, name] of sizes) {
  run("magick", [
    composite,
    "-resize",
    `${size}x${size}`,
    "-define",
    "png:color-type=6",
    join(iconset, name),
  ]);
}
run("iconutil", ["-c", "icns", "-o", OUT_ICNS, iconset]);
console.log("[icon] wrote", OUT_ICNS);

// 4. Clean up.
rmSync(work, { recursive: true, force: true });
