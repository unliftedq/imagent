#!/usr/bin/env node
import { chmodSync, cpSync, existsSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(cliRoot, "..", "..");
const distDir = path.join(cliRoot, "dist");
const bundleMapPath = path.join(distDir, "cli.js.map");
const licenseSource = path.join(repoRoot, "LICENSE");
const licenseTarget = path.join(distDir, "LICENSE");

const internalPackages = new Map([
  ["@imagent/config", path.join(repoRoot, "packages", "config", "src")],
  ["@imagent/core", path.join(repoRoot, "packages", "core", "src")],
  ["@imagent/persistence", path.join(repoRoot, "packages", "persistence", "src")],
  ["@imagent/providers", path.join(repoRoot, "packages", "providers", "src")],
]);

const bareImportPattern = /^(?![./]|[A-Za-z]:|node:).+/;

function resolveInternalImport(specifier) {
  for (const [packageName, sourceRoot] of internalPackages) {
    if (specifier === packageName) {
      return path.join(sourceRoot, "index.ts");
    }
    if (!specifier.startsWith(`${packageName}/`)) continue;

    const subpath = specifier.slice(packageName.length + 1);
    const candidates = [
      path.join(sourceRoot, `${subpath}.ts`),
      path.join(sourceRoot, `${subpath}.json`),
      path.join(sourceRoot, subpath, "index.ts"),
    ];
    const found = candidates.find((candidate) => existsSync(candidate));
    if (found) return found;
  }
  return null;
}

const internalWorkspacePlugin = {
  name: "internal-workspace-packages",
  setup(build) {
    build.onResolve({ filter: /.*/ }, (args) => {
      const internalPath = resolveInternalImport(args.path);
      if (internalPath) return { path: internalPath };

      if (bareImportPattern.test(args.path)) {
        return { path: args.path, external: true };
      }

      return null;
    });
  },
};

await esbuild.build({
  entryPoints: [path.join(cliRoot, "src", "index.ts")],
  outfile: path.join(distDir, "cli.js"),
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  plugins: [internalWorkspacePlugin],
  logLevel: "info",
});

rmSync(bundleMapPath, { force: true });

const migrationsSource = path.join(repoRoot, "packages", "persistence", "src", "migrations");
const migrationsTarget = path.join(distDir, "migrations");
rmSync(migrationsTarget, { recursive: true, force: true });
cpSync(migrationsSource, migrationsTarget, { recursive: true });
cpSync(licenseSource, licenseTarget);

try {
  chmodSync(path.join(distDir, "cli.js"), 0o755);
} catch {
  // Non-POSIX installs still run through the npm-generated shim.
}
