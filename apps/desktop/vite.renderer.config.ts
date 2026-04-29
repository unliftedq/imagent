import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Vite externalizes any `import "node:*"` for browser builds — but our core
 * package's JobRunner statically imports `node:events`, even though the
 * renderer never *runs* it. Intercept those `node:*` specifiers and rewrite
 * to a locally-resolvable shim or polyfill so Rollup's static analysis
 * succeeds.
 */
function nodeProtocolShim(): Plugin {
  return {
    name: "imagine-studio:node-protocol-shim",
    enforce: "pre",
    async resolveId(source) {
      if (source === "node:events") {
        const r = await this.resolve("events", undefined, { skipSelf: true });
        return r ?? null;
      }
      if (source === "node:fs/promises") {
        return path.resolve(__dirname, "src/renderer/lib/empty-shim.ts");
      }
      return null;
    },
  };
}

/**
 * Renderer — standard Vite + React + Tailwind v4. Dev server runs on 5173;
 * the main process loads from http://localhost:5173 in dev and from a
 * file:// in production builds.
 */
export default defineConfig({
  root: path.resolve(__dirname, "src/renderer"),
  base: "./",
  plugins: [nodeProtocolShim(), react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  build: {
    outDir: path.resolve(__dirname, "dist/renderer"),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
