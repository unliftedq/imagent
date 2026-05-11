import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPathResolver, type PathResolver } from "@imagent/persistence";
import { app } from "electron";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Resolves the on-disk paths for the Electron app. We prefer `~/.imagent/`
 * (matches the CLI) over Electron's `userData` so the same data is shared
 * between the GUI and the CLI binary.
 */
export function createDesktopPathResolver(): PathResolver {
  // The Electron app may run before app.getPath('home') is meaningful in
  // some lifecycle phases — `os.homedir()` is always safe.
  const home = (() => {
    try {
      return app.getPath("home");
    } catch {
      return os.homedir();
    }
  })();
  return createPathResolver(path.join(home, ".imagent"));
}

export function defaultCatalogAssetPath(): string {
  return path.resolve(__dirname, "..", "..", "assets", "catalog.default.json");
}
