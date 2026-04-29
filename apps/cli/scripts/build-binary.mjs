#!/usr/bin/env node
/**
 * Build the single-file CLI binary `imagine.exe` (or `imagine` on POSIX) via
 * Node SEA. Steps mirror Node's official SEA recipe:
 *
 *   1. tsc -b              (already run by the calling `bun run build:binary`).
 *   2. esbuild dist/index.js → dist/imagine.bundle.cjs (single-file CJS).
 *   3. node --experimental-sea-config sea-config.json → dist/imagine.blob.
 *   4. Copy the host node binary to dist/imagine.exe.
 *   5. signtool remove (Windows, best-effort).
 *   6. postject inject the blob.
 *
 * Native modules (`better-sqlite3`, `sharp`) are NOT bundled — they remain as
 * `require()` calls and the binary expects them in an adjacent `node_modules/`.
 * v1 ships the binary alongside the workspace's installed `node_modules/`;
 * the CLI README covers the layout. (workplan.md §1 M8.)
 *
 * If any step fails irrecoverably on Windows native-modules, we fall back to
 * just shipping `dist/imagine.cjs` and printing instructions to invoke it as
 * `node dist/imagine.cjs <args>`.
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(cliRoot, "..", "..");
const distDir = path.join(cliRoot, "dist");

function run(cmd, args, opts = {}) {
  const cwd = opts.cwd ?? cliRoot;
  // Quote any arg containing spaces. Required because we run with shell=true
  // on Windows so .cmd shims (npx.cmd) work.
  const useShell = opts.shell ?? process.platform === "win32";
  const quote = (s) => (useShell && /\s/.test(s) ? `"${s}"` : s);
  const quotedCmd = quote(cmd);
  const quotedArgs = args.map(quote);
  console.log(
    `\n$ ${quotedCmd} ${quotedArgs.join(" ")}\n  (cwd=${path.relative(repoRoot, cwd) || "."})`,
  );
  const result = spawnSync(quotedCmd, quotedArgs, {
    stdio: "inherit",
    cwd,
    shell: useShell,
    env: { ...process.env, ...(opts.env ?? {}) },
  });
  if (result.status !== 0) {
    throw new Error(`'${cmd} ${args.join(" ")}' exited with status ${result.status}`);
  }
}

function isWindows() {
  return process.platform === "win32";
}

function exeName() {
  return isWindows() ? "imagine.exe" : "imagine";
}

async function main() {
  if (!existsSync(distDir)) {
    mkdirSync(distDir, { recursive: true });
  }

  // 1. esbuild bundle. better-sqlite3 + sharp + ffmpeg-static stay external
  // (native modules can't be embedded in SEA; they resolve via require() at
  // runtime against a sibling node_modules/).
  const entry = path.join(distDir, "index.js");
  if (!existsSync(entry)) {
    throw new Error(
      `expected ${entry} — run 'tsc -b' first (build:binary depends on build).`,
    );
  }
  const bundle = path.join(distDir, "imagine.bundle.cjs");
  // Run the esbuild shim from the workspace root so its `import "esbuild"`
  // resolves against the hoisted root node_modules/.
  // Banner: under Node SEA, the embedder's `require()` only resolves builtins
  // (e.g. \`require("fs")\` works but \`require("better-sqlite3")\` doesn't).
  // We patch the bundle to fall back to filesystem resolution via
  // \`module.createRequire()\` rooted at the .exe's directory. This lets the
  // binary find native modules in an adjacent \`node_modules/\`. Without this,
  // SEA throws \`No such built-in module: better-sqlite3\`.
  // Banner injected at the top of the bundle. Under Node SEA the embedder's
  // `require()` only resolves builtins, so we rebind `require` to a
  // `createRequire` rooted at the first ancestor of the .exe that contains a
  // `node_modules/better-sqlite3`. Falls back to the embedder require if the
  // probe can't find a sibling node_modules (rare; signals a broken install).
  // We also probe the workspace's `packages/persistence/node_modules` because
  // Bun-style hoisting puts the native modules under that workspace.
  const seaRequireBanner =
    "// imagine-studio CLI bundle (Node SEA)\n" +
    "var __seaRequire;try{var __sea=require('node:sea');" +
    "if(__sea&&__sea.isSea&&__sea.isSea()){" +
    "var __mod=require('node:module');var __path=require('node:path');" +
    "var __fs=require('node:fs');" +
    // Probe ancestors for either a direct node_modules/better-sqlite3 or a
    // workspace whose packages/persistence/node_modules has it. Stop on the
    // first match; otherwise leave require unwrapped.
    "var __probeRoots=function(start){" +
    "var d=start;for(var i=0;i<12;i++){" +
    "var direct=__path.join(d,'node_modules','better-sqlite3');" +
    "if(__fs.existsSync(direct))return d;" +
    "var ws=__path.join(d,'packages','persistence','node_modules','better-sqlite3');" +
    "if(__fs.existsSync(ws))return __path.join(d,'packages','persistence');" +
    "var n=__path.dirname(d);if(n===d)return null;d=n;}return null;};" +
    "var __root=__probeRoots(__path.dirname(process.execPath));" +
    "if(__root){" +
    "__seaRequire=__mod.createRequire(__path.join(__root,'package.json'));" +
    "var __origRequire=require;require=function(id){" +
    "try{return __seaRequire(id);}catch(e){" +
    "try{return __origRequire(id);}catch(e2){throw e;}}};" +
    "}" +
    "}}catch(e){}";
  const esbuildShim = `
import * as esbuild from "esbuild";
await esbuild.build({
  entryPoints: ["${entry.replace(/\\/g, "\\\\")}"],
  outfile: "${bundle.replace(/\\/g, "\\\\")}",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  // Native + dynamic-load modules are kept external. The binary resolves
  // them via require() against node_modules/ adjacent to imagine.exe.
  external: [
    "better-sqlite3",
    "sharp",
    "ffmpeg-static",
    "node-gyp-build",
    "detect-libc",
  ],
  banner: { js: ${JSON.stringify(seaRequireBanner)} },
  logLevel: "info",
});
`;
  // Run from cliRoot so the shim's `import "esbuild"` resolves against
  // apps/cli/node_modules/esbuild.
  const shimPath = path.join(cliRoot, "node_modules", ".imagine-esbuild-shim.mjs");
  writeFileSync(shimPath, esbuildShim);
  run(process.execPath, [shimPath], { cwd: cliRoot });

  // 2. Generate the SEA blob. Per Node docs, run from the directory holding
  // the sea-config.json (paths inside it are relative to cwd).
  console.log("\n[sea] generating blob");
  run(process.execPath, ["--experimental-sea-config", "sea-config.json"]);

  // 3. Copy node executable.
  const target = path.join(distDir, exeName());
  console.log(`\n[sea] copying ${process.execPath} -> ${target}`);
  copyFileSync(process.execPath, target);

  // 4. Strip Windows signature so postject can replace the SEA section.
  if (isWindows()) {
    const signtool = spawnSync("signtool", ["remove", "/s", target], {
      stdio: "pipe",
      shell: true,
    });
    if (signtool.status === 0) {
      console.log("[sea] signtool: signature removed");
    } else {
      console.log(
        "[sea] signtool not found or no signature to remove — continuing",
      );
    }
  }

  // 5. Inject the blob.
  console.log("\n[sea] injecting blob via postject");
  const postjectArgs = [
    "postject",
    target,
    "NODE_SEA_BLOB",
    path.join(distDir, "imagine.blob"),
    "--sentinel-fuse",
    "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2",
  ];
  if (process.platform === "darwin") {
    postjectArgs.push("--macho-segment-name", "NODE_SEA");
  }
  run("npx", postjectArgs);

  console.log(`\n[sea] done → ${target}`);
}

main().catch(async (err) => {
  console.error("\n[sea] FAILED:", err.message);
  console.error("[sea] falling back to dist/imagine.cjs (run with: node dist/imagine.cjs <args>)");
  // Fallback: leave dist/imagine.bundle.cjs in place and copy it to imagine.cjs.
  try {
    const bundle = path.join(distDir, "imagine.bundle.cjs");
    if (existsSync(bundle)) {
      copyFileSync(bundle, path.join(distDir, "imagine.cjs"));
      console.error(`[sea] fallback bundle: ${path.join(distDir, "imagine.cjs")}`);
    }
  } catch (fallbackErr) {
    console.error("[sea] fallback copy failed:", fallbackErr);
  }
  process.exit(1);
});
