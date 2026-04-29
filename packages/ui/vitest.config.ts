import { defineConfig } from "vitest/config";

/**
 * Smoke-test runner for `packages/ui` composites. We deliberately do NOT
 * pull in jsdom / @testing-library — neither is in the workspace today.
 * Tests render via `react-dom/server` (already a dep) and assert on the
 * resulting HTML string. That's enough surface for smoke-level "renders 5
 * items in the right order" assertions; full DOM tests come later when we
 * add an interaction harness.
 */
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    environment: "node",
    pool: "forks",
  },
});
