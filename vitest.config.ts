import { defineConfig } from "vitest/config";

// Root configuration used to run the whole workspace test suite with a single,
// merged coverage report (see the `test:coverage` script). Each referenced
// project keeps its own vitest.config.ts; this file only aggregates them and
// configures coverage collection and the non-regression thresholds enforced in CI.
export default defineConfig({
  test: {
    projects: [
      "packages/config",
      "packages/core",
      "packages/ipc",
      "packages/persistence",
      "packages/providers",
      "apps/cli",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "json-summary", "json"],
      reportsDirectory: "./coverage",
      include: [
        "packages/config/src/**",
        "packages/core/src/**",
        "packages/ipc/src/**",
        "packages/persistence/src/**",
        "packages/providers/src/**",
        "apps/cli/src/**",
      ],
      exclude: ["**/*.test.ts", "**/*.d.ts", "**/dist/**", "**/node_modules/**"],
      // Non-regression floor based on the current measured coverage. CI fails
      // if overall coverage drops below these values. Raise them as coverage
      // improves so it can never silently fall.
      thresholds: {
        statements: 47,
        branches: 41,
        functions: 52,
        lines: 48,
      },
    },
  },
});
