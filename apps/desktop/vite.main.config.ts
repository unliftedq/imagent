import { defineConfig } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Electron main process — emits ESM (.mjs) so Electron's embedded Node can
 * `import` workspace packages (which all ship as ESM under "type": "module").
 * Native modules (better-sqlite3, sharp) and workspace packages are kept
 * external — they're loaded from node_modules at runtime; the persistence
 * package's migration loader needs its `import.meta.url` to point at its own
 * dist/, so we must NOT inline it.
 */
export default defineConfig({
  build: {
    lib: {
      entry: path.resolve(__dirname, "src/main/main.ts"),
      formats: ["es"],
      fileName: () => "main.mjs",
    },
    outDir: path.resolve(__dirname, "dist/main"),
    emptyOutDir: false,
    sourcemap: true,
    target: "node20",
    minify: false,
    rollupOptions: {
      external: [
        "electron",
        "better-sqlite3",
        "sharp",
        // Node built-ins
        /^node:/,
        "fs",
        "path",
        "os",
        "url",
        "events",
        "child_process",
        "crypto",
        "util",
        "stream",
        "assert",
        // Workspace packages — keep external so persistence can still find
        // its migrations via import.meta.url.
        /^@imagent\//,
      ],
    },
  },
});
