import { app } from "electron";
import path from "node:path";
import os from "node:os";
import { createPathResolver, type PathResolver } from "@imagine/persistence";

/**
 * Resolves the on-disk paths for the Electron app. We prefer `~/.imagine/`
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
  return createPathResolver(path.join(home, ".imagine"));
}
