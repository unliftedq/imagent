import { defineConfig } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Preload process — runs in a privileged-but-isolated context. Bundles to
 * a single CJS file. Workspace deps (`@imagine/ipc`) are inlined so
 * the preload can call `createPreloadBridge` without resolving relative
 * imports at runtime.
 */
export default defineConfig({
  build: {
    lib: {
      entry: path.resolve(__dirname, "src/preload/preload.ts"),
      formats: ["cjs"],
      fileName: () => "preload.cjs",
    },
    outDir: path.resolve(__dirname, "dist/main"),
    emptyOutDir: false,
    sourcemap: true,
    target: "node20",
    minify: false,
    rollupOptions: {
      external: ["electron", /^node:/],
    },
  },
});
