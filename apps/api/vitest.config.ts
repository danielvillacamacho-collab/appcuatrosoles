import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.spec.ts"],
    coverage: {
      provider: "v8",
      thresholds: { lines: 50, statements: 50, branches: 50, functions: 50 },
    },
  },
});
