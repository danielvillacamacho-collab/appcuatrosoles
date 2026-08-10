import { defineConfig } from "vitest/config";

// Umbral de packages/domain: 85% (docs/05-testing-strategy.md §2).
export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      thresholds: {
        lines: 85,
        statements: 85,
        branches: 80,
        functions: 85,
      },
    },
  },
});
